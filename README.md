# KK Cookies — Gestão 🍪

Sistema interno da KK Cookies para controle de estoque, receitas, encomendas e clientes.
*Felicidade em cada mordida.*

**Sistema no ar:** https://heitorcossero.github.io/Sistema-KK-Cookies/

## O que ele faz

- **Resumo** — valor investido em estoque, faturamento das produções, potencial de venda (markup) e ranking de sabores mais pedidos no mês.
- **Estoque** — entrada de compras (com custo médio ponderado), produção de receitas (baixa os ingredientes e já guarda os cookies no freezer), freezer e ajustes manuais. Tudo com histórico e botão de desfazer.
- **Encomendas** — pedidos com esteira de produção (massa → assado → entregue), selo de pagamento à parte, valor editável para desconto ou entrega, e lista de compras consolidada que desconta estoque, freezer e o que já teve a massa feita. Marcar como entregue baixa os cookies do freezer.
- **Financeiro** — a única fonte da verdade do dinheiro: entradas, saídas, saldo em caixa, fluxo do período, gastos por categoria, contas fixas e extrato. Estoque e Encomendas **não** alimentam estes números sozinhos; só criam lançamentos quando você marca a opção de enviar. Categorias carregam a natureza do dinheiro (despesa, investimento, retirada de lucro, venda, aporte), que é o que separa o caixa do lucro.
- **Clientes** — cadastro com WhatsApp, notas, histórico de pedidos e total já comprado.
- **Cadastros** — insumos e receitas (ingredientes, rendimento e preço de venda).

## Tecnologia

- HTML, CSS e JavaScript puro (módulos ES), sem build.
- [Supabase](https://supabase.com) para banco de dados (PostgreSQL com RLS) e autenticação. A biblioteca fica em `js/vendor/`, servida pelo próprio site — de CDN ela não entrava no cache e o app não abria offline.
- PWA: instalável no celular, com service worker para funcionar offline (leitura).
- Publicado via GitHub Pages.

## Estrutura

```
index.html        Estrutura das telas
style.css         Identidade visual (paleta chocolate/creme da marca)
js/
  vendor/         Biblioteca do Supabase (servida localmente, p/ funcionar offline)
  config.js       URLs, chaves e markup
  utils.js        Formatação, toast e modal de confirmação
  data.js         Estado, Supabase e persistência local
  finance.js      Regras do financeiro: períodos, caixa, lucro e fluxo
  auth.js         Login/logout
  render.js       Renderização das telas
  actions.js      Formulários e ações
  main.js         Inicialização
assets/           Logo e ícones do app
sql/              Scripts do banco (referência)
```

## Como rodar localmente

Basta servir a pasta com qualquer servidor estático (módulos ES não funcionam abrindo o arquivo direto):

```
npx serve .
# ou
python -m http.server
```

## Como publicar

Commit e push na branch `main` — o GitHub Pages publica automaticamente.

> A chave presente em `js/config.js` é a *anon key* pública do Supabase, feita para ficar no navegador. Os dados são protegidos por Row Level Security exigindo login.
