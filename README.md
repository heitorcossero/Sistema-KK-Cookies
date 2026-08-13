# KK Cookies — Gestão 🍪

Sistema interno da KK Cookies para controle de estoque, receitas, encomendas e clientes.
*Felicidade em cada mordida.*

**Sistema no ar:** https://heitorcossero.github.io/Sistema-KK-Cookies/

## O que ele faz

- **Resumo** — valor investido em estoque, faturamento das produções, potencial de venda (markup) e ranking de sabores mais pedidos no mês.
- **Estoque** — entrada de compras (com custo médio ponderado), produção de receitas (baixa automática dos ingredientes), freezer de cookies congelados e ajustes manuais. Tudo com histórico e botão de desfazer.
- **Encomendas** — pedidos com checklist de produção (pago → massa feita → assado → entregue) e lista de compras consolidada, que desconta o que já há em estoque e no freezer.
- **Clientes** — cadastro com WhatsApp, notas, histórico de pedidos e total já comprado.
- **Cadastros** — insumos e receitas (ingredientes, rendimento e preço de venda).

## Tecnologia

- HTML, CSS e JavaScript puro (módulos ES), sem build.
- [Supabase](https://supabase.com) para banco de dados (PostgreSQL com RLS) e autenticação.
- PWA: instalável no celular, com service worker para funcionar offline (leitura).
- Publicado via GitHub Pages.

## Estrutura

```
index.html        Estrutura das telas
style.css         Identidade visual (paleta chocolate/creme da marca)
js/
  config.js       URLs, chaves e markup
  utils.js        Formatação, toast e modal de confirmação
  data.js         Estado, Supabase e persistência local
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
