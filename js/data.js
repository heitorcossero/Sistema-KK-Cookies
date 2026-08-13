// Estado da aplicação, conexão com o Supabase e persistência (nuvem + local)
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_KEY } from "./config.js";
import { toast } from "./utils.js";

export const state = {
  itens: [],
  receitas: [],
  clientes: [],
  encomendas: [],
  historico: [],
  congelados: {},
  // Financeiro: a fonte da verdade do dinheiro. Estoque e encomendas não
  // alimentam estes números sozinhos — só o que for enviado de propósito.
  financeiro: [],
  recorrentes: [],
  config: {}
};

// Situação real da sincronia, não apenas "a biblioteca carregou".
// Vira true quando a nuvem responde e false quando uma operação falha.
export const conexao = { ok: false };

// Falha de gravação não é sinônimo de estar sem internet. Separar as duas
// coisas é o que faz o aviso ser levado a sério por quem está online.
export const estaOffline = () => globalThis.navigator?.onLine === false;

// Alterações que a nuvem não aceitou. Ficam numa chave própria do
// localStorage — separada do estado — porque o estado é substituído a cada
// carga da nuvem e a fila não pode ser levada junto.
const CHAVE_PENDENTES = `${STORAGE_KEY}_pendentes`;
// Retrato do que havia no aparelho antes da última carga da nuvem. É a rede
// de segurança para o caso de a nuvem devolver menos do que o aparelho tinha.
const CHAVE_ANTERIOR = `${STORAGE_KEY}_anterior`;

// Onde cada tabela mora dentro do estado. congelados e configuracoes ficam
// de fora porque são objetos-mapa, não listas.
const LISTAS = {
  itens: "itens",
  receitas: "receitas",
  clientes: "clientes",
  encomendas: "encomendas",
  historico: "historico",
  financeiro: "financeiro",
  recorrentes: "recorrentes"
};

let supabase = null;

export function initSupabase() {
  if (supabase) return supabase;
  try {
    const create = window.supabase?.createClient || window.supabaseJs?.createClient;
    if (create) {
      supabase = create(SUPABASE_URL, SUPABASE_KEY);
      return supabase;
    }
  } catch (e) {
    console.error("Falha ao iniciar Supabase:", e);
  }
  return null;
}

// ============================================================
// FILA DE PENDÊNCIAS
//
// Antes, uma gravação recusada pela nuvem só virava um aviso na tela: o dado
// ficava no aparelho e ninguém tentava de novo. Na abertura seguinte a nuvem
// (que não tinha aquilo) sobrescrevia o aparelho e o trabalho sumia. Agora
// toda falha entra nesta fila, é reaplicada por cima do que vem da nuvem e
// fica sendo tentada até entrar.
// ============================================================

export const pendentes = { lista: [] };

function chaveDaLinha(tabela, dados) {
  const id = dados?.id ?? dados?.receita_id ?? dados?.chave ?? "";
  return `${tabela}:${id}`;
}

function lerPendentes() {
  try {
    pendentes.lista = JSON.parse(localStorage.getItem(CHAVE_PENDENTES) || "[]");
  } catch {
    pendentes.lista = [];
  }
  return pendentes.lista;
}

function gravarPendentes() {
  try {
    localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(pendentes.lista));
  } catch (e) {
    console.error("Não foi possível guardar a fila de pendências:", e);
  }
}

// Uma pendência por linha: a mais nova substitui a anterior da mesma linha,
// senão a fila cresceria sem fim ao editar o mesmo insumo várias vezes.
// Um envio em lote é quebrado linha a linha pelo mesmo motivo.
function enfileirar(entrada) {
  lerPendentes();
  const novas = entrada.tipo === "apagar"
    ? [{ ...entrada, chave: `${entrada.tabela}:${entrada.id}` }]
    : (Array.isArray(entrada.dados) ? entrada.dados : [entrada.dados])
      .map(d => ({ tabela: entrada.tabela, dados: d, chave: chaveDaLinha(entrada.tabela, d) }));

  const chaves = new Set(novas.map(n => n.chave));
  pendentes.lista = pendentes.lista.filter(p => !chaves.has(p.chave));
  const quando = new Date().toISOString();
  novas.forEach(n => pendentes.lista.push({ ...n, quando }));
  gravarPendentes();
}

