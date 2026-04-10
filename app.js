const SUPABASE_URL = "https://wxhkizdgpvizhzibxgkt.supabase.co",
      SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aGtpemRncHZpemh6aWJ4Z2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg3NzcsImV4cCI6MjA5MTE4NDc3N30.X39g8gvk7Hb932vltuvANNGiKF7cZCoQsUHE1Mm7mtY",
      STORAGE_KEY = "controle_estoque_v2";
let supabase = null, state = { itens: [], receitas: [], clientes: [], encomendas: [], historico: [], congelados: {} };
try { if (window.supabase) supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) {}

const uid = () => crypto.randomUUID?.() ?? String(Date.now()),
      formatarMoeda = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      formatarQtd = (n) => Number(n || 0).toFixed(2),
      escapeHtml = (s) => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };

async function sincronizar(tab, d, id = null) {
  if (!supabase) return;
  if (id) await supabase.from(tab).delete().eq('id', id);
  else if (tab === 'congelados') await supabase.from('congelados').upsert(Object.entries(state.congelados).map(([r, q]) => ({ receita_id: r, quantidade: q })));
  else await supabase.from(tab).upsert(Array.isArray(d) ? d.map(x => {
    const n = {...x};
    if (n.custoMedio) { n.custo_medio = n.custoMedio; delete n.custoMedio; }
    if (n.estoqueMinimo) { n.estoque_minimo = n.estoqueMinimo; delete n.estoqueMinimo; }
    if (n.precoVenda) { n.preco_venda = n.precoVenda; delete n.precoVenda; }
    if (n.clienteId) { n.cliente_id = n.clienteId; delete n.clienteId; }
    if (n.valorTotal) { n.valor_total = n.valorTotal; delete n.valorTotal; }
    return n;
  }) : []);
}

async function carregar() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) { state = JSON.parse(local); renderizar(); }
  if (supabase) {
    const { data: it } = await supabase.from('itens').select('*');
    if (it?.length) {
      state.itens = it.map(i => ({...i, custoMedio: i.custo_medio, estoqueMinimo: i.estoque_minimo}));
      const { data: rec } = await supabase.from('receitas').select('*');
      state.receitas = rec || [];
      const { data: cli } = await supabase.from('clientes').select('*');
      state.clientes = cli || [];
      const { data: enc } = await supabase.from('encomendas').select('*');
      state.encomendas = (enc || []).map(e => ({...e, clienteId: e.cliente_id, valorTotal: e.valor_total}));
      const { data: cong } = await supabase.from('congelados').select('*');
      state.congelados = {}; (cong || []).forEach(c => state.congelados[c.receita_id] = c.quantidade);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderizar();
    }
  }
}

function renderizar() {
  const sub = document.querySelector(".subtitle");
  if (sub) { sub.textContent = supabase ? "✅ Nuvem Conectada" : "💾 Modo Local"; sub.style.color = supabase ? "#10b981" : "#f59e0b"; }
  const list = document.getElementById("lista-estoque");
  if (list) list.innerHTML = state.itens.map(i => `<li class="item-estoque"><strong>${i.nome}</strong>: ${formatarQtd(i.quantidade)} ${i.unidade}</li>`).join("");
  const sel = document.getElementById("entrada-nome");
  if (sel) sel.innerHTML = '<option value="">Selecione...</option>' + state.itens.map(i => `<option value="${i.id}">${i.nome}</option>`).join("");
}

window.migrarParaNuvem = async () => {
  if (!confirm("Subir dados?")) return;
  await sincronizar('itens', state.itens);
  await sincronizar('receitas', state.receitas);
  await sincronizar('clientes', state.clientes);
  await sincronizar('encomendas', state.encomendas);
  await sincronizar('congelados', null);
  alert("Sincronizado!");
};

function init() {
  carregar();
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab, .tab-panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById(`panel-${t.dataset.tab}`).classList.add("active");
  });
  const f = document.getElementById("form-entrada");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("entrada-nome").value, q = Number(document.getElementById("entrada-qtd").value);
    const item = state.itens.find(i => i.id === id);
    if (item) { item.quantidade += q; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderizar(); await sincronizar('itens', item); }
  };
}

window.reverterLancamento = (id) => {};
window.editarInsumo = (id) => {};
window.editarCliente = (id) => {};
window.editarReceita = (id) => {};
window.toggleStatus = (id, c) => {};
window.excluir = (t, id) => {};
window.atualizarValorEncomenda = () => {};
window.validarEstoqueEncomenda = () => [];
