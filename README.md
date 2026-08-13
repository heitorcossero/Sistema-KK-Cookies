# KK Cookies — Gestão 🍪

Sistema interno da KK Cookies para controle de estoque, receitas, encomendas e clientes.
*Felicidade em cada mordida.*

**Sistema no ar:** https://heitorcossero.github.io/Sistema-KK-Cookies/

## O que ele faz

- **Resumo** — valor investido em estoque, faturamento das produções, potencial de venda (markup) e ranking de sabores mais pedidos no mês.
- **Estoque** — entrada de compras (com custo médio ponderado), produção de receitas (baixa os ingredientes e já guarda os cookies no freezer, ou o recheio pronto no estoque), freezer e ajustes manuais. Ao registrar a produção você informa quantos cookies a fornada rendeu de verdade — o campo já vem preenchido com o previsto pela receita, mas quem manda no freezer é o número real. Tudo com histórico e botão de desfazer.
- **Encomendas** — pedidos com esteira de produção (massa → assado → entregue), selo de pagamento à parte, valor editável para desconto ou entrega, e lista de compras consolidada que desconta estoque, freezer e o que já teve a massa feita. Marcar como entregue baixa os cookies do freezer.
- **Financeiro** — a única fonte da verdade do dinheiro: entradas, saídas, saldo em caixa, fluxo do período, gastos por categoria, contas fixas e extrato. Estoque e Encomendas **não** alimentam estes números sozinhos; só criam lançamentos quando você marca a opção de enviar. Categorias carregam a natureza do dinheiro (despesa, investimento, retirada de lucro, venda, aporte), que é o que separa o caixa do lucro.
- **Clientes** — cadastro com WhatsApp, notas, histórico de pedidos e total já comprado.
- **Cadastros** — insumos e receitas (ingredientes, preço de venda de cada cookie e rendimento médio esperado, que serve de estimativa para a lista de compras e de sugestão na produção; o card mostra ao lado quanto as últimas fornadas renderam de verdade).

## Massa e recheio

Uma receita produz cookies ou **recheio**. O recheio é feito em pote separado e nunca rende exatamente o mesmo, então ele não fica solto dentro da receita do cookie: ele tem receita própria e vira um insumo de estoque, medido em gramas.

Fazer o recheio é uma produção como outra qualquer — a diferença é que o sistema pergunta quantos gramas saíram do pote, e não quantos cookies. Os ingredientes baixam, as gramas pesadas entram no estoque e o custo de cada grama sai dessa divisão. É isso que faz um pote fraco encarecer o cookie sozinho, sem ninguém refazer conta: o cookie passa a listar o recheio como ingrediente, em gramas por unidade.

A sobra fica visível no estoque, valorizada, e entra na próxima fornada. Na lista de compras o recheio nunca aparece — o que falta dele vira fornadas de recheio, e o que entra na lista são os ingredientes dele.

## Nada se perde

Toda gravação que a nuvem recusar entra numa fila guardada no aparelho e é reenviada ao abrir o app, quando a internet volta e de minuto em minuto. Enquanto houver algo preso, uma faixa vermelha avisa na tela e o selo do topo mostra quantas alterações faltam — antes ele dizia "Sincronizado" mesmo com o trabalho inteiro parado no navegador.

A carga da nuvem também nunca apaga o que está no aparelho: uma tabela que o banco recusar é ignorada em vez de virar lista vazia, e o que ainda não subiu é reaplicado por cima do que veio.

No Resumo, em *Cópia de segurança*, dá para baixar um arquivo com tudo e restaurá-lo depois.

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
