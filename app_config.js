// Configurações do Supabase
const SUPABASE_URL = "https://wxhkizdgpvizhzibxgkt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aGtpemRncHZpemh6aWJ4Z2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg3NzcsImV4cCI6MjA5MTE4NDc3N30.X39g8gvk7Hb932vltuvANNGiKF7cZCoQsUHE1Mm7mtY";

let supabase = null;
const isSupabaseConfigured = SUPABASE_URL !== "SUA_URL_AQUI" && SUPABASE_KEY !== "SUA_CHAVE_AQUI";

if (isSupabaseConfigured) {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.error("Erro ao inicializar Supabase:", e);
  }
}

const STORAGE_KEY = "controle_estoque_v2";
const MARKUP_MEDIO_SIMPLIFICADO = 3.7;

function uid() { 
  return crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2); 
}

function normalizarEstado(data) {
  let itens = Array.isArray(data.itens) ? data.itens : [];
  let historico = Array.isArray(data.historico) ? data.historico : [];
  let receitas = Array.isArray(data.receitas) ? data.receitas : [];
  let encRaw = Array.isArray(data.encomendas) ? data.encomendas : [];
  let clientes = Array.isArray(data.clientes) ? data.clientes : [];

  const encomendas = encRaw.map((e) => {
    const st = e.status || {};
    const linhas = (Array.isArray(e.linhas) ? e.linhas : []).filter((l) => l && l.receitaId)
      .map((l) => ({ receitaId: l.receitaId, quantidade: Math.max(1, Math.floor(Number(l.quantidade) || 1)) }));
    return {
      id: e.id,
      clienteId: e.clienteId ?? e.cliente_id ?? null,
      titulo: String(e.titulo || "Sem título").slice(0, 200),
      dataEntrega: e.dataEntrega ?? e.data_entrega ?? "",
      linhas,
      status: { massaFeita: !!st.massaFeita, assado: !!st.assado, tudoPronto: !!st.tudoPronto, entregue: !!st.entregue, pago: !!st.pago },
      criadaEm: e.criadaEm ?? e.criada_at ?? new Date().toISOString(),
    };
  });

  return {
    itens: itens.map(i => ({ 
      ...i, 
      quantidade: Number(i.quantidade) || 0, 
      custoMedio: i.custoMedio ?? i.custo_medio ?? null, 
      estoqueMinimo: i.estoqueMinimo ?? i.estoque_minimo ?? null 
    })),
    historico: historico.map(h => ({ ...h, quando: h.quando || h.criado_at })),
    receitas: receitas.map(r => ({ 
      ...r, 
      precoVenda: Number(r.precoVenda ?? r.preco_venda) || null,
      ingredientes: Array.isArray(r.ingredientes) ? r.ingredientes : [] 
    })),
    encomendas,
    clientes: clientes.map(c => ({ 
      ...c, 
      criadaEm: c.criadaEm ?? c.criado_at,
      ultimaConversa: c.ultimaConversa ?? c.ultima_conversa ?? ""
    }))
  };
}

async function carregar() {
  if (!supabase) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizarEstado(raw ? JSON.parse(raw) : {});
    } catch { return normalizarEstado({}); }
  }

  try {
    const [it, cl, rec, enc, hist] = await Promise.all([
      supabase.from('itens').select('*'),
      supabase.from('clientes').select('*'),
      supabase.from('receitas').select('*'),
      supabase.from('encomendas').select('*'),
      supabase.from('historico').select('*').order('quando', { ascending: false }).limit(20)
    ]);

    return normalizarEstado({
      itens: it.data || [],
      clientes: cl.data || [],
      receitas: rec.data || [],
      encomendas: enc.data || [],
      historico: hist.data || []
    });
  } catch (err) {
    console.error("Erro ao carregar do Supabase:", err);
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizarEstado(raw ? JSON.parse(raw) : {});
  }
}

async function salvar(tabela, dados, localState = null) { 
  if (supabase) {
    const { error } = await supabase.from(tabela).upsert(dados);
    if (error) { toast("Erro ao salvar na nuvem!", true); throw error; }
  } else if (localState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
  }
}

async function deletar(tabela, id, localState = null) {
  if (supabase) {
    const { error } = await supabase.from(tabela).delete().eq('id', id);
    if (error) { toast("Erro ao excluir!", true); throw error; }
  } else if (localState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
  }
}

function formatarData(iso) { 
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } 
  catch { return iso; } 
}
function formatarQtd(n) { return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""); }
function formatarMoeda(n) { return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function escapeHtml(s) { const div = document.createElement("div"); div.textContent = s; return div.innerHTML; }
function normalizarNome(s) { return s.trim().replace(/\s+/g, " "); }

function itemById(state, id) { return state.itens.find(i => i.id === id); }

function mesclarCustoMedio(qtdAntes, custoAntes, qtdEntrada, precoEntrada) {
  if (!Number.isFinite(precoEntrada) || precoEntrada < 0 || qtdEntrada <= 0) return custoAntes ?? null;
  if (custoAntes == null || qtdAntes <= 0) return precoEntrada;
  return (qtdAntes * custoAntes + qtdEntrada * precoEntrada) / (qtdAntes + qtdEntrada);
}
