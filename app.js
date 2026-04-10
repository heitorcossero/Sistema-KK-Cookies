// CONFIGURAÇÕES E CONEXÃO
const SUPABASE_URL = "https://wxhkizdgpvizhzibxgkt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aGtpemRncHZpemh6aWJ4Z2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg3NzcsImV4cCI6MjA5MTE4NDc3N30.X39g8gvk7Hb932vltuvANNGiKF7cZCoQsUHE1Mm7mtY";
const STORAGE_KEY = "controle_estoque_v2";
const SENHA_ACESSO = "Cate150909";

let supabase = null;
const initSupabase = () => {
  try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch (e) { console.error("Erro Supabase:", e); }
};

const state = {
  itens: [],
  receitas: [],
  clientes: [],
  encomendas: [],
  historico: [],
  congelados: {}
};

// UTILITÁRIOS
const uid = () => crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2);
const formatarMoeda = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const formatarMoedaLonga = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 });
const formatarQtd = (n) => Number(n || 0).toFixed(3).replace(/\.?0+$/, "");
const escapeHtml = (s) => { const div = document.createElement("div"); div.textContent = s || ""; return div.innerHTML; };

const formatarData = (iso) => {
  if (!iso) return "A definir";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dLocal = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return dLocal.toLocaleDateString("pt-BR");
};

function isMesAtual(dataIso) {
  if (!dataIso) return false;
  const d = new Date(dataIso);
  const hoje = new Date();
  return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
}

const getNomeMesAtual = () => {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());
};

// ==========================================
// NUVEM E SINCRONIA
// ==========================================

window.migrarParaNuvem = async () => {
  if (!supabase) { toast("Sem conexão com a nuvem.", true); return; }
  if (!confirm("Enviar todos os dados deste PC para a nuvem?")) return;
  toast("Sincronizando...");
  try {
    await Promise.all([
      sincronizar('itens', state.itens),
      sincronizar('receitas', state.receitas),
      sincronizar('clientes', state.clientes),
      sincronizar('encomendas', state.encomendas),
      sincronizar('historico', state.historico),
      sincronizar('congelados', null)
    ]);
    toast("✅ Sincronizado!");
  } catch (e) { toast("Erro na sincronia", true); }
};

async function sincronizar(tabela, dados, idExcluir = null) {
  if (!supabase) return;
  try {
    if (idExcluir) {
      await supabase.from(tabela).delete().eq('id', idExcluir);
    } else if (tabela === 'congelados') {
      const lista = Object.entries(state.congelados).map(([rid, qtd]) => ({ receita_id: rid, quantidade: qtd }));
      await supabase.from('congelados').upsert(lista);
    } else {
      const payload = Array.isArray(dados) ? dados : [dados];
      const formatado = payload.map(d => {
        const n = {...d};
        if (n.custoMedio !== undefined) { n.custo_medio = n.custoMedio; delete n.custoMedio; }
        if (n.estoqueMinimo !== undefined) { n.estoque_minimo = n.estoqueMinimo; delete n.estoqueMinimo; }
        if (n.precoVenda !== undefined) { n.preco_venda = n.precoVenda; delete n.precoVenda; }
        if (n.ultimaConversa !== undefined) { n.ultima_conversa = n.ultimaConversa; delete n.ultimaConversa; }
        if (n.clienteId !== undefined) { n.cliente_id = n.clienteId; delete n.clienteId; }
        if (n.valorTotal !== undefined) { n.valor_total = n.valorTotal; delete n.valorTotal; }
        if (n.itemId !== undefined) { n.item_id = n.itemId; delete n.itemId; }
        if (n.receitaId !== undefined) { n.receita_id = n.receitaId; delete n.receitaId; }
        return n;
      });
      await supabase.from(tabela).upsert(formatado);
    }
  } catch (e) { console.error("Erro sincronia:", e); }
}