function desenfileirar(chaves) {
  const alvo = new Set(Array.isArray(chaves) ? chaves : [chaves]);
  pendentes.lista = pendentes.lista.filter(p => !alvo.has(p.chave));
  gravarPendentes();
}

export const totalPendentes = () => lerPendentes().length;

// Reaplica no estado o que ainda não subiu, por cima do que veio da nuvem.
// Sem isso, a tela mostraria o dado velho da nuvem logo depois de você ter
// digitado o novo.
function aplicarPendentes() {
  for (const p of lerPendentes()) {
    if (p.tipo === "apagar") {
      const lista = LISTAS[p.tabela];
      if (lista) state[lista] = state[lista].filter(x => x.id !== p.id);
      else if (p.tabela === "congelados") delete state.congelados[p.id];
      continue;
    }
    const linhas = Array.isArray(p.dados) ? p.dados : [p.dados];
    for (const d of linhas) {
      if (p.tabela === "congelados") {
        state.congelados[d.receita_id] = Number(d.quantidade) || 0;
      } else if (p.tabela === "configuracoes") {
        state.config[d.chave] = d.valor;
      } else {
        const lista = LISTAS[p.tabela];
        if (!lista) continue;
        const i = state[lista].findIndex(x => x.id === d.id);
        if (i >= 0) state[lista][i] = { ...state[lista][i], ...d };
        else state[lista].push(d);
      }
    }
  }
}

// Tenta subir tudo que está na fila. Devolve quantas entraram e quantas
// continuam presas.
export async function sincronizarPendentes({ silencioso = true } = {}) {
  const s = initSupabase();
  lerPendentes();
  if (!s || !pendentes.lista.length) return { enviadas: 0, presas: pendentes.lista.length };

  let enviadas = 0;
  for (const p of [...pendentes.lista]) {
    try {
      const { error } = p.tipo === "apagar"
        ? await s.from(p.tabela).delete().eq(p.coluna || "id", p.id)
        : await s.from(p.tabela).upsert((Array.isArray(p.dados) ? p.dados : [p.dados]).map(paraBanco));
      if (error) {
        conexao.ok = false;
        console.error(`Pendência presa em "${p.tabela}":`, error);
        continue;
      }
      desenfileirar(p.chave);
      enviadas++;
    } catch (err) {
      conexao.ok = false;
      console.error("Falha ao reenviar pendência:", err);
      break; // sem rede: não adianta insistir nas outras agora
    }
  }
  if (enviadas) conexao.ok = true;
  if (!silencioso && enviadas) toast(`${enviadas} alteração(ões) enviada(s) para a nuvem.`);
  return { enviadas, presas: pendentes.lista.length };
}

// ============================================================
// CARGA
// ============================================================

