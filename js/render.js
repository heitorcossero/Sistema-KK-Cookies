// Renderização de todas as telas
import { state, initSupabase, calcularCustoReceita, conexao } from "./data.js";
import { MARKUP, CATEGORIAS, nomeCategoria, nomeForma, naturezaCategoria } from "./config.js";
import { desenharGraficoFaturamento, desenharFluxoCaixa } from "./chart.js";
import {
  PERIODOS, intervaloDoPeriodo, nomeDoPeriodo, resumoFinanceiro, saldoEmCaixa,
  porCategoria, fluxoDiario, saldoAntesDe, aReceber, recorrentesPendentes,
  vencimentoNesteMes, hojeChave
} from "./finance.js";
import {
  escapeHtml, formatarMoeda, formatarMoedaLonga, formatarMoedaExata, formatarQtd,
  formatarData, formatarDataCurta, isMesAtual, getNomeMesAtual
} from "./utils.js";

const el = (id) => document.getElementById(id);

// Etapas de produção — esta lista é uma sequência de verdade: a massa vem
// antes do forno, o forno antes da entrega. É o que a esteira desenha.
const ETAPAS_PRODUCAO = [
  { campo: "massaFeita", rotulo: "Massa" },
  { campo: "assado", rotulo: "Assado" },
  { campo: "entregue", rotulo: "Entregue" }
];

const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 6.2l2.4 2.4 4.8-4.8"/></svg>';

const ICONE_WHATSAPP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.6 4.8-1.3A10 10 0 1012 2zm0 2a8 8 0 110 16 8 8 0 01-4.2-1.2l-.4-.2-2.4.6.6-2.3-.2-.4A8 8 0 0112 4zm-3 3.6c-.2 0-.5 0-.7.4-.3.4-1 .9-1 2.2s1 2.6 1.2 2.8c.1.2 2 3.2 5 4.3 2.4.9 2.9.7 3.4.7.5-.1 1.6-.7 1.9-1.3.2-.7.2-1.2.1-1.3l-.6-.4-1.6-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.5.1a6.5 6.5 0 01-3.3-2.9c-.2-.3 0-.5.1-.6l.5-.5.3-.6v-.5l-.8-1.9c-.2-.5-.4-.4-.6-.5z"/></svg>';

// Estado vazio: diz o que está faltando e qual é o próximo passo.
const vazio = (titulo, texto) =>
  `<div class="vazio"><span class="vazio-titulo">${titulo}</span><span class="vazio-texto">${texto}</span></div>`;

// Período escolhido na aba Financeiro. Vive fora do state porque é
// preferência de tela, não dado do negócio.
export const filtroFinanceiro = { periodo: "mes-atual", inicio: "", fim: "" };

