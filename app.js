// CONFIGURAÇÕES
let supabase = null;

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

    // 1. Alertas
    const boxAlertas = document.getElementById("alertas-estoque");
    if (boxAlertas) {
      const baixos = state.itens.filter(i => i.estoqueMinimo > 0 && i.quantidade <= i.estoqueMinimo);
      boxAlertas.classList.toggle("hidden", baixos.length === 0);
      boxAlertas.innerHTML = baixos.length ? `<h3>⚠️ Insumos em nível crítico</h3><ul>${baixos.map(i => `<li>${i.nome}: ${formatarQtd(i.quantidade)} ${i.unidade} (Mínimo: ${i.estoqueMinimo})</li>`).join("")}</ul>` : "";
    }

    // 2. Estoque de Insumos
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

    // 3. Estoque Congelados
    const listaCong = document.getElementById("lista-congelados");
    if (listaCong) {
      const itensCong = Object.entries(state.congelados).filter(([id, qtd]) => qtd > 0);
      listaCong.innerHTML = itensCong.length ? itensCong.map(([recId, qtd]) => {
        const receita = state.receitas.find(r => r.id === recId);
        return `<li class="item-estoque"><div><strong>${escapeHtml(receita?.nome || 'Cookie')}</strong></div><span class="saldo">${qtd} un</span></li>`;
      }).join("") : '<p class="muted-small">Freezer vazio.</p>';
    }

    // 4. Clientes
    const lCli = document.getElementById("lista-clientes");
    if (lCli) {
      lCli.innerHTML = state.clientes.sort((a,b) => new Date(b.ultimaConversa || 0) - new Date(a.ultimaConversa || 0)).map(c => `
        <article class="card-encomenda">
          <div class="flex-row" style="justify-content:space-between">
            <h3>${escapeHtml(c.nome)}</h3>
            <div class="btn-row">
              <button class="btn-mini" onclick="editarCliente('${c.id}')">Editar</button>
              <button class="btn-mini" onclick="excluir('clientes', '${c.id}')">X</button>
            </div>
          </div>
          <p>WhatsApp: ${escapeHtml(c.whatsapp || "Não informado")}</p>
          <p class="muted-small">Última conversa: ${formatarData(c.ultimaConversa)}</p>
        </article>`).join("");
    }

    // 5. Histórico
    const lHist = document.getElementById("lista-historico-estoque");
    if (lHist) {
      const histHtml = state.historico.slice(0, 30).map(h => `
        <li class="mov">
          <div style="flex:1"><strong>${formatarData(h.quando)}</strong> - ${h.texto}</div>
          <button class="btn-mini" onclick="reverterLancamento('${h.id}')">Desfazer</button>
        </li>`).join("");
      // Atualiza nos dois lugares (Aba Estoque e Aba Info)
      document.querySelectorAll("#lista-historico-estoque").forEach(el => el.innerHTML = histHtml);
    }

    // 6. Encomendas
    const lEnc = document.getElementById("lista-encomendas");
    if (lEnc) {
      lEnc.innerHTML = state.encomendas.sort((a,b) => new Date(a.dataEntrega || 0) - new Date(b.dataEntrega || 0)).map(e => {
        const cliente = state.clientes.find(c => c.id === e.clienteId);
        return `<article class="card-encomenda">
          <div class="flex-row" style="justify-content:space-between">
            <h3>${escapeHtml(e.titulo || "Pedido")} - ${escapeHtml(cliente?.nome || "Cliente")}</h3>
            <button class="btn-mini" onclick="excluir('encomendas', '${e.id}')">X</button>
          </div>
          <p>Entrega: ${formatarData(e.dataEntrega)}</p>
          <p>Total: ${formatarMoeda(e.valorTotal)}</p>
        </article>`;
      }).join("");
    }

    // 7. Editar Receitas
    const containerRec = document.getElementById("lista-receitas-editar");
    if (containerRec) {
      containerRec.innerHTML = state.receitas.map(r => {
        const custo = calcularCustoReceita(r);
        const lucro = r.precoVenda - custo;
        return `<div class="card-receita-edit">
          <h3>${escapeHtml(r.nome)}</h3>
          <p class="muted-small">Custo: ${formatarMoeda(custo)} | Lucro: ${formatarMoeda(lucro)}</p>
          <p class="muted-small">Venda: ${formatarMoeda(r.precoVenda)}</p>
          <div class="btn-row">
            <button class="btn-mini" onclick="editarReceita('${r.id}')">Editar</button>
            <button class="btn-mini" onclick="excluir('receitas', '${r.id}')">X</button>
          </div>
        </div>`;
      }).join("");
    }

    const containerEdit = document.getElementById("editar-itens-container");
    if (containerEdit) containerEdit.innerHTML = `<table class="tabela-info"><thead><tr><th>Insumo</th><th>Custo</th><th>Ações</th></tr></thead><tbody>` + state.itens.sort((a,b) => a.nome.localeCompare(b.nome)).map(it => `<tr><td>${it.nome}</td><td>${formatarMoedaLonga(it.custoMedio)}</td><td><button class="btn-mini" onclick="editarInsumo('${it.id}')">Editar</button></td></tr>`).join("") + "</tbody></table>";

    // 8. ABA INFORMAÇÕES
    atualizarAbaInfo();

    atualizarSelects();
  } catch (e) { console.error(e); }
}