export async function carregar() {
  // 1. Fallback local (permite abrir o app sem internet)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      Object.assign(state, JSON.parse(raw));
      // Cópia salva antes do preço por cookie existir: converte a partir do
      // preço do lote, senão a receita apareceria valendo zero offline.
      state.receitas.forEach(r => {
        if (!(Number(r.precoUnitario) > 0)) {
          r.precoUnitario = (Number(r.precoVenda) / (Number(r.rendimento) || 1)) || 0;
        }
      });
    } catch (e) { console.error(e); }
  }

  // 2. Nuvem
  const s = initSupabase();
  if (!s) { aplicarPendentes(); return; }
  try {
    const [it, cl, rec, enc, hist, cong, fin, recor, conf] = await Promise.all([
      s.from("itens").select("*"),
      s.from("clientes").select("*"),
      s.from("receitas").select("*"),
      s.from("encomendas").select("*"),
      // O histórico alimenta o extrato, o gráfico e o faturamento acumulado.
      // Com um teto baixo, lançamentos antigos sumiam da soma e o faturamento
      // encolhia sozinho com o tempo.
      s.from("historico").select("*").order("quando", { ascending: false }).limit(2000),
      s.from("congelados").select("*"),
      s.from("financeiro").select("*").order("data", { ascending: false }).limit(5000),
      s.from("recorrentes").select("*"),
      s.from("configuracoes").select("*")
    ]);

    // Uma consulta recusada devolve error e data nula — ela NÃO estoura.
    // Antes o código só olhava data, então uma tabela que falhou passava por
    // "veio vazia" e limpava o que havia no aparelho.
    const falhas = [];
    const veio = (r, nome) => {
      if (r.error) { falhas.push(nome); console.error(`Erro ao ler "${nome}":`, r.error); return false; }
      return Array.isArray(r.data);
    };

    if (veio(it, "itens")) {
      state.itens = it.data.map(i => ({ ...i, custoMedio: Number(i.custo_medio), estoqueMinimo: Number(i.estoque_minimo), quantidade: Number(i.quantidade) }));
    }
    if (veio(cl, "clientes")) state.clientes = cl.data.map(c => ({ ...c, ultimaConversa: c.ultima_conversa }));
    // Receita antiga só tem o preço do lote: o preço por cookie sai da divisão,
    // que é exatamente a conta que o sistema fazia antes de existir a coluna.
    if (veio(rec, "receitas")) state.receitas = rec.data.map(r => ({
      ...r,
      precoVenda: Number(r.preco_venda),
      rendimento: Number(r.rendimento),
      precoUnitario: Number(r.preco_unitario) || (Number(r.preco_venda) / (Number(r.rendimento) || 1)) || 0
    }));
    if (veio(enc, "encomendas")) state.encomendas = enc.data.map(e => ({ ...e, valorTotal: Number(e.valor_total), clienteId: e.cliente_id, dataEntrega: e.data_entrega }));
    if (veio(hist, "historico")) state.historico = hist.data;
    if (veio(cong, "congelados")) {
      state.congelados = {};
      cong.data.forEach(c => { state.congelados[c.receita_id] = Number(c.quantidade); });
    }
    if (veio(fin, "financeiro")) state.financeiro = fin.data.map(l => ({ ...l, valor: Number(l.valor) }));
    if (veio(recor, "recorrentes")) state.recorrentes = recor.data.map(r => ({ ...r, valor: Number(r.valor), dia: Number(r.dia) }));
    if (veio(conf, "configuracoes")) {
      state.config = {};
      conf.data.forEach(c => { state.config[c.chave] = c.valor; });
    }

    // O que ainda não subiu manda mais do que a nuvem: é o que você digitou.
    aplicarPendentes();

    conexao.ok = falhas.length === 0;
    if (falhas.length) toast(`A nuvem recusou a leitura de: ${falhas.join(", ")}.`, true);

    // Guarda o retrato anterior antes de substituir a cópia do aparelho.
    if (raw) { try { localStorage.setItem(CHAVE_ANTERIOR, raw); } catch { } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    conexao.ok = false;
    console.error("Erro ao carregar da nuvem:", err);
    aplicarPendentes();
  }
}