export function renderizar() {
  try {
    renderSyncStatus();
    renderFinanceiro();
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

// O selo reflete o resultado da última conversa com a nuvem, não apenas o
// fato de a biblioteca ter carregado — antes ele dizia "Sincronizado" mesmo
// com o aparelho offline servindo a página do cache.
function renderSyncStatus() {
  const status = el("sync-status");
  if (!status) return;
  const temBiblioteca = !!initSupabase();

  let rotulo, dica;
  if (!temBiblioteca) {
    rotulo = "Modo local";
    dica = "Sem a conexão com a nuvem — os lançamentos ficam só neste aparelho.";
  } else if (conexao.ok) {
    rotulo = "Sincronizado";
    dica = "A última gravação chegou na nuvem.";
  } else {
    rotulo = "Sem conexão";
    dica = "A nuvem não respondeu. Os lançamentos ficam neste aparelho até voltar.";
  }

  status.textContent = rotulo;
  status.title = dica;
  status.classList.toggle("ok", temBiblioteca && conexao.ok);
  status.classList.toggle("erro", temBiblioteca && !conexao.ok);
}

// ============================================================
// FINANCEIRO
// ============================================================

const SETA_ENTRADA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const SETA_SAIDA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

function renderFinanceiro() {
  const painel = el("panel-financeiro");
  if (!painel) return;

  const { periodo, inicio: manualI, fim: manualF } = filtroFinanceiro;
  const { inicio, fim } = intervaloDoPeriodo(periodo, manualI, manualF);
  const r = resumoFinanceiro(inicio, fim);
  const caixa = saldoEmCaixa();

  // --- cartões do topo ---
  const setTexto = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };

  setTexto("fin-caixa", formatarMoeda(caixa.saldo));
  const dicaCaixa = el("fin-caixa-hint");
  if (dicaCaixa) {
    dicaCaixa.textContent = caixa.desde
      ? `Desde ${formatarDataCurta(caixa.desde)}, partindo de ${formatarMoeda(caixa.base)}`
      : "Informe o saldo inicial para o caixa bater com a realidade";
  }

  setTexto("fin-entradas", formatarMoeda(r.entradas));
  setTexto("fin-entradas-hint", `${r.qtdEntradas} lançamento${r.qtdEntradas === 1 ? "" : "s"}`);
  setTexto("fin-saidas", formatarMoeda(r.saidas));
  setTexto("fin-saidas-hint", `${r.qtdSaidas} lançamento${r.qtdSaidas === 1 ? "" : "s"}`);

  setTexto("fin-lucro", formatarMoeda(r.lucro));
  const elLucro = el("fin-lucro");
  if (elLucro) {
    elLucro.classList.toggle("verde", r.lucro > 0);
    elLucro.classList.toggle("vermelho", r.lucro < 0);
  }
  setTexto("fin-lucro-hint", r.faturamento > 0
    ? `Margem de ${(r.margem * 100).toFixed(0)}% sobre ${formatarMoeda(r.faturamento)}`
    : "Sem faturamento no período");

  // --- linha de detalhe: o que não entra na margem ---
  const detalhe = el("fin-detalhe");
  if (detalhe) {
    const partes = [];
    if (r.faturamento) partes.push(`<span><em>Faturamento</em> ${formatarMoeda(r.faturamento)}</span>`);
    if (r.despesas) partes.push(`<span><em>Despesas</em> ${formatarMoeda(r.despesas)}</span>`);
    if (r.investimentos) partes.push(`<span><em>Investimentos</em> ${formatarMoeda(r.investimentos)}</span>`);
    if (r.retiradas) partes.push(`<span><em>Retiradas de lucro</em> ${formatarMoeda(r.retiradas)}</span>`);
    if (r.aportes) partes.push(`<span><em>Aportes</em> ${formatarMoeda(r.aportes)}</span>`);
    detalhe.innerHTML = partes.join("");
    detalhe.classList.toggle("hidden", !partes.length);
  }

  // --- gráfico de fluxo ---
  desenharFluxoCaixa(el("fin-grafico"), fluxoDiario(inicio, fim, saldoAntesDe(inicio)));
  setTexto("fin-periodo-rotulo", `${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)}`);

  renderCategoriasFinanceiro(r);
  renderRecorrentes();
  renderAReceber();
  renderExtratoFinanceiro(r.lista);
}

function renderCategoriasFinanceiro(r) {
  const box = el("fin-categorias");
  if (!box) return;

  const saidas = porCategoria(r.lista, "saida");
  if (!saidas.length) {
    box.innerHTML = vazio("Nenhuma saída no período", "Quando registrar gastos, eles aparecem aqui separados por categoria.");
    return;
  }
  const maior = saidas[0][1];
  box.innerHTML = saidas.map(([cat, valor]) => {
    const nat = naturezaCategoria(cat);
    const etiqueta = nat === "investimento" ? '<span class="tag-nat">investimento</span>'
      : nat === "retirada" ? '<span class="tag-nat">retirada</span>' : "";
    return `<div class="sabor-row">
      <div class="sabor-topo">
        <span class="sabor-nome">${escapeHtml(nomeCategoria(cat))} ${etiqueta}</span>
        <span class="sabor-qtd">${formatarMoeda(valor)}</span>
      </div>
      <div class="sabor-trilha"><div class="sabor-barra" style="width:${Math.max(4, (valor / maior) * 100)}%"></div></div>
    </div>`;
  }).join("");
}

function renderRecorrentes() {
  const aviso = el("fin-recorrentes-pendentes");
  const lista = el("fin-recorrentes-lista");
  const pendentes = recorrentesPendentes();

  if (aviso) {
    aviso.classList.toggle("hidden", !pendentes.length);
    aviso.innerHTML = pendentes.length
      ? `<span class="alerta-icone" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </span>
        <div>
          <h3>${pendentes.length === 1 ? "1 conta venceu" : `${pendentes.length} contas venceram`}</h3>
          <div class="recorrente-fila">${pendentes.map(rec => `
            <div class="recorrente-item">
              <span>${escapeHtml(rec.descricao)} · <strong>${formatarMoeda(rec.valor)}</strong> · dia ${rec.dia}</span>
              <div class="btn-row">
                <button type="button" class="btn-mini" data-action="lancar-recorrente" data-id="${rec.id}">Lançar</button>
                <button type="button" class="btn-mini" data-action="adiar-recorrente" data-id="${rec.id}">Este mês não</button>
              </div>
            </div>`).join("")}</div>
        </div>`
      : "";
  }

  if (lista) {
    lista.innerHTML = (state.recorrentes || []).map(rec => `
      <div class="item-estoque">
        <div>
          <strong class="nome">${escapeHtml(rec.descricao)}</strong>
          <small class="item-preco-linha">${escapeHtml(nomeCategoria(rec.categoria))} · todo dia ${rec.dia}</small>
        </div>
        <div class="flex-row" style="align-items:center; gap:var(--s3)">
          <span class="saldo">${formatarMoeda(rec.valor)}</span>
          <button type="button" class="btn-mini perigo" data-action="excluir-recorrente" data-id="${rec.id}">Excluir</button>
        </div>
      </div>`).join("")
      || vazio("Nenhuma conta fixa", "Cadastre gás, internet ou salário e o sistema lembra você todo mês, sem lançar nada sozinho.");
  }
}

function renderAReceber() {
  const box = el("fin-a-receber");
  const total = el("fin-a-receber-total");
  if (!box) return;

  const { pedidos, total: soma } = aReceber();
  if (total) total.textContent = formatarMoeda(soma);

  box.innerHTML = pedidos.length
    ? pedidos.slice(0, 8).map(e => {
        const c = state.clientes.find(x => x.id === e.clienteId);
        return `<div class="lista-compras-item">
          <span>
            <strong>${escapeHtml(e.titulo || "Pedido")}</strong>
            <span class="precisa">${escapeHtml(c?.nome || "Cliente")} · entrega ${formatarDataCurta(e.dataEntrega)}</span>
          </span>
          <span class="enc-total">${formatarMoeda(e.valorTotal)}</span>
        </div>`;
      }).join("")
    : vazio("Nada a receber", "Todos os pedidos já foram pagos ou lançados no financeiro.");
}

function renderExtratoFinanceiro(lista) {
  const box = el("fin-extrato");
  if (!box) return;

  const filtro = el("fin-filtro-tipo")?.value || "";
  const visiveis = filtro ? lista.filter(l => l.tipo === filtro) : lista;

  box.innerHTML = visiveis.length
    ? visiveis.map(l => {
        const entrada = l.tipo === "entrada";
        const origem = l.origem && l.origem !== "manual"
          ? `<span class="tag-origem">${l.origem === "estoque" ? "do estoque" : "do pedido"}</span>` : "";
        return `<li>
          <span class="mov-icone ${entrada ? "producao" : "compra"}" aria-hidden="true">${entrada ? SETA_ENTRADA : SETA_SAIDA}</span>
          <span class="mov-corpo">
            <span class="mov-texto">${escapeHtml(l.descricao || nomeCategoria(l.categoria))} ${origem}</span>
            <span class="mov-quando">${formatarDataCurta(l.data)} · ${escapeHtml(nomeCategoria(l.categoria))}${l.forma ? ` · ${escapeHtml(nomeForma(l.forma))}` : ""}</span>
          </span>
          <span class="mov-valor ${entrada ? "pos" : "neg"}">${entrada ? "+" : "−"}${formatarMoeda(l.valor)}</span>
          <div class="btn-row">
            <button type="button" class="btn-mini" data-action="editar-lancamento" data-id="${l.id}">Editar</button>
            <button type="button" class="btn-mini perigo" data-action="excluir-lancamento" data-id="${l.id}">Excluir</button>
          </div>
        </li>`;
      }).join("")
    : vazio("Nenhum lançamento no período", "Use os botões acima para registrar uma entrada ou uma saída.");
}

// Preenche os seletores de categoria conforme o tipo escolhido
export function atualizarCategorias(idSelect, tipo, valorAtual = "") {
  const sel = el(idSelect);
  if (!sel) return;
  const lista = CATEGORIAS[tipo] || [];
  sel.innerHTML = '<option value="">Selecione…</option>' +
    lista.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  if (valorAtual) sel.value = valorAtual;
}

function renderAlertas() {
  const box = el("alertas-estoque");
  if (!box) return;
  const baixos = state.itens.filter(i => i.estoqueMinimo > 0 && i.quantidade <= i.estoqueMinimo);
  box.classList.toggle("hidden", baixos.length === 0);
  box.innerHTML = baixos.length
    ? `<span class="alerta-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 4.3L2.6 17.6A2 2 0 004.3 20.6h15.4a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0zM12 9.5v4M12 17h.01"/></svg>
      </span>
      <div>
        <h3>${baixos.length === 1 ? "1 insumo no nível crítico" : `${baixos.length} insumos no nível crítico`}</h3>
        <ul>${baixos.map(i =>
          `<li>${escapeHtml(i.nome)} — restam ${formatarQtd(i.quantidade)}${escapeHtml(i.unidade)}, o mínimo é ${formatarQtd(i.estoqueMinimo)}${escapeHtml(i.unidade)}</li>`
        ).join("")}</ul>
      </div>`
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
        <small class="item-preco-linha" title="Custo exato usado nos cálculos: ${formatarMoedaExata(it.custoMedio)} por ${escapeHtml(it.unidade)}">${formatarMoedaLonga(it.custoMedio)} por ${escapeHtml(it.unidade)}</small>
        <small class="item-preco-linha total">${formatarMoeda(it.quantidade * it.custoMedio)} em estoque</small>
      </div>
      <span class="saldo">${formatarQtd(it.quantidade)} ${escapeHtml(it.unidade)}</span>
    </li>`).join("")
    || vazio("Nenhum insumo cadastrado", "Cadastre farinha, açúcar e chocolate na aba <strong>Cadastros</strong> para o estoque começar a contar.");
}

function renderCongelados() {
  const lista = el("lista-congelados");
  if (!lista) return;
  const itens = Object.entries(state.congelados).filter(([, qtd]) => qtd > 0);
  lista.innerHTML = itens.length
    ? itens.map(([recId, qtd]) => {
        const receita = state.receitas.find(r => r.id === recId);
        return `<li class="item-estoque">
          <div><strong class="nome">${escapeHtml(receita?.nome || "Cookie")}</strong></div>
          <span class="saldo">${qtd} un</span>
        </li>`;
      }).join("")
    : vazio("Freezer vazio", "Guarde cookies prontos no formulário <strong>Freezer</strong> e eles aparecem aqui.");
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
      return `<small><strong>${formatarDataCurta(p.dataEntrega)}</strong> · ${prods} · ${formatarMoeda(p.valorTotal)}</small>`;
    }).join("") || "<small>Nenhum pedido registrado ainda.</small>";

    return `<article class="card-encomenda">
      <div class="enc-topo">
        <div>
          <h3>${escapeHtml(c.nome)}</h3>
          <p class="enc-sub">Última conversa em <strong>${formatarDataCurta(c.ultimaConversa)}</strong></p>
        </div>
        <div class="btn-row">
          ${fone ? `<a href="https://wa.me/${fone}" target="_blank" rel="noopener" class="link-whatsapp">${ICONE_WHATSAPP} WhatsApp</a>` : ""}
          <button type="button" class="btn-mini" data-action="editar-cliente" data-id="${c.id}">Editar</button>
          <button type="button" class="btn-mini perigo" data-action="excluir-cliente" data-id="${c.id}">Excluir</button>
        </div>
      </div>

      <p class="cliente-notas">${escapeHtml(c.conversa || "Sem observações registradas.")}</p>

      <div class="pedido-detalhes">
        <div class="pedido-linha">
          <span>Total já comprado</span>
          <span class="enc-total">${formatarMoeda(ltv)}</span>
        </div>
      </div>

      <details class="cliente-historico">
        <summary>Histórico de pedidos (${pedidosCli.length})</summary>
        <div class="pedidos-mini">${pedidosHtml}</div>
      </details>
    </article>`;
  }).join("")
    || vazio("Nenhum cliente cadastrado", "Cadastre o primeiro no formulário acima para acompanhar conversas e histórico de compras.");
}

// Ícones do extrato, por tipo de movimentação
const ICONES_MOV = {
  compra: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11h11.2L21 8H6.5M9.5 20a1 1 0 100-2 1 1 0 000 2zM17.5 20a1 1 0 100-2 1 1 0 000 2z"/></svg>',
  producao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11a7 7 0 0114 0v2H5v-2zM3 16h18M8 8l1-2M12 7V5M16 8l-1-2"/></svg>',
  congelado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M4 6l16 12M20 6L4 18M12 5l-2-2M12 5l2-2M12 19l-2 2M12 19l2 2"/></svg>',
  saida: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 12l6 6 6-6"/></svg>'
};

// Valor à direita da linha do extrato: dinheiro com sinal quando há, quantidade quando não
function valorMovimentacao(h) {
  if (h.tipo === "producao") {
    const v = Number(h.faturamento) || Number(h.lucro) || 0;
    return v ? `<span class="mov-valor pos">+${formatarMoeda(v)}</span>` : "";
  }
  if (h.tipo === "compra") {
    const det = h.detalhes_ingredientes || h.detalhesIngredientes || {};
    const v = Number(det.preco || h.valor || 0);
    return v ? `<span class="mov-valor neg">−${formatarMoeda(v)}</span>` : "";
  }
  if (h.tipo === "congelado") {
    const q = Number(h.quantidade) || 0;
    return `<span class="mov-valor neutro">${q > 0 ? "+" : "−"}${Math.abs(q)} un</span>`;
  }
  if (h.tipo === "saida") {
    return `<span class="mov-valor neutro">−${formatarQtd(h.quantidade)}</span>`;
  }
  return "";
}

function renderHistorico() {
  const itemHtml = (h) => `
    <li>
      <span class="mov-icone ${escapeHtml(h.tipo || "")}" aria-hidden="true">${ICONES_MOV[h.tipo] || ICONES_MOV.saida}</span>
      <span class="mov-corpo">
        <span class="mov-texto">${escapeHtml(h.texto)}</span>
        <span class="mov-quando">${formatarData(h.quando)}</span>
      </span>
      ${valorMovimentacao(h)}
      <button type="button" class="btn-mini" data-action="desfazer" data-id="${h.id}">Desfazer</button>
    </li>`;

  const listaEstoque = el("lista-historico-estoque");
  if (listaEstoque) {
    listaEstoque.innerHTML = state.historico.slice(0, 15).map(itemHtml).join("")
      || vazio("Nenhum lançamento ainda", "Registre uma compra ou uma produção e o movimento aparece aqui.");
  }

  const listaResumo = el("lista-historico-resumo");
  if (listaResumo) {
    listaResumo.innerHTML = state.historico.slice(0, 100).map(itemHtml).join("")
      || vazio("Nenhuma movimentação registrada", "Tudo o que entrar ou sair do estoque fica listado aqui, com opção de desfazer.");
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
    const situacao = falta === 0
      ? "pronto no freezer"
      : `<span class="falta">produzir ${falta} un</span> · freezer ${noFreezer} un`;
    return `<div class="pedido-linha ${falta === 0 ? "pronto" : ""}">
      <span><span class="qtd">${p.quantidade} un</span> ${escapeHtml(rec?.nome || "Cookie")}</span>
      <span class="situacao">${situacao}</span>
    </div>`;
  }).join("");

  // A esteira: nós preenchidos até a etapa concluída, o próximo passo destacado.
  const proxima = ETAPAS_PRODUCAO.find(et => !st[et.campo])?.campo;
  const esteira = ETAPAS_PRODUCAO.map(et => `
    <label class="etapa ${st[et.campo] ? "feito" : ""} ${et.campo === proxima ? "proximo" : ""}">
      <input type="checkbox" data-action="status-pedido" data-id="${e.id}" data-campo="${et.campo}" ${st[et.campo] ? "checked" : ""} />
      <span class="no" aria-hidden="true">${CHECK}</span>
      <span class="etapa-rotulo">${et.rotulo}</span>
    </label>`).join("");

  return `<article class="card-encomenda ${st.entregue ? "entregue" : ""}">
    <div class="enc-topo">
      <div>
        <h3>${escapeHtml(e.titulo || "Pedido")}</h3>
        <p class="enc-sub">${escapeHtml(cliente?.nome || "Cliente")} · entrega em <strong>${formatarDataCurta(e.dataEntrega)}</strong></p>
      </div>
      <div class="btn-row">
        <label class="selo-pago ${st.pago ? "on" : ""}">
          <input type="checkbox" data-action="status-pedido" data-id="${e.id}" data-campo="pago" ${st.pago ? "checked" : ""} />
          ${st.pago ? "Pago" : "A receber"}
        </label>
        <button type="button" class="btn-mini" data-action="editar-encomenda" data-id="${e.id}">Editar</button>
        <button type="button" class="btn-mini perigo" data-action="excluir-encomenda" data-id="${e.id}">Excluir</button>
      </div>
    </div>

    <div class="pedido-detalhes">${itensHtml}</div>

    <div class="enc-rodape">
      <div class="pipeline">${esteira}</div>
      <div class="enc-valor">
        <span class="rotulo-valor">Total</span>
        <span class="valor">${formatarMoeda(e.valorTotal)}</span>
      </div>
    </div>
  </article>`;
}

function renderEncomendas() {
  const lista = el("lista-encomendas");
  if (!lista) return;

  // Pedido sem data marcada vai para o fim: antes ele contava como 1970 e
  // aparecia como o mais urgente da fila.
  const prazo = (e) => {
    const t = e.dataEntrega ? new Date(e.dataEntrega).getTime() : NaN;
    return isNaN(t) ? Infinity : t;
  };
  const ordenadas = [...state.encomendas].sort((a, b) => prazo(a) - prazo(b));
  const andamento = ordenadas.filter(e => !statusPedido(e).entregue);
  const entregues = ordenadas.filter(e => statusPedido(e).entregue);

  lista.innerHTML = andamento.map(cardEncomenda).join("")
    || vazio("Nenhum pedido em andamento", "Forno livre. Registre um pedido no formulário acima para acompanhar a produção.");

  const listaConcluidas = el("lista-encomendas-concluidas");
  if (listaConcluidas) {
    listaConcluidas.innerHTML = entregues.map(cardEncomenda).join("")
      || vazio("Nenhum pedido entregue", "Assim que marcar um pedido como entregue ele fica guardado aqui.");
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
      <div class="enc-topo" style="margin:0">
        <div>
          <h3>${escapeHtml(r.nome)}</h3>
          <p class="enc-sub">Rende <strong>${rend} un</strong> · vende por <strong>${formatarMoeda(r.precoVenda)}</strong></p>
        </div>
        <div class="btn-row">
          <button type="button" class="btn-mini" data-action="editar-receita" data-id="${r.id}">Editar</button>
          <button type="button" class="btn-mini perigo" data-action="excluir-receita" data-id="${r.id}">Excluir</button>
        </div>
      </div>

      <dl class="receita-numeros">
        <div><dt>Custo total</dt><dd>${formatarMoeda(custoTotal)}</dd></div>
        <div><dt>Custo por un</dt><dd>${formatarMoeda(custoUnit)}</dd></div>
        <div><dt>Lucro total</dt><dd class="${lucroTotal < 0 ? "negativo" : "lucro"}">${formatarMoeda(lucroTotal)}</dd></div>
        <div><dt>Lucro por un</dt><dd class="${lucroUnit < 0 ? "negativo" : "lucro"}">${formatarMoeda(lucroUnit)}</dd></div>
      </dl>

      ${suspeito ? '<p class="aviso-suspeito">Custo unitário acima de R$ 20. Confira se as quantidades da receita e o custo dos insumos estão na mesma unidade.</p>' : ""}
    </div>`;
  }).join("")
    || vazio("Nenhuma receita cadastrada", "Crie a primeira no formulário acima para calcular custo, lucro e lista de compras.");
}