async function carregar() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      state.itens = (data.itens || []).map(i => ({...i, quantidade: Number(i.quantidade) || 0, custoMedio: Number(i.custoMedio ?? i.custo_medio) || 0, estoqueMinimo: Number(i.estoqueMinimo ?? i.estoque_minimo) || 0}));
      state.receitas = (data.receitas || []).map(r => ({...r, rendimento: Number(r.rendimento) || 1, precoVenda: Number(r.precoVenda ?? r.preco_venda) || 0, ingredientes: Array.isArray(r.ingredientes) ? r.ingredientes : []}));
      state.clientes = (data.clientes || []).map(c => ({...c, ultimaConversa: c.ultimaConversa || c.criada_at || new Date().toISOString()}));
      state.encomendas = (data.encomendas || []).map(e => ({...e, valorTotal: Number(e.valorTotal ?? e.valor_total) || 0, produtos: Array.isArray(e.produtos) ? e.produtos : (Array.isArray(e.itens) ? e.itens : []), status: e.status || { pago: false, massaFeita: false, assado: false, tudoPronto: false, entregue: false }}));
      state.historico = (data.historico || []).map(h => ({...h, id: h.id || uid()}));
      state.congelados = data.congelados && typeof data.congelados === 'object' && !Array.isArray(data.congelados) ? data.congelados : {};
      renderizar();
    } catch (e) { console.error("Erro local:", e); }
  }

  if (supabase) {
    try {
      const { data: it } = await supabase.from('itens').select('*');
      if (it && it.length > 0) {
        const { data: rec } = await supabase.from('receitas').select('*');
        const { data: cli } = await supabase.from('clientes').select('*');
        const { data: enc } = await supabase.from('encomendas').select('*');
        const { data: hist } = await supabase.from('historico').select('*').order('quando', { ascending: false }).limit(50);
        const { data: cong } = await supabase.from('congelados').select('*');

        state.itens = it.map(i => ({...i, quantidade: Number(i.quantidade), custoMedio: Number(i.custo_medio), estoqueMinimo: Number(i.estoque_minimo)}));
        state.receitas = (rec || []).map(r => ({...r, rendimento: Number(r.rendimento), precoVenda: Number(r.preco_venda)}));
        state.clientes = (cli || []).map(c => ({...c, ultimaConversa: c.ultima_conversa}));
        state.encomendas = (enc || []).map(e => ({...e, clienteId: e.cliente_id, valorTotal: Number(e.valor_total)}));
        state.historico = (hist || []).map(h => ({...h, id: h.id || uid(), itemId: h.item_id, receitaId: h.receita_id}));
        state.congelados = {};
        (cong || []).forEach(c => { state.congelados[c.receita_id] = Number(c.quantidade); });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderizar();
      }
    } catch (e) { console.log("Erro nuvem."); }
  }
}

const salvar = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

// ==========================================
// RENDERIZAÇÃO
// ==========================================