// Converte as chaves camelCase do estado para snake_case do banco
function paraBanco(d) {
  const obj = { ...d };
  if (obj.custoMedio !== undefined) { obj.custo_medio = Number(obj.custoMedio); delete obj.custoMedio; }
  if (obj.estoqueMinimo !== undefined) { obj.estoque_minimo = Number(obj.estoqueMinimo); delete obj.estoqueMinimo; }
  if (obj.ultimaConversa !== undefined) { obj.ultima_conversa = obj.ultimaConversa || null; delete obj.ultimaConversa; }
  if (obj.clienteId !== undefined) { obj.cliente_id = obj.clienteId || null; delete obj.clienteId; }
  if (obj.valorTotal !== undefined) { obj.valor_total = Number(obj.valorTotal); delete obj.valorTotal; }
  if (obj.dataEntrega !== undefined) { obj.data_entrega = obj.dataEntrega || null; delete obj.dataEntrega; }
  if (obj.receitaId !== undefined) { obj.receita_id = obj.receitaId || null; delete obj.receitaId; }
  if (obj.precoVenda !== undefined) { obj.preco_venda = Number(obj.precoVenda); delete obj.precoVenda; }
  if (obj.precoUnitario !== undefined) { obj.preco_unitario = Number(obj.precoUnitario); delete obj.precoUnitario; }
  if (obj.itemId !== undefined) { obj.item_id = obj.itemId || null; delete obj.itemId; }
  if (obj.detalhesIngredientes !== undefined) { obj.detalhes_ingredientes = obj.detalhesIngredientes; delete obj.detalhesIngredientes; }
  if (obj.criado_at !== undefined) { obj.created_at = obj.criado_at; delete obj.criado_at; }
  // Campo legado: nunca chegou a ser usado no cálculo e não existe no banco.
  // O sistema não escreve mais nele, mas dados antigos guardados no aparelho
  // ainda podem trazê-lo — sem esta limpeza, o upsert quebraria.
  delete obj.pesoMedia;
  return obj;
}

// Devolve { ok, erro } para quem precisa saber se realmente entrou.
export async function salvar(tabela = null, dados = null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const s = initSupabase();
  if (!tabela || !dados) return { ok: true };
  if (!s) {
    // Sem a biblioteca, antes o sistema saía calado e o dado ficava só aqui
    // sem ninguém saber. Agora entra na fila como qualquer outra falha.
    enfileirar({ tabela, dados });
    conexao.ok = false;
    return { ok: false, erro: "sem-biblioteca" };
  }
  try {
    const payload = (Array.isArray(dados) ? dados : [dados]).map(paraBanco);
    const { error } = await s.from(tabela).upsert(payload);
    if (error) {
      conexao.ok = false;
      enfileirar({ tabela, dados });
      console.error("Erro de sincronia com o Supabase:", error);
      toast(`A nuvem recusou (${tabela}). Guardado no aparelho e será reenviado.`, true);
      return { ok: false, erro: error };
    }
    conexao.ok = true;
    desenfileirar((Array.isArray(dados) ? dados : [dados]).map(d => chaveDaLinha(tabela, d)));
    return { ok: true };
  } catch (err) {
    conexao.ok = false;
    enfileirar({ tabela, dados });
    console.error("Erro de conexão com o Supabase:", err);
    // "Sem conexão" era o texto de antes, e ele mentia: esta parte também
    // dispara com a internet funcionando (servidor fora do ar, sessão vencida).
    // O usuário leu "sem conexão", viu que estava online e ignorou o aviso.
    toast(estaOffline()
      ? "Sem internet — guardado no aparelho e será reenviado."
      : "Não consegui falar com a nuvem — guardado no aparelho e será reenviado.", true);
    return { ok: false, erro: err };
  }
}

// `coluna` existe porque nem toda tabela usa "id" como chave: congelados é
// identificada por receita_id.
export async function apagarDaNuvem(tabela, id, coluna = "id") {
  const s = initSupabase();
  if (!s) { enfileirar({ tipo: "apagar", tabela, id, coluna }); return { ok: false }; }
  try {
    const { error } = await s.from(tabela).delete().eq(coluna, id);
    if (error) {
      // Exclusão perdida é tão grave quanto gravação perdida: sem a fila, a
      // linha apagada voltava à tela na próxima abertura.
      conexao.ok = false;
      enfileirar({ tipo: "apagar", tabela, id, coluna });
      console.error("Erro ao apagar na nuvem:", error);
      return { ok: false, erro: error };
    }
    conexao.ok = true;
    return { ok: true };
  } catch (err) {
    conexao.ok = false;
    enfileirar({ tipo: "apagar", tabela, id, coluna });
    console.error(err);
    return { ok: false, erro: err };
  }
}