function renderInsumosTabela() {
  const container = el("editar-itens-container");
  if (!container) return;
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  if (!itens.length) {
    container.innerHTML = vazio("Nenhum insumo cadastrado", "Os insumos criados ao lado aparecem aqui para ajuste rápido de custo.");
    return;
  }
  container.innerHTML = `<table class="tabela-info"><thead><tr><th>Insumo</th><th>Custo por unidade</th><th>Ações</th></tr></thead><tbody>` +
    itens.map(it => `<tr>
      <td>${escapeHtml(it.nome)}</td>
      <td><input type="number" step="any" min="0" value="${it.custoMedio}" data-action="custo-insumo" data-id="${it.id}" aria-label="Custo por unidade de ${escapeHtml(it.nome)}" /></td>
      <td><div class="btn-row">
        <button type="button" class="btn-mini" data-action="editar-insumo" data-id="${it.id}">Editar</button>
        <button type="button" class="btn-mini perigo" data-action="excluir-insumo" data-id="${it.id}">Excluir</button>
      </div></td>
    </tr>`).join("") + "</tbody></table>";
}

function renderListaCompras() {
  const container = el("lista-compras-consolidada");
  if (!container) return;

  // Total pedido por sabor. Pedido com a massa já feita fica de fora: os
  // ingredientes dele já saíram do estoque, então mandar comprar de novo
  // faria você repor o dobro.
  const totalPorSabor = {};
  state.encomendas.filter(e => {
    const st = statusPedido(e);
    return !st.entregue && !st.massaFeita;
  }).forEach(enc => {
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
    return `<div class="lista-compras-item">
      <span>
        <strong>${escapeHtml(info.nome)}</strong>
        <span class="precisa">precisa de ${formatarQtd(info.qtd)}${escapeHtml(info.unidade)}</span>
      </span>
      <span class="falta">comprar ${formatarQtd(falta)}${escapeHtml(info.unidade)}</span>
    </div>`;
  }).filter(Boolean).join("");

  container.innerHTML = html
    || vazio("Nada a comprar", "Estoque e freezer dão conta de todos os pedidos em andamento.");
}

