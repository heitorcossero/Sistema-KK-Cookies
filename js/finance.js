// Cálculos do financeiro: períodos, totais e fluxo de caixa.
// Fica separado da renderização de propósito — é aqui que mora a regra de
// negócio do dinheiro, e ela precisa ser conferível sem abrir o navegador.
import { state, custoUnitarioDeReceita } from "./data.js";
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

  // A gorjeta entra no caixa e no faturamento como sempre entrou — ela é
  // dinheiro que ficou com você. O que muda é que agora dá para separá-la:
  // ela não é preço de cookie e não pode inflar o preço médio da unidade.
  const gorjetas = lista.reduce((acc, l) =>
    l.tipo === "entrada" ? acc + (Number(l.gorjeta) || 0) : acc, 0);
  const unidades = lista.reduce((acc, l) => acc + unidadesDe(l), 0);

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
    entradas, saidas, lucro, gorjetas, unidades,
    margem: faturamento > 0 ? lucro / faturamento : 0,
    // Preço médio do cookie sem a gorjeta: gorjeta não é preço.
    precoMedioCookie: unidades > 0 ? (faturamento - gorjetas) / unidades : 0,
    variacaoCaixa: entradas - saidas,
    qtdEntradas: lista.filter(l => l.tipo === "entrada").length,
    qtdSaidas: lista.filter(l => l.tipo === "saida").length
  };
}

// ------------------------------------------------------------
// DETALHE DA ENTRADA: SABOR E QUANTIDADE
//
// Uma entrada de venda pode dizer o que saiu. O valor de cada sabor é
// rateado pelo preço de tabela — é o único jeito honesto de dividir um
// total que já veio com desconto embutido. A gorjeta fica de fora do rateio
// de propósito: ela não foi paga por nenhum cookie em especial.
// ------------------------------------------------------------

export const unidadesDe = (l) =>
  (l?.itens || []).reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0);

// Resume os itens de um lançamento em texto curto: "6 Ninho · 4 Nutella"
export function descreverItens(l) {
  return (l?.itens || [])
    .map(i => {
      const r = (state.receitas || []).find(x => x.id === i.receitaId);
      return `${Number(i.quantidade) || 0} ${r?.nome || "Cookie"}`;
    })
    .join(" · ");
}

export function porSabor(lista) {
  const mapa = {};
  for (const l of lista) {
    if (l.tipo !== "entrada" || !(l.itens || []).length) continue;

    // Base do rateio: o dinheiro que veio de cookie, sem a gorjeta.
    const base = Math.max(0, valorDe(l) - (Number(l.gorjeta) || 0));
    const pesos = l.itens.map(i => {
      const r = (state.receitas || []).find(x => x.id === i.receitaId);
      const qtd = Number(i.quantidade) || 0;
      return { i, qtd, peso: qtd * (Number(r?.precoUnitario) || 0), nome: r?.nome || "Cookie" };
    });
    const somaPeso = pesos.reduce((a, p) => a + p.peso, 0);
    const somaQtd = pesos.reduce((a, p) => a + p.qtd, 0);

    for (const p of pesos) {
      if (!mapa[p.i.receitaId]) mapa[p.i.receitaId] = { receitaId: p.i.receitaId, nome: p.nome, unidades: 0, valor: 0 };
      mapa[p.i.receitaId].unidades += p.qtd;
      // Sem preço cadastrado em nenhum item, divide por unidade — melhor do
      // que jogar tudo em um sabor só.
      const fatia = somaPeso > 0 ? p.peso / somaPeso : (somaQtd > 0 ? p.qtd / somaQtd : 0);
      mapa[p.i.receitaId].valor += base * fatia;
    }
  }
  return Object.values(mapa).sort((a, b) => b.unidades - a.unidades);
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
// VENDA AVULSA
//
// A conta de uma saída para vender. Três números diferentes que é fácil
// confundir:
//
//   tabela  o que os cookies valeriam pelo preço cadastrado na receita
//   valor   o que você recebeu de verdade — a diferença é desconto dado
//   custo   só os ingredientes. Gás, embalagem e transporte NÃO entram
//           aqui: eles já viraram despesa no financeiro quando foram
//           pagos, e contá-los de novo tiraria o mesmo dinheiro duas vezes.
//
// Por isso o resultado se chama "sobra dos ingredientes", e não lucro: o
// lucro de verdade é o do financeiro, que desconta tudo o mais.
// ------------------------------------------------------------

export function resumoVenda(itens = [], valorRecebido = 0) {
  let unidades = 0, tabela = 0, custo = 0;

  const linhas = (itens || []).map(i => {
    const r = (state.receitas || []).find(x => x.id === i.receitaId);
    const qtd = Number(i.quantidade) || 0;
    const precoUnit = Number(r?.precoUnitario) || 0;
    const custoUnit = custoUnitarioDeReceita(r);
    unidades += qtd;
    tabela += precoUnit * qtd;
    custo += custoUnit * qtd;
    return {
      receitaId: i.receitaId,
      nome: r?.nome || "Cookie",
      quantidade: qtd,
      precoUnit,
      custoUnit,
      noFreezer: Number(state.congelados?.[i.receitaId]) || 0
    };
  });

  const valor = Number(valorRecebido) || 0;
  const sobra = valor - custo;

  return {
    linhas, unidades, tabela, custo, valor, sobra,
    margem: valor > 0 ? sobra / valor : 0,
    precoMedio: unidades > 0 ? valor / unidades : 0,
    // Positivo quer dizer desconto dado; negativo, que você vendeu acima da tabela.
    desconto: tabela - valor
  };
}

// Custo dos ingredientes de uma lista de itens, para congelar no momento da
// venda. Separado do resumo porque é o único número que vai para o banco.
export const custoDosItens = (itens = []) => resumoVenda(itens, 0).custo;

// Quanto você costuma vender de cada sabor quando sai. É a resposta para
// "quantos assar da próxima vez": média das saídas, não total do mês.
export function mediaPorSaida(ultimas = 8) {
  const vendas = [...(state.vendas || [])]
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .slice(0, ultimas);
  if (!vendas.length) return { saidas: 0, sabores: [], mediaValor: 0, mediaUnidades: 0 };

  const mapa = {};
  let totalValor = 0, totalUnidades = 0;
  for (const v of vendas) {
    totalValor += Number(v.valor) || 0;
    for (const i of (v.itens || [])) {
      const qtd = Number(i.quantidade) || 0;
      totalUnidades += qtd;
      if (!mapa[i.receitaId]) mapa[i.receitaId] = { receitaId: i.receitaId, total: 0, saidas: 0 };
      mapa[i.receitaId].total += qtd;
      mapa[i.receitaId].saidas++;
    }
  }

  const sabores = Object.values(mapa)
    // Divide pelo número de saídas em que o sabor apareceu, não pelo total de
    // saídas: um sabor que você só leva de vez em quando não deve parecer fraco.
    .map(s => ({ ...s, media: s.total / s.saidas }))
    .sort((a, b) => b.media - a.media);

  return {
    saidas: vendas.length,
    sabores,
    mediaValor: totalValor / vendas.length,
    mediaUnidades: totalUnidades / vendas.length
  };
}

// Vendas avulsas de um período, da mais nova para a mais antiga.
export function vendasDoPeriodo(inicio, fim) {
  return (state.vendas || [])
    .filter(v => v.data >= inicio && v.data <= fim)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
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