function atualizarAbaInfo() {
  const vEstoque = state.itens.reduce((acc, it) => acc + (it.quantidade * it.custoMedio), 0);
  const lProducoes = state.historico.reduce((acc, h) => acc + (Number(h.lucro) || 0), 0);
  const pMarkup = vEstoque * 3.7;

  const elVEstoque = document.getElementById("valor-total");
  if (elVEstoque) elVEstoque.textContent = formatarMoeda(vEstoque);

  const elLProducoes = document.getElementById("lucro-producoes");
  if (elLProducoes) elLProducoes.textContent = formatarMoeda(lProducoes);

  const elPMarkup = document.getElementById("lucro-markup-estoque");
  if (elPMarkup) elPMarkup.textContent = formatarMoeda(pMarkup);

  // Média por pedido
  let totalCookies = 0;
  let totalPedidos = state.encomendas.length;
  state.encomendas.forEach(e => {
    (e.produtos || []).forEach(p => totalCookies += Number(p.quantidade || 0));
  });
  const elMedia = document.getElementById("media-cookies-pedido");
  if (elMedia) elMedia.textContent = totalPedidos > 0 ? `${(totalCookies / totalPedidos).toFixed(1)} un` : "0 un";

  // Desempenho por sabor
  const sabores = {};
  state.historico.filter(h => h.tipo === 'producao' && isMesAtual(h.quando)).forEach(h => {
    const nome = h.texto.replace("Produção: ", "").split("x ")[1];
    if (nome) {
      sabores[nome] = (sabores[nome] || 0) + 1;
    }
  });
  const elSabores = document.getElementById("lista-desempenho-sabores");
  if (elSabores) {
    const sortSabores = Object.entries(sabores).sort((a,b) => b[1] - a[1]);
    elSabores.innerHTML = sortSabores.length ? `<ul class="lista-estoque">${sortSabores.map(([n, q]) => `<li><strong>${n}</strong> <span>${q} produções</span></li>`).join("")}</ul>` : "<p class='muted-small'>Nenhuma produção este mês.</p>";
  }
}

