// Cálculos do financeiro: períodos, totais e fluxo de caixa.
// Fica separado da renderização de propósito — é aqui que mora a regra de
// negócio do dinheiro, e ela precisa ser conferível sem abrir o navegador.
import { state } from "./data.js";
import { naturezaCategoria } from "./config.js";

// ------------------------------------------------------------
// DATAS
// Tudo trabalha com "aaaa-mm-dd" em horário local. Comparar texto
// evita a armadilha de fuso que já mordeu o histórico antes.
// ------------------------------------------------------------

export const chaveData = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const hojeChave = () => chaveData(new Date());

// Converte "aaaa-mm-dd" em Date local (meio-dia, longe de qualquer virada)
export const dataDeChave = (chave) => {
  const [a, m, d] = String(chave).split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12);
};

export const PERIODOS = [
  { id: "mes-atual", nome: "Este mês" },
  { id: "mes-passado", nome: "Mês passado" },
  { id: "30-dias", nome: "Últimos 30 dias" },
  { id: "90-dias", nome: "Últimos 90 dias" },
  { id: "ano", nome: "Este ano" },
  { id: "tudo", nome: "Desde o começo" },
  { id: "personalizado", nome: "Escolher datas" }
];

export function intervaloDoPeriodo(id, inicioManual, fimManual) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  switch (id) {
    case "mes-atual":
      return { inicio: chaveData(new Date(ano, mes, 1)), fim: chaveData(new Date(ano, mes + 1, 0)) };
    case "mes-passado":
      return { inicio: chaveData(new Date(ano, mes - 1, 1)), fim: chaveData(new Date(ano, mes, 0)) };
    case "30-dias": {
      const i = new Date(hoje); i.setDate(hoje.getDate() - 29);
      return { inicio: chaveData(i), fim: chaveData(hoje) };
    }
    case "90-dias": {
      const i = new Date(hoje); i.setDate(hoje.getDate() - 89);
      return { inicio: chaveData(i), fim: chaveData(hoje) };
    }
    case "ano":
      return { inicio: chaveData(new Date(ano, 0, 1)), fim: chaveData(new Date(ano, 11, 31)) };
    case "personalizado":
      return { inicio: inicioManual || hojeChave(), fim: fimManual || hojeChave() };
    default:
      return { inicio: "0000-01-01", fim: "9999-12-31" };
  }
}

export const nomeDoPeriodo = (id) => PERIODOS.find(p => p.id === id)?.nome || "Período";

// ------------------------------------------------------------
// LANÇAMENTOS
// ------------------------------------------------------------

const valorDe = (l) => Number(l.valor) || 0;

