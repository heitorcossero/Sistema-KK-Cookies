// CONFIGURAÇÕES
let supabase = null;
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
  if (!s || !s.auth) {
    console.error("Supabase não carregado.");
    return false;
  }
  try {
    const { data: { session }, error } = await s.auth.getSession();
    if (session) {
      document.getElementById("auth-container").style.display = "none";
      document.getElementById("main-app").style.display = "block";
      return true;
    } else {
      document.getElementById("auth-container").style.display = "flex";
      document.getElementById("main-app").style.display = "none";
      return false;
    }
  } catch (err) {
    console.error("Erro na sessão:", err);
    return false;
  }
}

async function login(email, password) {
  const msg = document.getElementById("login-msg");
  msg.style.color = "var(--accent-in)";
  msg.textContent = "Verificando...";
  
  const s = initSupabase();
  if (!s || !s.auth) {
    msg.style.color = "red";
    msg.textContent = "Aguarde carregando sistema...";
    return;
  }

  try {
    const { error } = await s.auth.signInWithPassword({ email, password });
    if (error) {
      msg.style.color = "red";
      msg.textContent = "Erro: " + error.message;
    } else {
      location.reload();
    }
  } catch (err) {
    msg.style.color = "red";
    msg.textContent = "Erro de conexão inesperado.";
    console.error(err);
  }
}

async function logout() {
  await supabase.auth.signOut();
  location.reload();
}

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
// AÇÕES GLOBAIS
// ==========================================

window.reverterLancamento = async (id) => {
  if (!id || id === 'undefined') { toast("Registro sem ID.", true); return; }
  if (!confirm("Desfazer este lançamento?")) return;
  const h = state.historico.find(x => x.id === id);
  if (!h) return;
  try {
    if (h.tipo === 'compra') {
      const it = state.itens.find(i => i.id === h.itemId);
      if (it) {
        it.quantidade -= Number(h.quantidade || 0);
        await salvar('itens', it);
      }
    } else if (h.tipo === 'saida') {
      const it = state.itens.find(i => i.id === h.itemId);
      if (it) {
        it.quantidade += Number(h.quantidade || 0);
        await salvar('itens', it);
      }
    } else if (h.tipo === 'producao') {
      for (const d of (h.detalhesIngredientes || [])) {
        const item = state.itens.find(i => i.id === d.itemId);
        if (item) {
          item.quantidade += Number(d.quantidade || 0);
          await salvar('itens', item);
        }
      }
    } else if (h.tipo === 'congelado') {
      state.congelados[h.receitaId] = (state.congelados[h.receitaId] || 0) - Number(h.quantidade || 0);
      await salvar('congelados', { receita_id: h.receitaId, quantidade: state.congelados[h.receitaId] });
    }
    state.historico = state.historico.filter(x => x.id !== id);
    if (supabase) await supabase.from('historico').delete().eq('id', id);
    await salvar(); 
    renderizar(); 
    toast("Lançamento revertido!");
  } catch (err) { console.error(err); toast("Erro ao reverter.", true); }
};

window.atualizarValorEncomenda = () => {
  let total = 0;
  document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => {
    const recId = row.querySelector(".prod-select").value;
    const qtdPedida = Number(row.querySelector(".prod-qtd").value) || 0;
    const receita = state.receitas.find(r => r.id === recId);
    if (receita) total += ((receita.precoVenda || 0) / (receita.rendimento || 1)) * qtdPedida;
  });
  const inputTotal = document.getElementById("enc-valor-total");
  if (inputTotal) inputTotal.value = total.toFixed(2);
};

