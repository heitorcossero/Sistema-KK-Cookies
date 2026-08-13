// Renderização de todas as telas
import { state, initSupabase, calcularCustoReceita } from "./data.js";
import { MARKUP } from "./config.js";
import {
  escapeHtml, formatarMoeda, formatarMoedaLonga, formatarQtd,
  formatarData, formatarDataCurta, isMesAtual, getNomeMesAtual
} from "./utils.js";

const el = (id) => document.getElementById(id);

// Etapas do pedido, na ordem do fluxo de produção
const ETAPAS_PEDIDO = [
  { campo: "pago", rotulo: "Pago", classe: "chip-pago" },
  { campo: "massaFeita", rotulo: "Massa feita", classe: "" },
  { campo: "assado", rotulo: "Assado", classe: "" },
  { campo: "entregue", rotulo: "Entregue", classe: "" }
];

export function renderizar() {
  try {
    renderSyncStatus();
    renderAlertas();
    renderEstoque();
    renderCongelados();
    renderClientes();
    renderHistorico();
    renderEncomendas();
    renderReceitas();
    renderInsumosTabela();
    renderListaCompras();
    renderResumo();
    atualizarSelects();
  } catch (e) { console.error(e); }
}

function renderSyncStatus() {
  const s = initSupabase();
  const status = el("sync-status");
  if (status) {
    status.textContent = s ? "Sincronizado com a nuvem" : `Modo local — ${getNomeMesAtual()}`;
    status.classList.toggle("ok", !!s);
  }
}

function renderAlertas() {
  const box = el("alertas-estoque");
  if (!box) return;
  const baixos = state.itens.filter(i => i.estoqueMinimo > 0 && i.quantidade <= i.estoqueMinimo);
  box.classList.toggle("hidden", baixos.length === 0);
  box.innerHTML = baixos.length
    ? `<h3>Insumos em nível crítico</h3><ul>${baixos.map(i =>
        `<li>${escapeHtml(i.nome)}: ${formatarQtd(i.quantidade)} ${escapeHtml(i.unidade)} (mínimo: ${formatarQtd(i.estoqueMinimo)})</li>`
      ).join("")}</ul>`
    : "";
}

function renderEstoque() {
  const lista = el("lista-estoque");
  if (!lista) return;
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  lista.innerHTML = itens.map(it => `
    <li class="item-estoque ${it.estoqueMinimo > 0 && it.quantidade <= it.estoqueMinimo ? "alerta-baixo" : ""}">
      <div>
        <strong class="nome">${escapeHtml(it.nome)}</strong>
        <small class="item-preco-linha">Custo: ${formatarMoedaLonga(it.custoMedio)} / ${escapeHtml(it.unidade)}</small>
        <small class="item-preco-linha total">Total: ${formatarMoeda(it.quantidade * it.custoMedio)}</small>
      </div>
      <span class="saldo">${formatarQtd(it.quantidade)} ${escapeHtml(it.unidade)}</span>
    </li>`).join("") || '<p class="vazio">Nenhum insumo ainda. Cadastre o primeiro na aba <strong>Cadastros</strong>.</p>';
}

function renderCongelados() {
  const lista = el("lista-congelados");
  if (!lista) return;
  const itens = Object.entries(state.congelados).filter(([, qtd]) => qtd > 0);
  lista.innerHTML = itens.length
    ? itens.map(([recId, qtd]) => {
        const receita = state.receitas.find(r => r.id === recId);
        return `<li class="item-estoque"><div><strong class="nome">${escapeHtml(receita?.nome || "Cookie")}</strong></div><span class="saldo">${qtd} un</span></li>`;
      }).join("")
    : '<p class="vazio">Freezer vazio — nada congelado por aqui.</p>';
}

