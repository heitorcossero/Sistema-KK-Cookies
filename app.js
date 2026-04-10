// CONFIGURAÇÕES
let supabase = null;
const STORAGE_KEY = "controle_estoque_v2";

const state = {
  itens: [],
  receitas: [],
  clientes: [],
  encomendas: [],
  historico: [],
  congelados: {}
};

const initSupabase = () => {
  if (supabase) return supabase;
  try {
    const create = window.supabase?.createClient || window.supabaseJs?.createClient;
    if (create) {
      supabase = create(SUPABASE_URL, SUPABASE_KEY);
      return supabase;
    }
  } catch(e) { console.error("Falha Supabase:", e); }
  return null;
};

// ==========================================
// AUTENTICAÇÃO
// ==========================================

async function verificarSessao() {
  const s = initSupabase();
  if (!s || !s.auth) return false;
  try {
    const { data: { session } } = await s.auth.getSession();
    if (session) {
      document.getElementById("auth-container").style.display = "none";
      document.getElementById("main-app").style.display = "block";
      return true;
    }
  } catch (err) { console.error(err); }
  
  document.getElementById("auth-container").style.display = "flex";
  document.getElementById("main-app").style.display = "none";
  return false;
}

async function login(email, password) {
  const msg = document.getElementById("login-msg");
  msg.style.color = "var(--accent-in)";
  msg.textContent = "Verificando...";
  const s = initSupabase();
  if (!s) { msg.style.color = "red"; msg.textContent = "Erro de conexão."; return; }
  try {
    const { error } = await s.auth.signInWithPassword({ email, password });
    if (error) { msg.style.color = "red"; msg.textContent = error.message; }
    else { location.reload(); }
  } catch (err) { msg.style.color = "red"; msg.textContent = "Erro técnico."; }
}

async function logout() {
  const s = initSupabase();
  if (s) await s.auth.signOut();
  location.reload();
}

// UTILITÁRIOS
const uid = () => crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2);
const formatarMoeda = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
const getNomeMesAtual = () => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());

function toast(msg, erro = false) {
  const t = document.getElementById("toast");
  if (t) { t.textContent = msg; t.classList.toggle("erro", erro); t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }
}

// ==========================================
// GESTÃO DE DADOS
// ==========================================

async function carregar() {
  // 1. Local Fallback
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data);
    } catch (e) { console.error(e); }
  }

  // 2. Nuvem
  const s = initSupabase();
  if (s) {
    try {
      const [it, cl, rec, enc, hist, cong] = await Promise.all([
        s.from('itens').select('*'),
        s.from('clientes').select('*'),
        s.from('receitas').select('*'),
        s.from('encomendas').select('*'),
        s.from('historico').select('*').order('quando', { ascending: false }).limit(50),
        s.from('congelados').select('*')
      ]);

      if (it.data) state.itens = it.data.map(i => ({...i, custoMedio: Number(i.custo_medio), estoqueMinimo: Number(i.estoque_minimo), quantidade: Number(i.quantidade)}));
      if (cl.data) state.clientes = cl.data.map(c => ({...c, ultimaConversa: c.ultima_conversa}));
      if (rec.data) state.receitas = rec.data.map(r => ({...r, precoVenda: Number(r.preco_venda), rendimento: Number(r.rendimento)}));
      if (enc.data) state.encomendas = enc.data.map(e => ({...e, valorTotal: Number(e.valor_total), clienteId: e.cliente_id, dataEntrega: e.data_entrega}));
      if (hist.data) state.historico = hist.data;
      if (cong.data) {
        state.congelados = {};
        cong.data.forEach(c => state.congelados[c.receita_id] = Number(c.quantidade));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) { console.error("Erro nuvem:", err); }
  }
}

async function salvar(tabela = null, dados = null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const s = initSupabase();
  if (s && tabela && dados) {
    try {
      const payload = Array.isArray(dados) ? dados : [dados];
      const dbPayload = payload.map(d => {
        const obj = {...d};
        if (obj.custoMedio !== undefined) { obj.custo_medio = Number(obj.custoMedio); delete obj.custoMedio; }
        if (obj.estoqueMinimo !== undefined) { obj.estoque_minimo = Number(obj.estoqueMinimo); delete obj.estoqueMinimo; }
        if (obj.ultimaConversa !== undefined) { obj.ultima_conversa = obj.ultimaConversa; delete obj.ultimaConversa; }
        if (obj.clienteId !== undefined) { obj.cliente_id = obj.clienteId; delete obj.clienteId; }
        if (obj.valorTotal !== undefined) { obj.valor_total = Number(obj.valorTotal); delete obj.valorTotal; }
        if (obj.dataEntrega !== undefined) { obj.data_entrega = obj.dataEntrega; delete obj.dataEntrega; }
        if (obj.receitaId !== undefined) { obj.receita_id = obj.receitaId; delete obj.receitaId; }
        if (obj.precoVenda !== undefined) { obj.preco_venda = Number(obj.precoVenda); delete obj.precoVenda; }
        if (obj.itemId !== undefined) { obj.item_id = obj.itemId; delete obj.itemId; }
        if (obj.detalhesIngredientes !== undefined) { obj.detalhes_ingredientes = obj.detalhesIngredientes; delete obj.detalhesIngredientes; }
        return obj;
      });
      await s.from(tabela).upsert(dbPayload);
    } catch (err) { toast("Erro sincronia.", true); }
  }
}

// ==========================================
// RENDERIZAÇÃO E AÇÕES
// ==========================================