window.editarInsumo = (id) => {
  const item = state.itens.find(x => x.id === id);
  if (item) {
    document.getElementById("insumo-id-edit").value = item.id;
    document.getElementById("novo-item-nome").value = item.nome;
    document.getElementById("novo-item-unidade").value = item.unidade;
    document.getElementById("novo-item-custo").value = item.custoMedio || 0;
    document.getElementById("novo-item-minimo").value = item.estoqueMinimo || 0;
    document.getElementById("titulo-form-insumo").textContent = "Editar Insumo";
    document.getElementById("btn-salvar-insumo").textContent = "Atualizar Insumo";
    document.getElementById("btn-cancelar-insumo").classList.remove("hidden");
    document.getElementById("tab-editar").click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    document.getElementById("btn-salvar-receita").textContent = "Atualizar Receita";
    document.getElementById("btn-cancelar-receita").classList.remove("hidden");
    document.getElementById("tab-editar").click();
  }
};

window.toggleStatus = async (id, campo) => {
  const enc = state.encomendas.find(e => e.id === id);
  if (enc) {
    enc.status[campo] = !enc.status[campo];
    if (campo === 'pago') {
      const cli = state.clientes.find(c => c.id === enc.clienteId);
      if (cli) {
        cli.ultimaConversa = new Date().toISOString();
        await salvar('clientes', cli);
      }
    }
    await salvar('encomendas', enc);
    renderizar();
  }
};

window.excluir = async (tabela, id) => {
  if (!confirm("Excluir definitivamente?")) return;
  if (tabela === 'congelados') { 
    delete state.congelados[id]; 
    if (supabase) await supabase.from('congelados').delete().eq('receita_id', id);
  }
  else { 
    state[tabela] = state[tabela].filter(x => x.id !== id); 
    if (supabase) await supabase.from(tabela).delete().eq('id', id);
  }
  await salvar(); 
  renderizar(); 
  toast("Removido.");
};

// ==========================================
// GESTÃO DE DADOS
// ==========================================

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
      state.congelados = data.congelados && typeof data.congelados === "object" && !Array.isArray(data.congelados) ? data.congelados : {};
    } catch (e) { console.error("Erro ao carregar Local:", e); }
  }

  if (supabase) {
    try {
      const [it, cl, rec, enc, hist, cong] = await Promise.all([
        supabase.from('itens').select('*'),
        supabase.from('clientes').select('*'),
        supabase.from('receitas').select('*'),
        supabase.from('encomendas').select('*'),
        supabase.from('historico').select('*').order('quando', { ascending: false }).limit(50),
        supabase.from('congelados').select('*')
      ]);

      if (!it.error && it.data) state.itens = it.data.map(i => ({...i, custoMedio: Number(i.custo_medio), estoqueMinimo: Number(i.estoque_minimo), quantidade: Number(i.quantidade)}));
      if (!cl.error && cl.data) state.clientes = cl.data.map(c => ({...c, ultimaConversa: c.ultima_conversa}));
      if (!rec.error && rec.data) state.receitas = rec.data.map(r => ({...r, precoVenda: Number(r.preco_venda), rendimento: Number(r.rendimento)}));
      if (!enc.error && enc.data) state.encomendas = enc.data.map(e => ({...e, valorTotal: Number(e.valor_total), clienteId: e.cliente_id, dataEntrega: e.data_entrega}));
      if (!hist.error && hist.data) state.historico = hist.data;
      if (!cong.error && cong.data) {
        state.congelados = {};
        cong.data.forEach(c => state.congelados[c.receita_id] = Number(c.quantidade));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) { console.error("Erro sincronia Supabase:", err); }
  }
}