function renderizar() {
  try {
    const subtitle = document.querySelector(".subtitle");
    if (subtitle) {
        const statusNuvem = supabase ? "✅ Sincronizado" : "💾 Offline";
        subtitle.innerHTML = `${statusNuvem} - ${getNomeMesAtual()}`;
        subtitle.style.color = supabase ? "#10b981" : "#f59e0b";
    }

    const boxAlertas = document.getElementById("alertas-estoque");
    if (boxAlertas) {
      const baixos = state.itens.filter(i => i.estoqueMinimo > 0 && i.quantidade <= i.estoqueMinimo);
      boxAlertas.classList.toggle("hidden", baixos.length === 0);
      boxAlertas.innerHTML = baixos.length ? `<h3>⚠️ Insumos em nível crítico</h3><ul>${baixos.map(i => `<li>${i.nome}: ${formatarQtd(i.quantidade)} ${i.unidade} (Mínimo: ${i.estoqueMinimo})</li>`).join("")}</ul>` : "";
    }

    const listaEstoque = document.getElementById("lista-estoque");
    if (listaEstoque) {
      listaEstoque.innerHTML = state.itens.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(it => `
        <li class="item-estoque">
          <div class="item-col-principal">
            <strong class="nome">${escapeHtml(it.nome)}</strong>
            <small class="item-preco-linha">Custo: ${formatarMoedaLonga(it.custoMedio)} / ${it.unidade} | Capital: <span class="subtotal">${formatarMoeda(it.quantidade * it.custoMedio)}</span></small>
          </div>
          <span class="saldo ${it.estoqueMinimo > 0 && it.quantidade <= it.estoqueMinimo ? 'alerta-baixo' : ''}">
            ${formatarQtd(it.quantidade)} ${it.unidade}
          </span>
        </li>`).join("");
    }

    const listaCong = document.getElementById("lista-congelados");
    if (listaCong) {
      const itensCong = Object.entries(state.congelados).filter(([id, qtd]) => qtd > 0);
      listaCong.innerHTML = itensCong.length ? itensCong.map(([recId, qtd]) => {
        const receita = state.receitas.find(r => r.id === recId);
        return `<li class="item-estoque"><div><strong>${escapeHtml(receita?.nome || 'Cookie')}</strong></div><span class="saldo">${qtd} un</span></li>`;
      }).join("") : '<p class="muted-small">Freezer vazio.</p>';
    }

    const listaEnc = document.getElementById("lista-encomendas");
    if (listaEnc) {
      listaEnc.innerHTML = state.encomendas.map(enc => {
        const cli = state.clientes.find(c => c.id === enc.clienteId);
        const st = enc.status || {};
        const noFreezer = (enc.produtos || []).length > 0 && (enc.produtos || []).every(p => (state.congelados[p.receitaId || p.id] || 0) >= p.quantidade);
        let infoEstoque = noFreezer ? '<div class="enc-banner ok">✅ Disponível no Freezer!</div>' : 
          `<div class="enc-banner ${validarEstoqueEncomenda(enc).length ? 'falta' : 'ok'}">${validarEstoqueEncomenda(enc).length ? `<strong>⚠️ Faltam ingredientes:</strong><ul>${validarEstoqueEncomenda(enc).map(f => `<li>${f.nome}: ${formatarQtd(f.falta)} ${f.unidade}</li>`).join("")}</ul>` : '✅ Insumos em estoque!'}</div>`;

        return `<article class="card-encomenda ${st.entregue ? 'entregue' : ''}">
          <header><div style="flex:1">
            <div class="flex-row" style="justify-content:space-between; align-items: flex-start; margin-bottom:0.5rem">
              <span class="badge-alerta" style="background:var(--money); color:var(--surface); padding:0.2rem 0.6rem">📅 Entrega: ${formatarData(enc.dataEntrega)}</span>
              <span style="font-weight:700; color:${st.pago ? 'var(--accent-in)' : 'var(--text)'}; font-size:1.1rem">${formatarMoeda(enc.valorTotal)}</span>
            </div>
            <h3 class="enc-titulo">${escapeHtml(enc.titulo || 'Pedido de ' + (cli?.nome || 'Cliente'))}</h3>
            <p class="enc-meta">Cliente: ${escapeHtml(cli?.nome || '?')}</p>
          </div><button class="btn-mini" onclick="excluir('encomendas', '${enc.id}')">X</button></header>
          ${infoEstoque}
          <div class="enc-status-grid">
            <label class="enc-check-label"><input type="checkbox" ${st.pago ? 'checked' : ''} onchange="toggleStatus('${enc.id}', 'pago')"> Pago</label>
            <label class="enc-check-label"><input type="checkbox" ${st.massaFeita ? 'checked' : ''} onchange="toggleStatus('${enc.id}', 'massaFeita')"> Massa</label>
            <label class="enc-check-label"><input type="checkbox" ${st.assado ? 'checked' : ''} onchange="toggleStatus('${enc.id}', 'assado')"> Assado</label>
            <label class="enc-check-label"><input type="checkbox" ${st.tudoPronto ? 'checked' : ''} onchange="toggleStatus('${enc.id}', 'tudoPronto')"> Pronto</label>
            <label class="enc-check-label"><input type="checkbox" ${st.entregue ? 'checked' : ''} onchange="toggleStatus('${enc.id}', 'entregue')"> Entregue</label>
          </div></article>`;
      }).join("");
    }

    const lHist = document.getElementById("lista-historico-estoque");
    if (lHist) lHist.innerHTML = state.historico.slice(0, 30).map(h => `<li class="mov"><div style="flex:1"><strong>${formatarData(h.quando)}</strong> - ${h.texto}</div><button class="btn-mini" onclick="reverterLancamento('${h.id}')">Desfazer</button></li>`).join("");
    
    atualizarSelects();
  } catch (err) { console.error("Erro renderização:", err); }
}