function renderClientes() {
  const lista = el("lista-clientes");
  if (!lista) return;
  const clientes = [...state.clientes].sort((a, b) => new Date(a.ultimaConversa || 0) - new Date(b.ultimaConversa || 0));
  lista.innerHTML = clientes.map(c => {
    const pedidosCli = state.encomendas.filter(e => e.clienteId === c.id);
    const ltv = pedidosCli.reduce((acc, p) => acc + (p.valorTotal || 0), 0);
    const fone = (c.whatsapp || "").replace(/\D/g, "");

    const pedidosHtml = pedidosCli.map(p => {
      const prods = (p.produtos || []).map(pr => {
        const r = state.receitas.find(rec => rec.id === pr.receitaId);
        return `${pr.quantidade}x ${escapeHtml(r?.nome || "Cookie")}`;
      }).join(", ");
      return `<small style="display:block; margin-bottom:0.3rem">• <strong>${formatarDataCurta(p.dataEntrega)}</strong>: ${prods} (${formatarMoeda(p.valorTotal)})</small>`;
    }).join("") || '<small class="muted-small">Nenhum pedido realizado.</small>';

    return `<article class="card-encomenda">
      <div class="flex-row entre">
        <h3>${escapeHtml(c.nome)}</h3>
        <div class="btn-row">
          <button type="button" class="btn-mini" data-action="editar-cliente" data-id="${c.id}">Editar</button>
          <button type="button" class="btn-mini perigo" data-action="excluir-cliente" data-id="${c.id}">Excluir</button>
        </div>
      </div>
      <p class="enc-meta"><strong>Notas:</strong> ${escapeHtml(c.conversa || "Sem observações")}</p>
      <p class="enc-meta"><strong>Total já comprado:</strong> <span class="enc-total">${formatarMoeda(ltv)}</span></p>
      <div class="flex-row entre" style="margin-top:0.5rem">
        ${fone ? `<a href="https://wa.me/${fone}" target="_blank" rel="noopener" class="link-whatsapp">WhatsApp</a>` : "<span></span>"}
        <small class="muted-small" style="margin:0">Última conversa: ${formatarDataCurta(c.ultimaConversa)}</small>
      </div>
      <details class="cliente-historico" style="margin-top:0.7rem">
        <summary>Histórico de pedidos (${pedidosCli.length})</summary>
        <div class="pedidos-mini">${pedidosHtml}</div>
      </details>
    </article>`;
  }).join("") || '<p class="vazio">Nenhum cliente ainda. Cadastre o primeiro no formulário acima.</p>';
}

function renderHistorico() {
  const itemHtml = (h) => `
    <li>
      <span class="quando">${formatarData(h.quando)}</span>
      <span class="texto">${escapeHtml(h.texto)}</span>
      <button type="button" class="btn-mini" data-action="desfazer" data-id="${h.id}">Desfazer</button>
    </li>`;

  const listaEstoque = el("lista-historico-estoque");
  if (listaEstoque) {
    listaEstoque.innerHTML = state.historico.slice(0, 15).map(itemHtml).join("")
      || '<p class="vazio">Nenhum lançamento ainda.</p>';
  }

  const listaResumo = el("lista-historico-resumo");
  if (listaResumo) {
    listaResumo.innerHTML = state.historico.slice(0, 100).map(itemHtml).join("")
      || '<p class="vazio">Nenhuma movimentação registrada.</p>';
  }
}

function statusPedido(e) {
  return { pago: false, massaFeita: false, assado: false, entregue: false, ...(e.status || {}) };
}