async function salvar(tabela = null, dados = null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (supabase && tabela && dados) {
    try {
      const payload = Array.isArray(dados) ? dados : [dados];
      const dbPayload = payload.map(d => {
        const obj = {...d};
        if (obj.custoMedio !== undefined) { obj.custo_medio = obj.custoMedio; delete obj.custoMedio; }
        if (obj.estoqueMinimo !== undefined) { obj.estoque_minimo = obj.estoqueMinimo; delete obj.estoqueMinimo; }
        if (obj.ultimaConversa !== undefined) { obj.ultima_conversa = obj.ultimaConversa; delete obj.ultimaConversa; }
        if (obj.clienteId !== undefined) { obj.cliente_id = obj.clienteId; delete obj.clienteId; }
        if (obj.valorTotal !== undefined) { obj.valor_total = obj.valorTotal; delete obj.valorTotal; }
        if (obj.dataEntrega !== undefined) { obj.data_entrega = obj.dataEntrega; delete obj.dataEntrega; }
        if (obj.receitaId !== undefined) { obj.receita_id = obj.receitaId; delete obj.receitaId; }
        return obj;
      });
      await supabase.from(tabela).upsert(dbPayload);
    } catch (err) { console.error("Erro salvar Supabase:", err); }
  }
}

async function migrarParaNuvem() {
  if (!supabase) { toast("Nuvem não configurada!", true); return; }
  if (!confirm("Deseja enviar todos os dados locais para a nuvem?")) return;
  try {
    toast("Migrando...");
    if (state.itens.length) await salvar('itens', state.itens);
    if (state.clientes.length) await salvar('clientes', state.clientes);
    if (state.receitas.length) await salvar('receitas', state.receitas);
    if (state.encomendas.length) await salvar('encomendas', state.encomendas);
    if (state.historico.length) await salvar('historico', state.historico);
    const congArr = Object.entries(state.congelados).map(([id, q]) => ({ receita_id: id, quantidade: q }));
    if (congArr.length) await supabase.from('congelados').upsert(congArr);
    toast("✅ Sucesso!");
    renderizar();
  } catch (err) { console.error(err); toast("❌ Erro na migração.", true); }
}

function toast(msg, erro = false) {
  const t = document.getElementById("toast");
  if (t) { t.textContent = msg; t.classList.toggle("erro", erro); t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }
}

// ==========================================
// RENDERIZAÇÃO
// ==========================================

