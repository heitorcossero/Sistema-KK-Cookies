// Estado da aplicação, conexão com o Supabase e persistência (nuvem + local)
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_KEY } from "./config.js";
import { toast } from "./utils.js";

export const state = {
  itens: [],
  receitas: [],
  clientes: [],
  encomendas: [],
  historico: [],
  congelados: {}
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

export async function carregar() {
  // 1. Fallback local (permite abrir o app sem internet)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      Object.assign(state, JSON.parse(raw));
    } catch (e) { console.error(e); }
  }

  // 2. Nuvem
  const s = initSupabase();
  if (!s) return;
  try {
    const [it, cl, rec, enc, hist, cong] = await Promise.all([
      s.from("itens").select("*"),
      s.from("clientes").select("*"),
      s.from("receitas").select("*"),
      s.from("encomendas").select("*"),
      s.from("historico").select("*").order("quando", { ascending: false }).limit(100),
      s.from("congelados").select("*")
    ]);

    if (it.data) {
      state.itens = it.data.map(i => ({ ...i, custoMedio: Number(i.custo_medio), estoqueMinimo: Number(i.estoque_minimo), quantidade: Number(i.quantidade) }));
    }
    if (cl.data) state.clientes = cl.data.map(c => ({ ...c, ultimaConversa: c.ultima_conversa }));
    if (rec.data) state.receitas = rec.data.map(r => ({ ...r, precoVenda: Number(r.preco_venda), rendimento: Number(r.rendimento) }));
    if (enc.data) state.encomendas = enc.data.map(e => ({ ...e, valorTotal: Number(e.valor_total), clienteId: e.cliente_id, dataEntrega: e.data_entrega }));
    if (hist.data) state.historico = hist.data;
    if (cong.data) {
      state.congelados = {};
      cong.data.forEach(c => { state.congelados[c.receita_id] = Number(c.quantidade); });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Erro ao carregar da nuvem:", err);
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
  if (obj.itemId !== undefined) { obj.item_id = obj.itemId || null; delete obj.itemId; }
  if (obj.detalhesIngredientes !== undefined) { obj.detalhes_ingredientes = obj.detalhesIngredientes; delete obj.detalhesIngredientes; }
  if (obj.criado_at !== undefined) { obj.created_at = obj.criado_at; delete obj.criado_at; }
  // Campo legado: nunca chegou a ser usado no cálculo e não existe no banco.
  // O sistema não escreve mais nele, mas dados antigos guardados no aparelho
  // ainda podem trazê-lo — sem esta limpeza, o upsert quebraria.
  delete obj.pesoMedia;
  return obj;
}

export async function salvar(tabela = null, dados = null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const s = initSupabase();
  if (!s || !tabela || !dados) return;
  try {
    const payload = (Array.isArray(dados) ? dados : [dados]).map(paraBanco);
    const { error } = await s.from(tabela).upsert(payload);
    if (error) console.error("Erro de sincronia com o Supabase:", error);
  } catch (err) {
    console.error("Erro de conexão com o Supabase:", err);
    toast("Sem conexão — alteração salva só neste aparelho.", true);
  }
}

export async function apagarDaNuvem(tabela, id) {
  const s = initSupabase();
  if (s) {
    try {
      await s.from(tabela).delete().eq("id", id);
    } catch (err) { console.error(err); }
  }
}

export function calcularCustoReceita(r) {
  return (r.ingredientes || []).reduce((acc, ing) => {
    const item = state.itens.find(i => i.id === ing.itemId);
    return acc + (Number(ing.quantidade) * (item?.custoMedio || 0));
  }, 0);
}

// Envia todo o estado local para a nuvem (recuperação de dados offline)
export async function migrarParaNuvem() {
  const s = initSupabase();
  if (!s) { toast("Sem conexão com a nuvem.", true); return false; }
  try {
    if (state.itens.length) await salvar("itens", state.itens);
    if (state.clientes.length) await salvar("clientes", state.clientes);
    if (state.receitas.length) await salvar("receitas", state.receitas);
    if (state.encomendas.length) await salvar("encomendas", state.encomendas);
    if (state.historico.length) await salvar("historico", state.historico);
    const cong = Object.entries(state.congelados).map(([receita_id, quantidade]) => ({ receita_id, quantidade }));
    if (cong.length) await salvar("congelados", cong);
    return true;
  } catch (err) {
    console.error("Erro na migração:", err);
    return false;
  }
}
