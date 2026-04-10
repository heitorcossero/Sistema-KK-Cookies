// CONFIGURAÇÕES
const STORAGE_KEY = "controle_estoque_v2";
const SUPABASE_URL = "https://wxhkizdgpvizhzibxgkt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aGtpemRncHZpemh6aWJ4Z2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg3NzcsImV4cCI6MjA5MTE4NDc3N30.X39g8gvk7Hb932vltuvANNGiKF7cZCoQsUHE1Mm7mtY";

let supabase = null;
try { if (window.supabase) supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error("Erro Supabase:", e); }

let state = { itens: [], receitas: [], clientes: [], encomendas: [], historico: [], congelados: {} };

// UTILITÁRIOS
const uid = () => crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2);
const formatarMoeda = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatarMoedaLonga = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 });
const formatarQtd = (n) => Number(n || 0).toFixed(3).replace(/\.?0+$/, "");
const escapeHtml = (s) => { const div = document.createElement("div"); div.textContent = s || ""; return div.innerHTML; };
const formatarData = (iso) => { if (!iso) return "A definir"; const d = new Date(iso); if (isNaN(d.getTime())) return iso; return new Date(d.getTime() + d.getTimezoneOffset() * 60000).toLocaleDateString("pt-BR"); };
function isMesAtual(dataIso) { if (!dataIso) return false; const d = new Date(dataIso); const hoje = new Date(); return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); }
const getNomeMesAtual = () => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());

async function sincronizar(tabela, dados, idExcluir = null) {
  if (!supabase) return;
  try {
    if (idExcluir) await supabase.from(tabela).delete().eq('id', idExcluir);
    else if (tabela === 'congelados') await supabase.from('congelados').upsert(Object.entries(state.congelados).map(([rid, qtd]) => ({ receita_id: rid, quantidade: qtd })));
    else {
      const payload = (Array.isArray(dados) ? dados : [dados]).map(d => {
        const n = {...d};
        if (n.custoMedio !== undefined) { n.custo_medio = n.custoMedio; delete n.custoMedio; }
        if (n.estoqueMinimo !== undefined) { n.estoque_minimo = n.estoqueMinimo; delete n.estoqueMinimo; }
        if (n.precoVenda !== undefined) { n.preco_venda = n.precoVenda; delete n.precoVenda; }
        if (n.clienteId !== undefined) { n.cliente_id = n.clienteId; delete n.clienteId; }
        if (n.valorTotal !== undefined) { n.valor_total = n.valorTotal; delete n.valorTotal; }
        return n;
      });
      await supabase.from(tabela).upsert(payload);
    }
  } catch (e) { console.error("Erro sincronia:", e); }
}

async function carregar() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) { state = JSON.parse(local); renderizar(); }
  if (supabase) {
    try {
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
    } catch (e) { console.log("Nuvem offline."); }
  }
}

function salvar() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function toast(msg, erro = false) { const t = document.getElementById("toast"); if (t) { t.textContent = msg; t.classList.toggle("erro", erro); t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); } }

function renderizar() {
  const sub = document.querySelector(".subtitle");
  if (sub) { sub.textContent = supabase ? "✅ Sincronizado" : "💾 Offline"; sub.style.color = supabase ? "#10b981" : "#f59e0b"; }

  const box = document.getElementById("alertas-estoque");
  if (box) {
    const baixos = state.itens.filter(i => i.estoqueMinimo > 0 && i.quantidade <= i.estoqueMinimo);
    box.classList.toggle("hidden", baixos.length === 0);
    box.innerHTML = baixos.length ? `<h3>⚠️ Estoque Baixo</h3><ul>${baixos.map(i => `<li>${i.nome}: ${formatarQtd(i.quantidade)}</li>`).join("")}</ul>` : "";
  }

  const list = document.getElementById("lista-estoque");
  if (list) list.innerHTML = state.itens.sort((a,b) => a.nome.localeCompare(b.nome)).map(i => `<li class="item-estoque"><strong>${i.nome}</strong>: ${formatarQtd(i.quantidade)} ${i.unidade}</li>`).join("");

  const enc = document.getElementById("lista-encomendas");
  if (enc) enc.innerHTML = state.encomendas.map(e => `<article class="card-encomenda"><h3>${escapeHtml(e.titulo)}</h3><p>Entrega: ${formatarData(e.dataEntrega)}</p></article>`).join("");

  const cli = document.getElementById("lista-clientes");
  if (cli) cli.innerHTML = state.clientes.map(c => `<article class="card-encomenda"><h3>${escapeHtml(c.nome)}</h3><p>${c.whatsapp || ""}</p></article>`).join("");

  atualizarSelects();
}

function atualizarSelects() {
  const opt = '<option value="">-- Selecione --</option>' + state.itens.sort((a,b) => a.nome.localeCompare(b.nome)).map(i => `<option value="${i.id}">${i.nome}</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, #produzir-receita-id").forEach(s => s.innerHTML = opt);
}

function init() {
  carregar();
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab, .tab-panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById(`panel-${t.dataset.tab}`).classList.add("active");
    renderizar();
  });

  const fEntrada = document.getElementById("form-entrada");
  if (fEntrada) fEntrada.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("entrada-nome").value, q = Number(document.getElementById("entrada-qtd").value);
    const item = state.itens.find(i => i.id === id);
    if (item) { 
      item.quantidade += q; salvar(); renderizar(); 
      await sincronizar('itens', item); toast("Salvo!"); 
    }
  };
}

window.migrarParaNuvem = async () => {
  if (!confirm("Enviar dados?")) return;
  await sincronizar('itens', state.itens);
  await sincronizar('receitas', state.receitas);
  await sincronizar('clientes', state.clientes);
  await sincronizar('encomendas', state.encomendas);
  alert("Sincronizado!");
};

window.reverterLancamento = () => {};
window.editarInsumo = () => {};
window.editarCliente = () => {};
window.editarReceita = () => {};
window.toggleStatus = () => {};
window.excluir = () => {};
window.atualizarValorEncomenda = () => {};
window.validarEstoqueEncomenda = () => [];