function renderizar() {
  try {
    const subtitle = document.querySelector(".subtitle");
    if (subtitle) {
      subtitle.innerHTML = supabase ? "✅ Sincronizado com a Nuvem" : `🥧 Sistema Local - ${getNomeMesAtual()}`;
      subtitle.style.color = supabase ? "var(--accent-in)" : "inherit";
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
      const pedidosAtivos = state.encomendas.filter(e => !e.status.entregue);
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

      const listaComprasEl = document.getElementById("lista-compras-consolidada");
      if (listaComprasEl) {
        const necessidades = {};
        pedidosAtivos.forEach(enc => {
          (enc.produtos || []).forEach(p => {
            const qtdNoFreezer = state.congelados[p.receitaId || p.id] || 0;
            const qtdAFazer = Math.max(0, p.quantidade - qtdNoFreezer);
            if (qtdAFazer > 0) {
              const rec = state.receitas.find(r => r.id === (p.receitaId || p.id));
              if (rec) (rec.ingredientes || []).forEach(ing => { necessidades[ing.itemId] = (necessidades[ing.itemId] || 0) + (Number(ing.quantidade) * qtdAFazer); });
            }
          });
        });
        const paraComprar = [];
        for (const itemId in necessidades) {
          const item = state.itens.find(i => i.id === itemId);
          const falta = necessidades[itemId] - (item?.quantidade || 0);
          if (falta > 0) paraComprar.push({ nome: item?.nome || "Insumo", qtd: falta, un: item?.unidade || "" });
        }
        listaComprasEl.innerHTML = paraComprar.length ? `<strong>📋 Lista de Compras:</strong><ul>${paraComprar.map(it => `<li>${it.nome}: <strong>${formatarQtd(it.qtd)} ${it.un}</strong></li>`).join("")}</ul>` : (pedidosAtivos.length ? "✅ Tudo pronto!" : "Sem pedidos.");
        listaComprasEl.className = `enc-banner ${paraComprar.length ? 'falta' : 'ok'}`;
      }
    }

    const cap = state.itens.reduce((acc, i) => acc + (i.quantidade * i.custoMedio), 0);
    const lucRealMes = state.historico.reduce((acc, h) => {
      if (h.tipo === 'producao' && h.lucro && isMesAtual(h.quando)) return acc + Number(h.lucro);
      return acc;
    }, 0);
    const lucPot = cap > 0 ? (cap * 3.7) - cap : 0;
    if (document.getElementById("valor-total")) document.getElementById("valor-total").textContent = formatarMoeda(cap);
    if (document.getElementById("lucro-producoes")) {
      document.getElementById("lucro-producoes").textContent = formatarMoeda(lucRealMes);
      const h3 = document.getElementById("lucro-producoes").parentElement.querySelector("h3");
      if (h3) h3.textContent = `📈 Lucro em ${getNomeMesAtual()}`;
    }
    if (document.getElementById("lucro-markup-estoque")) document.getElementById("lucro-markup-estoque").textContent = formatarMoeda(lucPot);

    const elMedia = document.getElementById("media-cookies-pedido");
    if (elMedia) {
      const totalCookies = state.encomendas.reduce((acc, enc) => acc + (enc.produtos || []).reduce((sum, p) => sum + (Number(p.quantidade) || 0), 0), 0);
      const media = state.encomendas.length ? (totalCookies / state.encomendas.length).toFixed(1) : 0;
      elMedia.textContent = `${media} un`;
    }

    const dSabor = document.getElementById("lista-desempenho-sabores");
    if (dSabor) {
      const pedMes = state.encomendas.filter(e => isMesAtual(e.dataEntrega));
      const stats = {};
      pedMes.forEach(e => (e.produtos || []).forEach(p => {
        const id = p.receitaId || p.id;
        if (!stats[id]) { const r = state.receitas.find(x => x.id === id); stats[id] = { nome: r?.nome || '?', qtd: 0, rObj: r }; }
        stats[id].qtd += Number(p.quantidade);
      }));
      const sArr = Object.values(stats).sort((a,b) => b.qtd - a.qtd);
      dSabor.innerHTML = sArr.length ? `<table class="tabela-info"><thead><tr><th>Sabor</th><th>Qtd</th><th>Lucro Est.</th></tr></thead><tbody>${sArr.map(s => {
        const c = s.rObj ? calcularCustoReceita(s.rObj) : 0;
        const l = s.rObj ? ((s.rObj.precoVenda - c) / s.rObj.rendimento) * s.qtd : 0;
        return `<tr><td><strong>${s.nome}</strong></td><td style="text-align:center">${s.qtd} un</td><td style="text-align:right; color:var(--accent-in)">${formatarMoeda(l)}</td></tr>`;
      }).join("")}</tbody></table>` : '<p class="muted-small">Nenhuma venda entregue este mês.</p>';
    }

    const lHist = document.getElementById("lista-historico-estoque");
    if (lHist) lHist.innerHTML = state.historico.slice(0, 30).map(h => `<li class="mov"><div style="flex:1"><strong>${formatarData(h.quando)}</strong> - ${h.texto}</div><button class="btn-mini" onclick="reverterLancamento('${h.id}')">Desfazer</button></li>`).join("");
    
    const listaCli = document.getElementById("lista-clientes");
    if (listaCli) {
      const cliOrd = [...state.clientes].sort((a,b) => new Date(a.ultimaConversa || 0) - new Date(b.ultimaConversa || 0));
      listaCli.innerHTML = cliOrd.map(c => {
        const pCli = state.encomendas.filter(e => e.clienteId === c.id);
        const ltv = pCli.reduce((acc, e) => acc + (Number(e.valorTotal) || 0), 0);
        return `<article class="card-encomenda"><header><div style="flex:1"><div class="flex-row" style="justify-content:space-between; align-items: center; margin-bottom:0.5rem"><h3 class="enc-titulo">${escapeHtml(c.nome)}</h3><div style="background:var(--money-dim); color:var(--money); padding:4px 10px; border-radius:20px; font-weight:700; font-size:0.9rem">LTV: ${formatarMoeda(ltv)}</div></div><p class="enc-meta">Conversa: <strong>${formatarData(c.ultimaConversa)}</strong></p></div><div class="flex-row"><button class="btn-mini" onclick="editarCliente('${c.id}')">Editar</button>${c.whatsapp ? `<a href="https://wa.me/55${c.whatsapp.replace(/\D/g,'')}" target="_blank" class="btn-mini" style="color:#10b981; border-color:#10b981">Zap</a>` : ''}<button class="btn-mini" onclick="excluir('clientes', '${c.id}')">X</button></div></header><p style="font-size:0.85rem; color:var(--muted); margin-top:0.5rem">${escapeHtml(c.conversa || '')}</p></article>`;
      }).join("");
    }

    const containerRec = document.getElementById("lista-receitas-editar");
    if (containerRec) containerRec.innerHTML = state.receitas.map(r => `<div class="card-receita-edit"><h3>${escapeHtml(r.nome)} (${r.rendimento} un)</h3><p class="muted-small">Produção: ${formatarMoeda(calcularCustoReceita(r))} | Venda: ${formatarMoeda(r.precoVenda)}</p><p class="potencial-valor potencial-lucro">Lucro: ${formatarMoeda(r.precoVenda - calcularCustoReceita(r))}</p><div class="btn-row"><button class="btn-mini" onclick="editarReceita('${r.id}')">Editar</button><button class="btn-mini" onclick="excluir('receitas', '${r.id}')">X</button></div></div>`).join("");

    const containerEdit = document.getElementById("editar-itens-container");
    if (containerEdit) containerEdit.innerHTML = `<table class="tabela-info"><thead><tr><th>Insumo</th><th>Custo</th><th>Mín.</th><th>Ações</th></tr></thead><tbody>` + state.itens.map(it => `<tr><td>${it.nome}</td><td>${formatarMoedaLonga(it.custoMedio)}</td><td>${it.estoqueMinimo} ${it.unidade}</td><td><div class="flex-row"><button class="btn-mini" onclick="editarInsumo('${it.id}')">Editar</button><button class="btn-mini" onclick="excluir('itens', '${it.id}')">X</button></div></td></tr>`).join("") + "</tbody></table>";

    atualizarSelects();
  } catch (err) { console.error("Erro renderização:", err); }
}