function cardEncomenda(e) {
  const cliente = state.clientes.find(c => c.id === e.clienteId);
  const st = statusPedido(e);

  const itensHtml = (e.produtos || []).map(p => {
    const rec = state.receitas.find(r => r.id === p.receitaId);
    const noFreezer = state.congelados[p.receitaId] || 0;
    const falta = Math.max(0, p.quantidade - noFreezer);
    if (falta === 0) {
      return `<div class="pedido-linha pronto">• ${p.quantidade} un ${escapeHtml(rec?.nome || "Cookie")} <strong>(pronto no freezer)</strong></div>`;
    }
    return `<div class="pedido-linha">• ${p.quantidade} un ${escapeHtml(rec?.nome || "Cookie")} <span class="falta">(produzir: ${falta} un · freezer: ${noFreezer} un)</span></div>`;
  }).join("");

  const chips = ETAPAS_PEDIDO.map(et => `
    <label class="chip ${et.classe} ${st[et.campo] ? "on" : ""}">
      <input type="checkbox" data-action="status-pedido" data-id="${e.id}" data-campo="${et.campo}" ${st[et.campo] ? "checked" : ""} />
      ${st[et.campo] ? "✓ " : ""}${et.rotulo}
    </label>`).join("");

  return `<article class="card-encomenda ${st.entregue ? "entregue" : ""}">
    <div class="flex-row entre">
      <h3>${escapeHtml(e.titulo || "Pedido")} — ${escapeHtml(cliente?.nome || "Cliente")}</h3>
      <div class="btn-row">
        <button type="button" class="btn-mini" data-action="editar-encomenda" data-id="${e.id}">Editar</button>
        <button type="button" class="btn-mini perigo" data-action="excluir-encomenda" data-id="${e.id}">Excluir</button>
      </div>
    </div>
    <div class="pedido-detalhes">${itensHtml}</div>
    <p class="enc-meta">Entrega: <strong>${formatarDataCurta(e.dataEntrega)}</strong> · Total: <span class="enc-total">${formatarMoeda(e.valorTotal)}</span></p>
    <div class="status-chips">${chips}</div>
  </article>`;
}

function renderEncomendas() {
  const lista = el("lista-encomendas");
  if (!lista) return;

  const ordenadas = [...state.encomendas].sort((a, b) => new Date(a.dataEntrega || 0) - new Date(b.dataEntrega || 0));
  const andamento = ordenadas.filter(e => !statusPedido(e).entregue);
  const entregues = ordenadas.filter(e => statusPedido(e).entregue);

  lista.innerHTML = andamento.map(cardEncomenda).join("")
    || '<p class="vazio">Nenhum pedido em andamento. Forno tranquilo por enquanto!</p>';

  const listaConcluidas = el("lista-encomendas-concluidas");
  if (listaConcluidas) {
    listaConcluidas.innerHTML = entregues.map(cardEncomenda).join("")
      || '<p class="vazio">Nenhum pedido entregue ainda.</p>';
  }
  const resumoConcluidos = el("resumo-concluidos");
  if (resumoConcluidos) resumoConcluidos.textContent = `Pedidos entregues (${entregues.length})`;
}

function renderReceitas() {
  const container = el("lista-receitas-editar");
  if (!container) return;
  container.innerHTML = state.receitas.map(r => {
    const custoTotal = calcularCustoReceita(r);
    const rend = r.rendimento || 1;
    const custoUnit = custoTotal / rend;
    const lucroTotal = r.precoVenda - custoTotal;
    const lucroUnit = (r.precoVenda / rend) - custoUnit;
    const suspeito = custoUnit > 20;

    return `<div class="card-receita-edit ${suspeito ? "suspeito" : ""}">
      <div class="flex-row entre">
        <h3>${escapeHtml(r.nome)}</h3>
        <div class="btn-row">
          <button type="button" class="btn-mini" data-action="editar-receita" data-id="${r.id}">Editar</button>
          <button type="button" class="btn-mini perigo" data-action="excluir-receita" data-id="${r.id}">Excluir</button>
        </div>
      </div>
      <p class="muted-small" style="margin:0.3rem 0 0">Custo total: ${formatarMoeda(custoTotal)} · <span class="linha-lucro">Lucro total: ${formatarMoeda(lucroTotal)}</span></p>
      <p class="muted-small" style="margin:0.15rem 0 0">Custo unitário: ${formatarMoeda(custoUnit)} · <span class="linha-lucro">Lucro unitário: ${formatarMoeda(lucroUnit)}</span></p>
      <p class="muted-small" style="margin:0.15rem 0 0">Rendimento: ${rend} un · Venda total: ${formatarMoeda(r.precoVenda)}</p>
      ${suspeito ? '<p class="aviso-suspeito">Custo unitário muito alto — confira se as quantidades da receita e o custo dos insumos estão na unidade certa.</p>' : ""}
    </div>`;
  }).join("") || '<p class="vazio">Nenhuma receita ainda. Crie a primeira no formulário acima.</p>';
}