function renderResumo() {
  // 1. Valor em estoque, tudo a preço de custo: insumos + cookies no freezer
  let vInsumos = 0;
  state.itens.forEach(it => {
    vInsumos += (Number(it.quantidade) || 0) * (Number(it.custoMedio) || 0);
  });

  // O freezer é somado duas vezes, com sentidos diferentes: a custo, para o
  // valor investido; a preço de venda, para o potencial. O preço de venda é um
  // dado real da receita, então estimá-lo por markup só perderia precisão.
  let vFreezerCusto = 0;
  let vFreezerVenda = 0;
  Object.entries(state.congelados).forEach(([recId, qtd]) => {
    const r = state.receitas.find(rec => rec.id === recId);
    const q = Number(qtd) || 0;
    if (!r || q <= 0) return;
    const rend = Number(r.rendimento) || 1;
    const custoUnit = calcularCustoReceita(r) / rend;
    const vendaUnit = (Number(r.precoVenda) || 0) / rend;
    vFreezerCusto += custoUnit * q;
    // sabor ainda sem preço de venda cadastrado: cai no markup, para não zerar
    vFreezerVenda += (vendaUnit > 0 ? vendaUnit : custoUnit * MARKUP) * q;
  });

  const vEstoque = vInsumos + vFreezerCusto;

  // 2. Potencial de venda: o insumo ainda precisa virar cookie, então é
  // estimativa por markup. O cookie pronto vale o preço de venda do sabor.
  const potencialVenda = vInsumos * MARKUP + vFreezerVenda;

  // 3. Faturamento do mês — vem do financeiro, que é onde o dinheiro é
  // registrado de verdade. Produção não é venda: cookie feito só vira
  // faturamento quando alguém paga.
  const mes = intervaloDoPeriodo("mes-atual");
  const fin = resumoFinanceiro(mes.inicio, mes.fim);

  const elV = el("valor-total");
  if (elV) elV.textContent = formatarMoeda(vEstoque);
  const elF = el("lucro-producoes");
  if (elF) elF.textContent = formatarMoeda(fin.faturamento);
  const elFHint = el("hint-faturamento");
  if (elFHint) {
    elFHint.textContent = fin.faturamento > 0
      ? `Lucro de ${formatarMoeda(fin.lucro)} · margem ${(fin.margem * 100).toFixed(0)}%`
      : "Registre as vendas na aba Financeiro";
  }
  const elP = el("lucro-markup-estoque");
  if (elP) elP.textContent = formatarMoeda(potencialVenda);
  const elHintMarkup = el("hint-markup");
  if (elHintMarkup) {
    elHintMarkup.textContent = vFreezerVenda > 0
      ? `Insumos com markup ${MARKUP} e freezer a preço de venda`
      : `Insumos em estoque com markup ${MARKUP}`;
  }

  // 4. Média de cookies por pedido (geral)
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

  // 5. Sabores mais pedidos NO MÊS ATUAL (usa a data de entrega; sem data, usa a de criação)
  const titulo = el("titulo-desempenho");
  if (titulo) titulo.textContent = `Sabores mais pedidos em ${getNomeMesAtual()}`;

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
    const maxQtd = rank.length ? rank[0][1] : 1;
    elSabores.innerHTML = rank.length
      ? rank.map(([nome, qtd]) => `
          <div class="sabor-row">
            <div class="sabor-topo">
              <span class="sabor-nome">${escapeHtml(nome)}</span>
              <span class="sabor-qtd">${qtd} un</span>
            </div>
            <div class="sabor-trilha"><div class="sabor-barra" style="width:${Math.max(4, (qtd / maxQtd) * 100)}%"></div></div>
          </div>`).join("")
      : vazio("Nenhum pedido neste mês", "O ranking usa a data de entrega dos pedidos do mês corrente.");
  }

  // 6. Gráfico de faturamento (últimos 30 dias)
  desenharGraficoFaturamento(el("grafico-faturamento"), state.historico);
}