function atualizarSelects() {
  const optItens = '<option value="">-- Selecione --</option>' + state.itens.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(i => `<option value="${i.id}">${i.nome} (${i.unidade})</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, .ing-select").forEach(s => { const v = s.value; s.innerHTML = optItens; s.value = v; });
}

function validarEstoqueEncomenda(enc) {
  const necessidades = {};
  (enc.produtos || []).forEach(p => {
    const qF = state.congelados[p.receitaId || p.id] || 0;
    const qA = Math.max(0, p.quantidade - qF);
    if (qA > 0) {
      const rec = state.receitas.find(r => r.id === (p.receitaId || p.id));
      if (rec) (rec.ingredientes || []).forEach(ing => { necessidades[ing.itemId] = (necessidades[ing.itemId] || 0) + (Number(ing.quantidade) * qA); });
    }
  });
  const faltas = [];
  for (const itemId in necessidades) {
    const item = state.itens.find(i => i.id === itemId);
    if ((item?.quantidade || 0) < necessidades[itemId]) faltas.push({ nome: item?.nome || "Item", falta: necessidades[itemId] - (item?.quantidade || 0), unidade: item?.unidade || "" });
  }
  return faltas;
}

function calcularCustoReceita(r) { return (r.ingredientes || []).reduce((acc, ing) => { const item = state.itens.find(i => i.id === ing.itemId); return acc + (Number(ing.quantidade) * (item?.custoMedio || 0)); }, 0); }

// ==========================================
// INICIALIZAÇÃO
// ==========================================

window.tentarLogar = () => {
  const s = document.getElementById("input-senha").value;
  if (s === SENHA_ACESSO) {
    sessionStorage.setItem("estoque_logado", "true");
    mostrarSistema();
  } else {
    document.getElementById("login-erro").classList.remove("hidden");
  }
};

function mostrarSistema() {
  document.getElementById("login-screen").style.display = "none";
  document.querySelector(".app").style.display = "block";
  carregar();
  initEventos();
}

function init() {
  initSupabase();
  if (sessionStorage.getItem("estoque_logado") === "true") {
    mostrarSistema();
  }
}

function initEventos() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      const name = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `panel-${name}`));
      renderizar();
    };
  });

  document.getElementById("form-entrada").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("entrada-nome").value;
    const qtd = Number(document.getElementById("entrada-qtd").value);
    const preco = Number(document.getElementById("entrada-preco").value);
    const item = state.itens.find(i => i.id === id);
    if (item) {
      item.quantidade += qtd;
      state.historico.unshift({ id: uid(), tipo: 'compra', itemId: id, texto: `Compra: ${qtd}${item.unidade} ${item.nome}`, quando: new Date().toISOString() });
      salvar(); await sincronizar('itens', item); await sincronizar('historico', state.historico[0]);
      e.target.reset(); renderizar(); toast("Salvo!");
    }
  };
  
  // (outros eventos simplificados para teste rápido)
}

window.onload = init;
