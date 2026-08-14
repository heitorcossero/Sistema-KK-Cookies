// Configurações do sistema
export const SUPABASE_URL = "https://wxhkizdgpvizhzibxgkt.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aGtpemRncHZpemh6aWJ4Z2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg3NzcsImV4cCI6MjA5MTE4NDc3N30.X39g8gvk7Hb932vltuvANNGiKF7cZCoQsUHE1Mm7mtY";
export const STORAGE_KEY = "controle_estoque_v2";

// Markup usado no card "Potencial do estoque" (aba Resumo)
export const MARKUP = 3.7;

// ============================================================
// CATEGORIAS DO FINANCEIRO
//
// A natureza é o que separa "dinheiro que mexe no caixa" de
// "dinheiro que mexe no lucro" — as duas coisas não são iguais:
//
//   operacional  gasto do negócio, entra no cálculo do lucro
//   investimento sai do caixa, mas é bem durável, fica fora da margem
//   retirada     sai do caixa e NÃO é despesa: é o lucro sendo levado
//   venda        entrada que conta como faturamento
//   aporte       entrada de dinheiro do dono, não é faturamento
// ============================================================

export const CATEGORIAS = {
  saida: [
    { id: "insumos",     nome: "Insumos e mercado",     natureza: "operacional" },
    { id: "embalagem",   nome: "Embalagem",             natureza: "operacional" },
    { id: "utilidades",  nome: "Gás, luz e água",       natureza: "operacional" },
    { id: "transporte",  nome: "Transporte e entrega",  natureza: "operacional" },
    { id: "taxas",       nome: "Taxas de maquininha",   natureza: "operacional" },
    { id: "marketing",   nome: "Marketing",             natureza: "operacional" },
    { id: "salario",     nome: "Salário fixo",          natureza: "operacional" },
    { id: "equipamento", nome: "Equipamento",           natureza: "investimento" },
    { id: "retirada",    nome: "Retirada de lucro",     natureza: "retirada" },
    { id: "outros-s",    nome: "Outros gastos",         natureza: "operacional" }
  ],
  entrada: [
    { id: "venda-pedido", nome: "Venda de pedido",  natureza: "venda" },
    { id: "venda-avulsa", nome: "Venda avulsa",     natureza: "venda" },
    // Gorjeta deixou de ser categoria: ela agora é um campo dentro da própria
    // entrada da venda, porque lançá-la à parte partia em dois o dinheiro de
    // uma coisa só. A categoria continua aqui, escondida do formulário, para
    // que lançamentos antigos não apareçam como "Sem categoria".
    { id: "extra",        nome: "Extra e gorjeta",  natureza: "venda", oculta: true },
    { id: "aporte",       nome: "Aporte do dono",   natureza: "aporte" },
    { id: "outros-e",     nome: "Outras entradas",  natureza: "venda" }
  ]
};

// Entradas que representam cookie saindo — as únicas em que faz sentido dizer
// o sabor, a quantidade e a gorjeta.
export const ehCategoriaDeVenda = (id) => naturezaCategoria(id) === "venda";

export const FORMAS_PAGAMENTO = [
  { id: "pix", nome: "Pix" },
  { id: "dinheiro", nome: "Dinheiro" },
  { id: "cartao", nome: "Cartão" },
  { id: "transferencia", nome: "Transferência" },
  { id: "outro", nome: "Outro" }
];

// Busca rápida de categoria por id, sem precisar saber se é entrada ou saída
const INDICE_CATEGORIAS = Object.fromEntries(
  [...CATEGORIAS.saida, ...CATEGORIAS.entrada].map(c => [c.id, c])
);

export const categoriaPorId = (id) => INDICE_CATEGORIAS[id] || null;
export const nomeCategoria = (id) => INDICE_CATEGORIAS[id]?.nome || "Sem categoria";
export const naturezaCategoria = (id) => INDICE_CATEGORIAS[id]?.natureza || "operacional";
export const nomeForma = (id) => FORMAS_PAGAMENTO.find(f => f.id === id)?.nome || "";