export function calcularCustoReceita(r) {
  return (r.ingredientes || []).reduce((acc, ing) => {
    const item = state.itens.find(i => i.id === ing.itemId);
    return acc + (Number(ing.quantidade) * (item?.custoMedio || 0));
  }, 0);
}

// ============================================================
// BACKUP E MIGRAÇÃO
// ============================================================

// Envia todo o estado local para a nuvem e diz, tabela por tabela, o que
// entrou. Antes devolvia só "deu certo/deu errado" e o erro ficava escondido.
export async function migrarParaNuvem() {
  const s = initSupabase();
  if (!s) { toast("A conexão com a nuvem não carregou nesta aba.", true); return { ok: false, falhas: ["conexão"] }; }

  const cong = Object.entries(state.congelados || {}).map(([receita_id, quantidade]) => ({ receita_id, quantidade }));
  const conf = Object.entries(state.config || {}).map(([chave, valor]) => ({ chave, valor }));
  const blocos = [
    ["itens", state.itens],
    ["clientes", state.clientes],
    ["receitas", state.receitas],
    ["encomendas", state.encomendas],
    ["historico", state.historico],
    ["congelados", cong],
    ["financeiro", state.financeiro],
    ["recorrentes", state.recorrentes],
    ["configuracoes", conf]
  ];

  const falhas = [];
  for (const [tabela, linhas] of blocos) {
    if (!linhas?.length) continue;
    // Em lotes: um upsert com centenas de linhas costuma estourar o limite
    // da requisição, e aí a tabela inteira falha por causa do tamanho.
    for (let i = 0; i < linhas.length; i += 100) {
      const r = await salvar(tabela, linhas.slice(i, i + 100));
      if (!r.ok) { falhas.push(tabela); break; }
    }
  }
  return { ok: falhas.length === 0, falhas };
}

// Cópia de segurança: tudo que existe no aparelho, num arquivo só.
export function montarBackup() {
  return {
    _app: "KK Cookies",
    _versao: 1,
    _quando: new Date().toISOString(),
    itens: state.itens,
    receitas: state.receitas,
    clientes: state.clientes,
    encomendas: state.encomendas,
    historico: state.historico,
    congelados: state.congelados,
    financeiro: state.financeiro,
    recorrentes: state.recorrentes,
    config: state.config
  };
}

// Restaura um backup por cima do estado atual e sobe tudo para a nuvem.
// `substituir` troca o conteúdo; sem ele, o que veio no arquivo é juntado ao
// que já existe (mesmo id = o do arquivo vence).
export async function restaurarBackup(dados, { substituir = false } = {}) {
  if (!dados || typeof dados !== "object") throw new Error("Arquivo inválido.");

  const juntar = (atual, novo) => {
    if (!Array.isArray(novo)) return atual;
    if (substituir) return novo;
    const mapa = new Map((atual || []).map(x => [x.id, x]));
    novo.forEach(x => mapa.set(x.id, { ...(mapa.get(x.id) || {}), ...x }));
    return [...mapa.values()];
  };

  state.itens = juntar(state.itens, dados.itens);
  state.receitas = juntar(state.receitas, dados.receitas);
  state.clientes = juntar(state.clientes, dados.clientes);
  state.encomendas = juntar(state.encomendas, dados.encomendas);
  state.historico = juntar(state.historico, dados.historico);
  state.financeiro = juntar(state.financeiro, dados.financeiro);
  state.recorrentes = juntar(state.recorrentes, dados.recorrentes);
  if (dados.congelados) state.congelados = substituir ? dados.congelados : { ...state.congelados, ...dados.congelados };
  if (dados.config) state.config = substituir ? dados.config : { ...state.config, ...dados.config };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return await migrarParaNuvem();
}