function renderInsumosTabela() {
  const container = el("editar-itens-container");
  if (!container) return;
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  if (!itens.length) {
    container.innerHTML = '<p class="vazio">Nenhum insumo cadastrado.</p>';
    return;
  }
  container.innerHTML = `<table class="tabela-info"><thead><tr><th>Insumo</th><th>Custo (R$)</th><th>Ações</th></tr></thead><tbody>` +
    itens.map(it => `<tr>
      <td>${escapeHtml(it.nome)}</td>
      <td><input type="number" step="any" min="0" value="${it.custoMedio}" data-action="custo-insumo" data-id="${it.id}" aria-label="Custo do insumo" /></td>
      <td><div class="btn-row" style="margin:0">
        <button type="button" class="btn-mini" data-action="editar-insumo" data-id="${it.id}">Editar</button>
        <button type="button" class="btn-mini perigo" data-action="excluir-insumo" data-id="${it.id}">Excluir</button>
      </div></td>
    </tr>`).join("") + "</tbody></table>";
}

function renderListaCompras() {
  const container = el("lista-compras-consolidada");
  if (!container) return;

  // total pedido por sabor, apenas de pedidos ainda não entregues
  const totalPorSabor = {};
  state.encomendas.filter(e => !statusPedido(e).entregue).forEach(enc => {
    (enc.produtos || []).forEach(p => {
      totalPorSabor[p.receitaId] = (totalPorSabor[p.receitaId] || 0) + p.quantidade;
    });
  });

  const totalNecessario = {};
  Object.entries(totalPorSabor).forEach(([recId, totalQtd]) => {
    const rec = state.receitas.find(r => r.id === recId);
    if (!rec) return;
    const noFreezer = state.congelados[recId] || 0;
    const realNecessario = Math.max(0, totalQtd - noFreezer);
    if (realNecessario <= 0) return;
    const batches = Math.ceil(realNecessario / (rec.rendimento || 1));
    (rec.ingredientes || []).forEach(ing => {
      const item = state.itens.find(i => i.id === ing.itemId);
      if (!item) return;
      if (!totalNecessario[item.id]) totalNecessario[item.id] = { nome: item.nome, qtd: 0, unidade: item.unidade };
      totalNecessario[item.id].qtd += ing.quantidade * batches;
    });
  });

  const html = Object.entries(totalNecessario).map(([id, info]) => {
    const itemEstoque = state.itens.find(i => i.id === id);
    const falta = Math.max(0, info.qtd - (itemEstoque?.quantidade || 0));
    if (falta <= 0) return "";
    return `<div class="lista-compras-item">• <strong>${escapeHtml(info.nome)}</strong>: precisa de ${formatarQtd(info.qtd)}${escapeHtml(info.unidade)} <span class="falta">(falta ${formatarQtd(falta)}${escapeHtml(info.unidade)})</span></div>`;
  }).filter(Boolean).join("");

  container.innerHTML = html || '<p class="vazio">Estoque e freezer dão conta de todos os pedidos. <strong>Nada a comprar!</strong></p>';
}