function atualizarSelects() {
  const optItens = '<option value="">-- Selecione --</option>' + state.itens.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(i => `<option value="${i.id}">${i.nome}</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, .ing-select").forEach(s => { const v = s.value; s.innerHTML = optItens; s.value = v; });
  
  const optRec = '<option value="">-- Selecione --</option>' + state.receitas.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(r => `<option value="${r.id}">${r.nome}</option>`).join("");
  document.querySelectorAll("#produzir-receita-id, #congelado-receita-id, .enc-prod-select").forEach(s => { const v = s.value; s.innerHTML = optRec; s.value = v; });

  const optCli = '<option value="">-- Selecione --</option>' + state.clientes.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  document.querySelectorAll("#enc-cliente-select").forEach(s => { const v = s.value; s.innerHTML = optCli; s.value = v; });
}

function calcularCustoReceita(r) { 
  return (r.ingredientes || []).reduce((acc, ing) => { 
    const item = state.itens.find(i => i.id === ing.itemId); 
    return acc + (Number(ing.quantidade) * (item?.custoMedio || 0)); 
  }, 0); 
}

window.reverterLancamento = async (id) => {
  if (!confirm("Desfazer este lançamento?")) return;
  const h = state.historico.find(x => x.id === id);
  if (!h) return;
  
  const s = initSupabase();
  try {
    if (h.tipo === 'compra') {
      const it = state.itens.find(i => i.id === h.item_id);
      if (it) {
        it.quantidade -= Number(h.quantidade || 0);
        await salvar('itens', it);
      }
    } else if (h.tipo === 'saida') {
      const it = state.itens.find(i => i.id === h.item_id);
      if (it) {
        it.quantidade += Number(h.quantidade || 0);
        await salvar('itens', it);
      }
    } else if (h.tipo === 'producao') {
      const dets = h.detalhes_ingredientes || h.detalhesIngredientes || [];
      for (const d of dets) {
        const item = state.itens.find(i => i.id === d.itemId || i.id === d.item_id);
        if (item) {
          item.quantidade += Number(d.quantidade || 0);
          await salvar('itens', item);
        }
      }
    } else if (h.tipo === 'congelado') {
      const rId = h.receita_id || h.receitaId;
      state.congelados[rId] = (state.congelados[rId] || 0) - Number(h.quantidade || 0);
      await salvar('congelados', { receita_id: rId, quantidade: state.congelados[rId] });
    }
    
    state.historico = state.historico.filter(x => x.id !== id);
    if (s) await s.from('historico').delete().eq('id', id);
    
    await salvar(); renderizar(); toast("Lançamento revertido!");
  } catch (err) { console.error(err); toast("Erro ao reverter.", true); }
};

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
    document.getElementById("tab-editar").click();
  }
};

window.editarCliente = (id) => {
  const c = state.clientes.find(x => x.id === id);
  if (c) {
    document.getElementById("cliente-id-edit").value = c.id;
    document.getElementById("cliente-nome").value = c.nome;
    document.getElementById("cliente-whatsapp").value = c.whatsapp || "";
    document.getElementById("cliente-conversa").value = c.conversa || "";
    document.getElementById("cliente-ultima-conversa").value = c.ultimaConversa ? c.ultimaConversa.split('T')[0] : "";
    document.getElementById("btn-salvar-cliente").textContent = "Atualizar";
    document.getElementById("btn-cancelar-cliente").classList.remove("hidden");
    document.getElementById("tab-clientes").click();
  }
};

window.editarReceita = (id) => {
  const r = state.receitas.find(x => x.id === id);
  if (r) {
    document.getElementById("receita-id-edit").value = r.id;
    document.getElementById("receita-nome").value = r.nome;
    document.getElementById("receita-rendimento").value = r.rendimento || 1;
    document.getElementById("receita-preco-venda").value = r.precoVenda;
    const container = document.getElementById("ingredientes-container");
    container.innerHTML = "";
    (r.ingredientes || []).forEach(ing => {
      const div = document.createElement("div");
      div.className = "enc-linha-row";
      div.innerHTML = `<select class="ing-select" required>${state.itens.map(i => `<option value="${i.id}" ${i.id === ing.itemId ? 'selected' : ''}>${i.nome}</option>`).join("")}</select>
        <input type="number" class="ing-qtd" step="any" value="${ing.quantidade}" required />
        <button type="button" class="btn-mini" onclick="this.parentElement.remove()">X</button>`;
      container.appendChild(div);
    });
    document.getElementById("btn-salvar-receita").textContent = "Atualizar";
    document.getElementById("btn-cancelar-receita").classList.remove("hidden");
    document.getElementById("tab-editar").click();
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

  // 4. Ativar Formulários
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
    e.target.reset(); document.getElementById("insumo-id-edit").value = ""; 
    document.getElementById("btn-salvar-insumo").textContent = "Criar Insumo";
    document.getElementById("btn-cancelar-insumo").classList.add("hidden");
    renderizar(); toast("Salvo!");
  };

  document.getElementById("form-entrada").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("entrada-nome").value;
    const qtd = Number(document.getElementById("entrada-qtd").value);
    const preco = Number(document.getElementById("entrada-preco").value);
    const item = state.itens.find(i => i.id === id);
    if (item && qtd > 0) {
      item.custoMedio = (item.quantidade * item.custoMedio + preco) / (item.quantidade + qtd);
      item.quantidade += qtd;
      const h = { id: uid(), tipo: 'compra', item_id: id, quantidade: qtd, texto: `Compra: ${qtd}${item.unidade} ${item.nome}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('itens', item);
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Estoque atualizado!");
    }
  };

  document.getElementById("form-saida-manual").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("saida-manual-id").value;
    const qtd = Number(document.getElementById("saida-manual-qtd").value);
    const item = state.itens.find(i => i.id === id);
    if (item && item.quantidade >= qtd && qtd > 0) {
      item.quantidade -= qtd;
      const h = { id: uid(), tipo: 'saida', item_id: id, quantidade: qtd, texto: `Saída Manual: ${qtd}${item.unidade} ${item.nome}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('itens', item);
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Estoque reduzido.");
    } else { alert("Saldo insuficiente!"); }
  };

  document.getElementById("form-congelados").onsubmit = async (e) => {
    e.preventDefault();
    const recId = document.getElementById("congelado-receita-id").value;
    const qtd = Number(document.getElementById("congelado-qtd").value);
    const tipo = e.submitter.id === "btn-add-congelado" ? 1 : -1;
    if (recId && qtd > 0) {
      state.congelados[recId] = (state.congelados[recId] || 0) + (qtd * tipo);
      const r = state.receitas.find(x => x.id === recId);
      const h = { id: uid(), tipo: 'congelado', receita_id: recId, quantidade: qtd * tipo, texto: `${tipo > 0 ? 'Entrada' : 'Saída'} Freezer: ${qtd}un ${r?.nome || 'Cookie'}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('congelados', { receita_id: recId, quantidade: state.congelados[recId] });
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Freezer atualizado!");
    }
  };

  document.getElementById("form-produzir").onsubmit = async (e) => {
    e.preventDefault();
    const r = state.receitas.find(x => x.id === document.getElementById("produzir-receita-id").value);
    const mult = Number(document.getElementById("produzir-qtd").value);
    if (r && mult > 0) {
      const custoT = calcularCustoReceita(r) * mult;
      const lucroG = (r.precoVenda * mult) - custoT;
      const dets = [];
      for (const ing of (r.ingredientes || [])) {
        const item = state.itens.find(i => i.id === ing.itemId);
        if (item) { 
          const q = ing.quantidade * mult; 
          item.quantidade -= q; 
          dets.push({ itemId: ing.itemId, quantidade: q });
          await salvar('itens', item);
        }
      }
      const h = { id: uid(), tipo: 'producao', lucro: lucroG, detalhes_ingredientes: dets, texto: `Produção: ${mult}x ${r.nome}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Estoque baixado!");
    }
  };

  document.getElementById("form-cliente").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = document.getElementById("cliente-id-edit").value;
    const dConv = document.getElementById("cliente-ultima-conversa").value;
    const dados = { nome: document.getElementById("cliente-nome").value, whatsapp: document.getElementById("cliente-whatsapp").value, conversa: document.getElementById("cliente-conversa").value, ultimaConversa: dConv ? new Date(dConv).toISOString() : new Date().toISOString() };
    if (idEdit) { 
      const c = state.clientes.find(x => x.id === idEdit);
      Object.assign(c, dados);
      await salvar('clientes', c);
    } else { 
      const novo = { id: uid(), ...dados };
      state.clientes.push(novo); 
      await salvar('clientes', novo);
    }
    e.target.reset(); document.getElementById("cliente-id-edit").value = ""; 
    document.getElementById("btn-salvar-cliente").textContent = "Cadastrar"; 
    document.getElementById("btn-cancelar-cliente").classList.add("hidden"); 
    renderizar(); toast("Cliente salvo!");
  };

  document.getElementById("form-nova-receita").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = document.getElementById("receita-id-edit").value;
    const ings = [];
    document.querySelectorAll("#ingredientes-container .enc-linha-row").forEach(row => { 
      ings.push({ itemId: row.querySelector(".ing-select").value, quantidade: Number(row.querySelector(".ing-qtd").value) }); 
    });
    const dados = { nome: document.getElementById("receita-nome").value, rendimento: Number(document.getElementById("receita-rendimento").value) || 1, precoVenda: Number(document.getElementById("receita-preco-venda").value) || 0, ingredientes: ings };
    if (idEdit) { 
      const r = state.receitas.find(x => x.id === idEdit);
      Object.assign(r, dados); 
      await salvar('receitas', r);
    } else { 
      const novo = { id: uid(), ...dados };
      state.receitas.push(novo); 
      await salvar('receitas', novo);
    }
    e.target.reset(); document.getElementById("ingredientes-container").innerHTML = ""; 
    document.getElementById("receita-id-edit").value = ""; 
    document.getElementById("btn-salvar-receita").textContent = "Salvar Receita"; 
    document.getElementById("btn-cancelar-receita").classList.add("hidden"); 
    renderizar(); toast("Receita salva!");
  };

  document.getElementById("form-encomenda").onsubmit = async (e) => {
    e.preventDefault();
    const clienteId = document.getElementById("enc-cliente-select").value;
    const dataEntrega = document.getElementById("enc-data-entrega").value;
    const titulo = document.getElementById("enc-titulo").value;
    const prods = [];
    document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => {
      prods.push({ receitaId: row.querySelector(".enc-prod-select").value, quantidade: Number(row.querySelector(".enc-prod-qtd").value) });
    });
    
    let total = 0;
    prods.forEach(p => {
      const r = state.receitas.find(rec => rec.id === p.receitaId);
      if (r) total += (r.precoVenda * p.quantidade);
    });

    const novo = { id: uid(), clienteId, dataEntrega, titulo, produtos: prods, valorTotal: total, status: { pago: false, entregue: false }, criado_at: new Date().toISOString() };
    state.encomendas.push(novo);
    await salvar('encomendas', novo);
    e.target.reset(); document.getElementById("enc-produtos-container").innerHTML = "";
    renderizar(); toast("Encomenda salva!");
  };

  document.getElementById("btn-add-produto-enc").onclick = () => {
    const div = document.createElement("div"); div.className = "enc-linha-row";
    div.innerHTML = `<select class="enc-prod-select" required>${state.receitas.map(r => `<option value="${r.id}">${r.nome}</option>`).join("")}</select>
      <input type="number" class="enc-prod-qtd" step="1" placeholder="Qtd" required />
      <button type="button" class="btn-mini" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById("enc-produtos-container").appendChild(div);
  };

  document.getElementById("btn-add-ingrediente").onclick = () => {
    const div = document.createElement("div"); div.className = "enc-linha-row";
    div.innerHTML = `<select class="ing-select" required>${state.itens.map(i => `<option value="${i.id}">${i.nome}</option>`).join("")}</select>
      <input type="number" class="ing-qtd" step="any" placeholder="Qtd" required />
      <button type="button" class="btn-mini" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById("ingredientes-container").appendChild(div);
  };

  document.getElementById("btn-cancelar-insumo").onclick = () => { 
    document.getElementById("form-novo-item").reset(); 
    document.getElementById("insumo-id-edit").value = ""; 
    document.getElementById("btn-salvar-insumo").textContent = "Criar Insumo"; 
    document.getElementById("btn-cancelar-insumo").classList.add("hidden"); 
  };
  
  document.getElementById("btn-cancelar-receita").onclick = () => { 
    document.getElementById("form-nova-receita").reset(); 
    document.getElementById("ingredientes-container").innerHTML = ""; 
    document.getElementById("receita-id-edit").value = ""; 
    document.getElementById("btn-salvar-receita").textContent = "Salvar Receita"; 
    document.getElementById("btn-cancelar-receita").classList.add("hidden"); 
  };
  
  document.getElementById("btn-cancelar-cliente").onclick = () => { 
    document.getElementById("form-cliente").reset(); 
    document.getElementById("cliente-id-edit").value = ""; 
    document.getElementById("btn-salvar-cliente").textContent = "Cadastrar"; 
    document.getElementById("btn-cancelar-cliente").classList.add("hidden"); 
  };

  // 5. Carregar Dados e Mostrar
  await carregar();
  renderizar();
}

window.onload = init;
window.logout = logout;