function renderizar() {
  try {
    const s = initSupabase();
    const subtitle = document.querySelector(".subtitle");
    if (subtitle) {
      subtitle.innerHTML = s ? "✅ Sincronizado" : `🥧 Local - ${getNomeMesAtual()}`;
      subtitle.style.color = s ? "var(--accent-in)" : "inherit";
    }

    const listaEstoque = document.getElementById("lista-estoque");
    if (listaEstoque) {
      listaEstoque.innerHTML = state.itens.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(it => `
        <li class="item-estoque">
          <div class="item-col-principal">
            <strong class="nome">${escapeHtml(it.nome)}</strong>
            <small class="item-preco-linha">Custo: ${formatarMoedaLonga(it.custoMedio)} / ${it.unidade}</small>
          </div>
          <span class="saldo ${it.estoqueMinimo > 0 && it.quantidade <= it.estoqueMinimo ? 'alerta-baixo' : ''}">
            ${formatarQtd(it.quantidade)} ${it.unidade}
          </span>
        </li>`).join("");
    }

    const containerRec = document.getElementById("lista-receitas-editar");
    if (containerRec) containerRec.innerHTML = state.receitas.map(r => `<div class="card-receita-edit"><h3>${escapeHtml(r.nome)}</h3><p class="muted-small">Venda: ${formatarMoeda(r.precoVenda)}</p><div class="btn-row"><button class="btn-mini" onclick="editarReceita('${r.id}')">Editar</button><button class="btn-mini" onclick="excluir('receitas', '${r.id}')">X</button></div></div>`).join("");

    const containerEdit = document.getElementById("editar-itens-container");
    if (containerEdit) containerEdit.innerHTML = `<table class="tabela-info"><thead><tr><th>Insumo</th><th>Ações</th></tr></thead><tbody>` + state.itens.map(it => `<tr><td>${it.nome}</td><td><button class="btn-mini" onclick="editarInsumo('${it.id}')">Editar</button></td></tr>`).join("") + "</tbody></table>";

    atualizarSelects();
  } catch (e) { console.error(e); }
}

function atualizarSelects() {
  const optItens = '<option value="">-- Selecione --</option>' + state.itens.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(i => `<option value="${i.id}">${i.nome}</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, .ing-select").forEach(s => { const v = s.value; s.innerHTML = optItens; s.value = v; });
}

window.excluir = async (tabela, id) => {
  if (!confirm("Excluir?")) return;
  state[tabela] = state[tabela].filter(x => x.id !== id);
  const s = initSupabase();
  if (s) await s.from(tabela).delete().eq('id', id);
  await salvar(); renderizar();
};

window.editarInsumo = (id) => {
  const item = state.itens.find(x => x.id === id);
  if (item) {
    document.getElementById("insumo-id-edit").value = item.id;
    document.getElementById("novo-item-nome").value = item.nome;
    document.getElementById("novo-item-unidade").value = item.unidade;
    document.getElementById("novo-item-custo").value = item.custoMedio;
    document.getElementById("novo-item-minimo").value = item.estoqueMinimo;
    document.getElementById("btn-salvar-insumo").textContent = "Atualizar";
    document.getElementById("btn-cancelar-insumo").classList.remove("hidden");
  }
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function init() {
  // 1. Ativar Login
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      await login(document.getElementById("login-email").value, document.getElementById("login-senha").value);
    };
  }

  // 2. Verificar Sessão
  const logado = await verificarSessao();
  if (!logado) return;

  // 3. Ativar Abas
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      const name = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `panel-${name}`));
      renderizar();
    };
  });

  // 4. Ativar Formulários (Onde estava o erro!)
  document.getElementById("form-novo-item").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = document.getElementById("insumo-id-edit").value;
    const dados = { id: idEdit || uid(), nome: document.getElementById("novo-item-nome").value, unidade: document.getElementById("novo-item-unidade").value, custoMedio: Number(document.getElementById("novo-item-custo").value) || 0, estoqueMinimo: Number(document.getElementById("novo-item-minimo").value) || 0 };
    
    if (idEdit) {
      const item = state.itens.find(x => x.id === idEdit);
      Object.assign(item, dados);
      await salvar('itens', item);
    } else {
      const novo = { ...dados, quantidade: 0 };
      state.itens.push(novo);
      await salvar('itens', novo);
    }
    e.target.reset(); document.getElementById("insumo-id-edit").value = ""; renderizar(); toast("Salvo!");
  };

  document.getElementById("form-entrada").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("entrada-nome").value;
    const qtd = Number(document.getElementById("entrada-qtd").value);
    const preco = Number(document.getElementById("entrada-preco").value);
    const item = state.itens.find(i => i.id === id);
    if (item) {
      item.custoMedio = (item.quantidade * item.custoMedio + preco) / (item.quantidade + qtd);
      item.quantidade += qtd;
      const h = { id: uid(), tipo: 'compra', item_id: id, quantidade: qtd, texto: `Compra: ${item.nome}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('itens', item);
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Estoque atualizado!");
    }
  };

  document.getElementById("btn-add-ingrediente").onclick = () => {
    const div = document.createElement("div"); div.className = "enc-linha-row";
    div.innerHTML = `<select class="ing-select" required>${state.itens.map(i => `<option value="${i.id}">${i.nome}</option>`).join("")}</select>
      <input type="number" class="ing-qtd" step="any" placeholder="Qtd" required />
      <button type="button" class="btn-mini" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById("ingredientes-container").appendChild(div);
  };

  // 5. Carregar Dados e Mostrar
  await carregar();
  renderizar();
}

window.onload = init;
window.logout = logout;