export function atualizarSelects() {
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const optItens = '<option value="">Selecione…</option>' + itens.map(i => `<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join("");
  document.querySelectorAll("#entrada-nome, #saida-manual-id, .ing-select").forEach(s => { const v = s.value; s.innerHTML = optItens; s.value = v; });

  const receitas = [...state.receitas].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const optRec = '<option value="">Selecione…</option>' + receitas.map(r => `<option value="${r.id}">${escapeHtml(r.nome)}</option>`).join("");
  document.querySelectorAll("#produzir-receita-id, #congelado-receita-id, .enc-prod-select").forEach(s => { const v = s.value; s.innerHTML = optRec; s.value = v; });

  const clientes = [...state.clientes].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const optCli = '<option value="">Selecione…</option>' + clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  document.querySelectorAll("#enc-cliente-select").forEach(s => { const v = s.value; s.innerHTML = optCli; s.value = v; });
}

// Linhas dinâmicas de ingrediente / produto.
// A opção vazia no início é proteção: se o insumo da receita tiver sido
// apagado, a linha aparece em branco em vez de escolher o primeiro da lista
// sem avisar — que era como uma quantidade acabava no insumo errado.
export function novaLinhaIngrediente(ing = null) {
  const itens = [...state.itens].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const existe = ing && itens.some(i => i.id === ing.itemId);
  const div = document.createElement("div");
  div.className = "enc-linha-row";
  div.innerHTML = `<select class="ing-select" required>
    <option value="" ${existe ? "" : "selected"}>Selecione…</option>
    ${itens.map(i =>
      `<option value="${i.id}" ${existe && i.id === ing.itemId ? "selected" : ""}>${escapeHtml(i.nome)}</option>`).join("")}</select>
    <input type="number" class="ing-qtd" step="any" min="0" placeholder="Qtd" value="${ing ? ing.quantidade : ""}" required />
    <button type="button" class="btn-mini perigo" data-action="remover-linha" aria-label="Remover ingrediente">×</button>`;
  return div;
}

export function novaLinhaProduto(p = null) {
  const receitas = [...state.receitas].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const existe = p && receitas.some(r => r.id === p.receitaId);
  const div = document.createElement("div");
  div.className = "enc-linha-row";
  div.innerHTML = `<select class="enc-prod-select" required>
    <option value="" ${existe ? "" : "selected"}>Selecione…</option>
    ${receitas.map(r =>
      `<option value="${r.id}" ${existe && r.id === p.receitaId ? "selected" : ""}>${escapeHtml(r.nome)}</option>`).join("")}</select>
    <input type="number" class="enc-prod-qtd" step="1" min="1" placeholder="Qtd" value="${p ? p.quantidade : ""}" required />
    <button type="button" class="btn-mini perigo" data-action="remover-linha" aria-label="Remover produto">×</button>`;
  return div;
}