function renderResumo() {
  // 1. Valor em estoque (insumos + freezer a preço de custo)
  let vEstoque = 0;
  state.itens.forEach(it => {
    vEstoque += (Number(it.quantidade) || 0) * (Number(it.custoMedio) || 0);
  });
  Object.entries(state.congelados).forEach(([recId, qtd]) => {
    const r = state.receitas.find(rec => rec.id === recId);
    const q = Number(qtd) || 0;
    if (r && q > 0) {
      vEstoque += (calcularCustoReceita(r) / (Number(r.rendimento) || 1)) * q;
    }
  });

  // 2. Faturamento realizado (produções registradas no histórico)
  const faturamentoRealizado = (state.historico || []).reduce((acc, h) => {
    if (h.tipo === "producao") return acc + (Number(h.faturamento) || Number(h.lucro) || 0);
    return acc;
  }, 0);

  const elV = el("valor-total");
  if (elV) elV.textContent = formatarMoeda(vEstoque);
  const elF = el("lucro-producoes");
  if (elF) elF.textContent = formatarMoeda(faturamentoRealizado);
  const elP = el("lucro-markup-estoque");
  if (elP) elP.textContent = formatarMoeda(vEstoque * MARKUP);
  const elHintMarkup = el("hint-markup");
  if (elHintMarkup) elHintMarkup.textContent = `Lucro estimado (markup ${MARKUP})`;

  // 3. Média de cookies por pedido (geral)
  let totalCookies = 0;
  state.encomendas.forEach(e => {
    (e.produtos || []).forEach(p => { totalCookies += Number(p.quantidade || 0); });
  });
  const elMedia = el("media-cookies-pedido");
  if (elMedia) {
    elMedia.textContent = state.encomendas.length
      ? `${(totalCookies / state.encomendas.length).toFixed(1)} un`
      : "0 un";
  }

  // 4. Sabores mais pedidos NO MÊS ATUAL (usa a data de entrega; sem data, usa a de criação)
  const titulo = el("titulo-desempenho");
  if (titulo) titulo.textContent = `Sabores mais pedidos — ${getNomeMesAtual()}`;

  const sabores = {};
  state.encomendas
    .filter(e => isMesAtual(e.dataEntrega || e.criado_at || e.created_at))
    .forEach(enc => {
      (enc.produtos || []).forEach(p => {
        const rec = state.receitas.find(r => r.id === p.receitaId);
        if (rec) sabores[rec.nome] = (sabores[rec.nome] || 0) + p.quantidade;
      });
    });

  const elSabores = el("lista-desempenho-sabores");
  if (elSabores) {
    const rank = Object.entries(sabores).sort((a, b) => b[1] - a[1]);
    elSabores.innerHTML = rank.length
      ? rank.map(([nome, qtd], i) => `
          <div class="sabor-row">
            <span class="sabor-pos">${i + 1}º</span>
            <span class="sabor-nome">${escapeHtml(nome)}</span>
            <span class="sabor-qtd">${qtd} un</span>
          </div>`).join("")
      : '<p class="vazio">Nenhum pedido com entrega neste mês ainda.</p>';
  }
}

export function atualizarSelects() {
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const optItens = '<option value="">-- Selecione --</option>' + itens.map(i => `<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, .ing-select").forEach(s => { const v = s.value; s.innerHTML = optItens; s.value = v; });

  const receitas = [...state.receitas].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const optRec = '<option value="">-- Selecione --</option>' + receitas.map(r => `<option value="${r.id}">${escapeHtml(r.nome)}</option>`).join("");
  document.querySelectorAll("#produzir-receita-id, #congelado-receita-id, .enc-prod-select").forEach(s => { const v = s.value; s.innerHTML = optRec; s.value = v; });

  const clientes = [...state.clientes].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const optCli = '<option value="">-- Selecione --</option>' + clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  document.querySelectorAll("#enc-cliente-select").forEach(s => { const v = s.value; s.innerHTML = optCli; s.value = v; });
}

// Linhas dinâmicas de ingrediente / produto
export function novaLinhaIngrediente(ing = null) {
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const div = document.createElement("div");
  div.className = "enc-linha-row";
  div.innerHTML = `<select class="ing-select" required>${itens.map(i =>
      `<option value="${i.id}" ${ing && i.id === ing.itemId ? "selected" : ""}>${escapeHtml(i.nome)}</option>`).join("")}</select>
    <input type="number" class="ing-qtd" step="any" min="0" placeholder="Qtd" value="${ing ? ing.quantidade : ""}" required />
    <button type="button" class="btn-mini perigo" data-action="remover-linha">X</button>`;
  return div;
}

export function novaLinhaProduto(p = null) {
  const receitas = [...state.receitas].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const div = document.createElement("div");
  div.className = "enc-linha-row";
  div.innerHTML = `<select class="enc-prod-select" required>${receitas.map(r =>
      `<option value="${r.id}" ${p && r.id === p.receitaId ? "selected" : ""}>${escapeHtml(r.nome)}</option>`).join("")}</select>
    <input type="number" class="enc-prod-qtd" step="1" min="1" placeholder="Qtd" value="${p ? p.quantidade : ""}" required />
    <button type="button" class="btn-mini perigo" data-action="remover-linha">X</button>`;
  return div;
}