function atualizarSelects() {
  const optItens = '<option value="">-- Selecione --</option>' + state.itens.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(i => `<option value="${i.id}">${i.nome} (${i.unidade})</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, .ing-select").forEach(s => { const v = s.value; s.innerHTML = optItens; s.value = v; });
  const optRec = '<option value="">-- Selecione --</option>' + state.receitas.sort((a,b) => (a.nome || "").localeCompare(b.nome || "")).map(r => `<option value="${r.id}">${r.nome}</option>`).join("");
  document.querySelectorAll("#produzir-receita-id, #congelado-receita-id").forEach(s => { const v = s.value; s.innerHTML = optRec; s.value = v; });
  const selCli = document.getElementById("enc-cliente-select");
  if (selCli) { const v = selCli.value; selCli.innerHTML = '<option value="">-- Cliente --</option>' + state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join(""); selCli.value = v; }
}

function calcularCustoReceita(r) { return (r.ingredientes || []).reduce((acc, ing) => { const item = state.itens.find(i => i.id === ing.itemId); return acc + (Number(ing.quantidade) * (item?.custoMedio || 0)); }, 0); }

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

// ==========================================
// INICIALIZAÇÃO E EVENTOS
// ==========================================

async function init() {
  const logado = await verificarSessao();
  
  // Configurar formulário de login
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const senha = document.getElementById("login-senha").value;
      await login(email, senha);
    };
  }

  if (!logado) return; // Para aqui se não estiver logado

  await carregar();

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
    if (item && qtd > 0) {
      item.custoMedio = (item.quantidade * item.custoMedio + preco) / (item.quantidade + qtd);
      item.quantidade += qtd;
      const h = { id: uid(), tipo: 'compra', itemId: id, quantidade: qtd, texto: `Compra: ${qtd}${item.unidade} ${item.nome}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('itens', item);
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Compra registrada!");
    }
  };

  document.getElementById("form-saida-manual").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("saida-manual-id").value;
    const qtd = Number(document.getElementById("saida-manual-qtd").value);
    const item = state.itens.find(i => i.id === id);
    if (item && item.quantidade >= qtd && qtd > 0) {
      item.quantidade -= qtd;
      const h = { id: uid(), tipo: 'saida', itemId: id, quantidade: qtd, texto: `Saída Manual: ${qtd}${item.unidade} ${item.nome}`, quando: new Date().toISOString() };
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
      const h = { id: uid(), tipo: 'congelado', receitaId: recId, quantidade: qtd * tipo, texto: `${tipo > 0 ? 'Entrada' : 'Saída'} Freezer: ${qtd}un ${r?.nome || 'Cookie'}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('congelados', { receita_id: recId, quantidade: state.congelados[recId] });
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Freezer atualizado!");
    }
  };

  document.getElementById("btn-add-ingrediente").onclick = () => {
    const div = document.createElement("div"); div.className = "enc-linha-row";
    div.innerHTML = `<select class="ing-select" required>${state.itens.sort((a,b) => a.nome.localeCompare(b.nome)).map(i => `<option value="${i.id}">${i.nome} (${i.unidade})</option>`).join("")}</select>
      <input type="number" class="ing-qtd" step="any" placeholder="Qtd" required />
      <button type="button" class="btn-mini" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById("ingredientes-container").appendChild(div);
  };

  document.getElementById("btn-add-produto-enc").onclick = () => {
    const div = document.createElement("div"); div.className = "enc-linha-row";
    div.innerHTML = `<select class="prod-select" required onchange="atualizarValorEncomenda()">${state.receitas.sort((a,b) => a.nome.localeCompare(b.nome)).map(r => `<option value="${r.id}">${r.nome}</option>`).join("")}</select>
      <input type="number" class="prod-qtd" step="any" placeholder="Qtd" value="1" required oninput="atualizarValorEncomenda()" />
      <button type="button" class="btn-mini" onclick="this.parentElement.remove(); atualizarValorEncomenda()">X</button>`;
    document.getElementById("enc-produtos-container").appendChild(div);
    atualizarValorEncomenda();
  };

  document.getElementById("form-cliente").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = document.getElementById("cliente-id-edit").value;
    const dConv = document.getElementById("cliente-ultima-conversa").value;
    const dados = { id: idEdit || uid(), nome: document.getElementById("cliente-nome").value, whatsapp: document.getElementById("cliente-whatsapp").value, conversa: document.getElementById("cliente-conversa").value, ultimaConversa: dConv ? new Date(dConv).toISOString() : new Date().toISOString() };
    if (idEdit) { Object.assign(state.clientes.find(x => x.id === idEdit), dados); } else { state.clientes.push(dados); }
    await salvar('clientes', dados);
    e.target.reset(); document.getElementById("cliente-id-edit").value = ""; document.getElementById("btn-salvar-cliente").textContent = "Cadastrar"; document.getElementById("btn-cancelar-cliente").classList.add("hidden"); renderizar(); toast("Cliente salvo!");
  };

  document.getElementById("form-nova-receita").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = document.getElementById("receita-id-edit").value;
    const ings = [];
    document.querySelectorAll("#ingredientes-container .enc-linha-row").forEach(row => { ings.push({ itemId: row.querySelector(".ing-select").value, quantidade: Number(row.querySelector(".ing-qtd").value) }); });
    const dados = { id: idEdit || uid(), nome: document.getElementById("receita-nome").value, rendimento: Number(document.getElementById("receita-rendimento").value) || 1, precoVenda: Number(document.getElementById("receita-preco-venda").value) || 0, ingredientes: ings };
    if (idEdit) { Object.assign(state.receitas.find(x => x.id === idEdit), dados); } else { state.receitas.push(dados); }
    await salvar('receitas', dados);
    e.target.reset(); document.getElementById("ingredientes-container").innerHTML = ""; document.getElementById("receita-id-edit").value = ""; document.getElementById("btn-salvar-receita").textContent = "Salvar Receita"; document.getElementById("btn-cancelar-receita").classList.add("hidden"); renderizar(); toast("Receita salva!");
  };

  document.getElementById("form-encomenda").onsubmit = async (e) => {
    e.preventDefault();
    const prods = [];
    document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => { prods.push({ receitaId: row.querySelector(".prod-select").value, quantidade: Number(row.querySelector(".prod-qtd").value) }); });
    const cId = document.getElementById("enc-cliente-select").value;
    const dEnt = document.getElementById("enc-data-entrega").value;
    const dados = { id: uid(), clienteId: cId, dataEntrega: dEnt || new Date().toISOString().split('T')[0], titulo: document.getElementById("enc-titulo").value, valorTotal: Number(document.getElementById("enc-valor-total").value), produtos: prods, status: { pago: false, massaFeita: false, assado: false, tudoPronto: false, entregue: false } };
    state.encomendas.push(dados);
    const cli = state.clientes.find(c => c.id === cId);
    if (cli) {
      cli.ultimaConversa = new Date().toISOString();
      await salvar('clientes', cli);
    }
    await salvar('encomendas', dados);
    e.target.reset(); document.getElementById("enc-produtos-container").innerHTML = ""; renderizar(); toast("Pedido registrado!");
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
      const h = { id: uid(), tipo: 'producao', lucro: lucroG, detalhesIngredientes: dets, texto: `Produção: ${mult}x ${r.nome}`, quando: new Date().toISOString() };
      state.historico.unshift(h);
      await salvar('historico', h);
      e.target.reset(); renderizar(); toast("Estoque baixado!");
    }
  };

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
    e.target.reset(); document.getElementById("insumo-id-edit").value = ""; document.getElementById("titulo-form-insumo").textContent = "Novo Insumo"; document.getElementById("btn-salvar-insumo").textContent = "Criar Insumo"; document.getElementById("btn-cancelar-insumo").classList.add("hidden"); renderizar(); toast("Insumo salvo!");
  };

  document.getElementById("btn-cancelar-insumo").onclick = () => { document.getElementById("form-novo-item").reset(); document.getElementById("insumo-id-edit").value = ""; document.getElementById("titulo-form-insumo").textContent = "Novo Insumo"; document.getElementById("btn-salvar-insumo").textContent = "Criar Insumo"; document.getElementById("btn-cancelar-insumo").classList.add("hidden"); };
  document.getElementById("btn-cancelar-receita").onclick = () => { document.getElementById("form-nova-receita").reset(); document.getElementById("ingredientes-container").innerHTML = ""; document.getElementById("receita-id-edit").value = ""; document.getElementById("btn-salvar-receita").textContent = "Salvar Receita"; document.getElementById("btn-cancelar-receita").classList.add("hidden"); };
  document.getElementById("btn-cancelar-cliente").onclick = () => { document.getElementById("form-cliente").reset(); document.getElementById("cliente-id-edit").value = ""; document.getElementById("btn-salvar-cliente").textContent = "Cadastrar"; document.getElementById("btn-cancelar-cliente").classList.add("hidden"); };

  renderizar();
}

window.onload = init;