export function lancamentosDoPeriodo(inicio, fim) {
  return (state.financeiro || [])
    .filter(l => l.data >= inicio && l.data <= fim)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

const somaPor = (lista, tipo, naturezas) =>
  lista.reduce((acc, l) =>
    l.tipo === tipo && naturezas.includes(naturezaCategoria(l.categoria)) ? acc + valorDe(l) : acc, 0);

// ------------------------------------------------------------
// SALDO EM CAIXA
//
// Parte do saldo inicial informado e soma tudo que aconteceu a partir
// daquela data. Lançamentos anteriores ficam de fora — eles já estão
// embutidos no saldo informado, e somá-los contaria o mesmo dinheiro
// duas vezes.
// ------------------------------------------------------------

export function saldoEmCaixa() {
  const inicial = state.config?.saldoInicial || null;
  const desde = inicial?.data || "0000-01-01";
  const base = Number(inicial?.valor) || 0;

  let entradas = 0, saidas = 0, ignorados = 0;
  for (const l of (state.financeiro || [])) {
    if (l.data < desde) { ignorados++; continue; }
    if (l.tipo === "entrada") entradas += valorDe(l);
    else saidas += valorDe(l);
  }

  return { saldo: base + entradas - saidas, base, desde: inicial?.data || null, ignorados };
}

// ------------------------------------------------------------
// RESUMO DE UM PERÍODO
// ------------------------------------------------------------

export function resumoFinanceiro(inicio, fim) {
  const lista = lancamentosDoPeriodo(inicio, fim);

  const faturamento = somaPor(lista, "entrada", ["venda"]);
  const aportes = somaPor(lista, "entrada", ["aporte"]);
  const despesas = somaPor(lista, "saida", ["operacional"]);
  const investimentos = somaPor(lista, "saida", ["investimento"]);
  const retiradas = somaPor(lista, "saida", ["retirada"]);

  const entradas = faturamento + aportes;
  const saidas = despesas + investimentos + retiradas;
  const lucro = faturamento - despesas;

  return {
    lista,
    faturamento, aportes, despesas, investimentos, retiradas,
    entradas, saidas, lucro,
    margem: faturamento > 0 ? lucro / faturamento : 0,
    variacaoCaixa: entradas - saidas,
    qtdEntradas: lista.filter(l => l.tipo === "entrada").length,
    qtdSaidas: lista.filter(l => l.tipo === "saida").length
  };
}

// Quanto foi para cada categoria, do maior para o menor
export function porCategoria(lista, tipo) {
  const mapa = {};
  lista.filter(l => l.tipo === tipo).forEach(l => {
    mapa[l.categoria] = (mapa[l.categoria] || 0) + valorDe(l);
  });
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

// Quanto entrou por forma de pagamento (ajuda a bater com o extrato do banco)
export function porFormaPagamento(lista) {
  const mapa = {};
  lista.forEach(l => {
    const f = l.forma || "sem-forma";
    if (!mapa[f]) mapa[f] = { entrada: 0, saida: 0 };
    mapa[f][l.tipo === "entrada" ? "entrada" : "saida"] += valorDe(l);
  });
  return mapa;
}

// ------------------------------------------------------------
// FLUXO DIÁRIO
// Série contínua de dias (inclusive os sem movimento) para o gráfico,
// com o saldo acumulado ao longo do período.
// ------------------------------------------------------------

export function fluxoDiario(inicio, fim, saldoDeAbertura = 0) {
  const dias = [];
  const d = dataDeChave(inicio);
  const limite = dataDeChave(fim);
  // teto de segurança: nem o período "desde o começo" trava a tela
  let guarda = 0;
  while (d <= limite && guarda++ < 800) {
    dias.push({ chave: chaveData(d), data: new Date(d), entrada: 0, saida: 0, saldo: 0 });
    d.setDate(d.getDate() + 1);
  }

  const indice = new Map(dias.map((x, i) => [x.chave, i]));
  for (const l of (state.financeiro || [])) {
    const i = indice.get(l.data);
    if (i === undefined) continue;
    if (l.tipo === "entrada") dias[i].entrada += valorDe(l);
    else dias[i].saida += valorDe(l);
  }

  let acumulado = saldoDeAbertura;
  for (const dia of dias) {
    acumulado += dia.entrada - dia.saida;
    dia.saldo = acumulado;
  }
  return dias;
}

// Saldo em caixa no dia anterior ao início do período — o ponto de partida
// da linha de saldo do gráfico.
export function saldoAntesDe(inicio) {
  const inicial = state.config?.saldoInicial || null;
  const desde = inicial?.data || "0000-01-01";
  let saldo = Number(inicial?.valor) || 0;
  for (const l of (state.financeiro || [])) {
    if (l.data < desde || l.data >= inicio) continue;
    saldo += l.tipo === "entrada" ? valorDe(l) : -valorDe(l);
  }
  return saldo;
}

// ------------------------------------------------------------
// A RECEBER
// Só leitura dos pedidos, para lembrar quem ainda deve. Não entra no
// caixa nem no faturamento: enquanto o dinheiro não chega, não é caixa.
// ------------------------------------------------------------

export function aReceber() {
  const pedidos = (state.encomendas || []).filter(e => {
    const st = e.status || {};
    return !st.pago && !e.financeiroEnviado;
  });
  const total = pedidos.reduce((acc, e) => acc + (Number(e.valorTotal) || 0), 0);
  return { pedidos, total };
}

// ------------------------------------------------------------
// RECORRENTES
// Devolve o que já venceu neste mês e ainda não foi confirmado.
// Nada é lançado sozinho: o valor da conta muda todo mês.
// ------------------------------------------------------------

export function recorrentesPendentes() {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (state.recorrentes || []).filter(r => {
    if (r.ativo === false) return false;
    if (String(r.ultimo_lancamento || "").startsWith(mesAtual)) return false;
    return hoje.getDate() >= (Number(r.dia) || 1);
  });
}

// Data em que a recorrente vence no mês corrente, respeitando meses curtos
export function vencimentoNesteMes(r) {
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const dia = Math.min(Number(r.dia) || 1, ultimoDia);
  return chaveData(new Date(hoje.getFullYear(), hoje.getMonth(), dia));
}
