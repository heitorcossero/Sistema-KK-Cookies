-- ============================================================
-- KK Cookies — estrutura do banco (Supabase / PostgreSQL)
--
-- Seguro rodar quantas vezes quiser, inclusive no banco que já
-- está no ar: tudo aqui é "crie se não existir". Nenhum comando
-- apaga dado nem substitui política que você já tenha ajustado.
--
-- Rode no SQL Editor do Supabase, de cima para baixo.
-- ============================================================


-- ------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------

-- Insumos. custo_medio é a média ponderada, recalculada a cada
-- compra; quantidade é o saldo em estoque, na unidade do insumo.
CREATE TABLE IF NOT EXISTS itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  unidade TEXT,
  custo_medio NUMERIC DEFAULT 0,
  estoque_minimo NUMERIC DEFAULT 0,
  quantidade NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Receitas. Quem manda no preço é preco_unitario, o valor de UM cookie:
-- é assim que se vende, e ele não muda quando a fornada rende menos.
-- preco_venda continua sendo gravado (preco_unitario x rendimento) só para
-- aparelhos com a versão antiga instalada não mostrarem preço velho.
-- rendimento é a média esperada da receita: serve de estimativa para a lista
-- de compras e para sugerir quantos cookies saíram ao registrar a produção.
-- ingredientes: [{ "itemId": "uuid", "quantidade": 500 }, ...]
-- tipo diz o que a receita produz: 'cookie' (o padrão) ou 'recheio'. Receita de
-- recheio não vira cookie nem vai para o freezer: ela abastece um insumo, o
-- item_id, e aí o cookie consome esse insumo como consome farinha. É assim que
-- um pote que rendeu menos encarece o grama sem ninguém refazer conta.
-- Para o recheio, rendimento é quanto o pote rende na unidade abaixo.
CREATE TABLE IF NOT EXISTS receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  rendimento NUMERIC DEFAULT 1,
  preco_unitario NUMERIC DEFAULT 0,
  preco_venda NUMERIC DEFAULT 0,
  ingredientes JSONB DEFAULT '[]'::jsonb,
  tipo TEXT DEFAULT 'cookie',
  item_id UUID REFERENCES itens(id) ON DELETE SET NULL,
  unidade TEXT DEFAULT 'g',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  whatsapp TEXT,
  conversa TEXT,
  ultima_conversa TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Encomendas.
-- produtos: [{ "receitaId": "uuid", "quantidade": 30 }, ...]
-- status: as três etapas da esteira de produção + o pagamento,
-- que fica fora da esteira por não ser etapa de produção.
CREATE TABLE IF NOT EXISTS encomendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  titulo TEXT,
  data_entrega DATE,
  valor_total NUMERIC DEFAULT 0,
  produtos JSONB DEFAULT '[]'::jsonb,
  status JSONB DEFAULT '{"pago": false, "massaFeita": false, "assado": false, "entregue": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Histórico de movimentações. Uma linha por lançamento, com os
-- dados necessários para desfazê-lo.
--
-- tipo = 'compra'    -> item_id, quantidade, detalhes_ingredientes {"preco": 20}
-- tipo = 'saida'     -> item_id, quantidade
-- tipo = 'congelado' -> receita_id, quantidade (negativa quando sai)
-- tipo = 'producao'  -> detalhes_ingredientes [{itemId, quantidade}, ...],
--                       receita_id, faturamento e lucro do lote, mais:
--                       quantidade      = cookies que entraram no freezer
--                                         (é o que o Desfazer devolve)
--                       rendimento_real = cookies que saíram do forno, mesmo
--                                         os que não foram congelados
--                       multiplicador   = vezes a receita, para calcular
--                                         depois a média real por fornada
CREATE TABLE IF NOT EXISTS historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT,
  texto TEXT,
  lucro NUMERIC DEFAULT 0,
  faturamento NUMERIC DEFAULT 0,
  detalhes_ingredientes JSONB DEFAULT '[]'::jsonb,
  item_id UUID,
  receita_id UUID,
  quantidade NUMERIC,
  quando TIMESTAMPTZ DEFAULT now()
);

-- Cookies prontos no freezer, um saldo por sabor.
CREATE TABLE IF NOT EXISTS congelados (
  receita_id UUID PRIMARY KEY REFERENCES receitas(id) ON DELETE CASCADE,
  quantidade NUMERIC DEFAULT 0
);

-- Lançamentos financeiros. Esta é a única fonte da verdade do dinheiro:
-- estoque e encomendas não alteram estes números por conta própria, só
-- criam lançamentos quando você manda de propósito.
--
-- tipo      'entrada' ou 'saida'
-- categoria id definido em js/config.js, que carrega a natureza:
--           operacional  -> despesa, reduz o lucro
--           investimento -> sai do caixa, fora da margem
--           retirada     -> sai do caixa e não é despesa (lucro distribuído)
--           venda        -> entrada que conta como faturamento
--           aporte       -> entrada que NÃO é faturamento
-- origem    'manual', 'estoque' ou 'pedido' — só para você saber de onde
--           veio. Não cria vínculo: apagar a compra lá não mexe aqui.
CREATE TABLE IF NOT EXISTS financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL,
  descricao TEXT,
  forma TEXT,
  origem TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contas que se repetem todo mês. Guardam só o lembrete: nada é lançado
-- sozinho, porque o valor da conta muda de um mês para o outro.
-- ultimo_lancamento marca o mês já resolvido, para o aviso sumir.
CREATE TABLE IF NOT EXISTS recorrentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'saida',
  valor NUMERIC DEFAULT 0,
  categoria TEXT NOT NULL,
  dia INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN DEFAULT true,
  ultimo_lancamento DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ajustes soltos do sistema, um por chave. Hoje guarda só o saldo inicial:
-- chave 'saldoInicial', valor {"data": "2026-08-01", "valor": 1500}
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ------------------------------------------------------------
-- 2. AJUSTES PARA BANCOS QUE JÁ EXISTEM
--
-- As tabelas acima só são criadas quando não existem, então
-- colunas novas precisam ser adicionadas à parte. É esta seção
-- que conserta um banco antigo.
-- ------------------------------------------------------------

-- O sistema grava o faturamento do lote em cada produção, mas a
-- coluna não estava no script original.
ALTER TABLE historico ADD COLUMN IF NOT EXISTS faturamento NUMERIC DEFAULT 0;

-- Produção passou a registrar quantos cookies foram para o freezer.
ALTER TABLE historico ADD COLUMN IF NOT EXISTS receita_id UUID;
ALTER TABLE historico ADD COLUMN IF NOT EXISTS quantidade NUMERIC;

-- O status antigo tinha uma etapa "tudoPronto" que saiu do sistema.
-- Muda apenas o padrão de pedidos novos; os já gravados ficam como estão.
ALTER TABLE encomendas
  ALTER COLUMN status
  SET DEFAULT '{"pago": false, "massaFeita": false, "assado": false, "entregue": false}'::jsonb;

-- Marca que o valor do pedido já foi enviado ao financeiro, para o sistema
-- não oferecer o lançamento duas vezes.
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS "financeiroEnviado" BOOLEAN DEFAULT false;

-- A KK vende cookie, não receita: o preço de cada unidade passou a ser
-- cadastrado direto, em vez de sair de preco_venda / rendimento. O UPDATE
-- converte as receitas antigas uma única vez.
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS preco_unitario NUMERIC DEFAULT 0;
UPDATE receitas
   SET preco_unitario = ROUND(preco_venda / NULLIF(rendimento, 0), 2)
 WHERE COALESCE(preco_unitario, 0) = 0 AND COALESCE(preco_venda, 0) > 0;

-- A fornada nem sempre rende o previsto, então o número real informado na hora
-- de registrar a produção passou a ser guardado no lançamento. Ver o comentário
-- da tabela historico, mais acima, para o significado de cada coluna.
ALTER TABLE historico ADD COLUMN IF NOT EXISTS rendimento_real NUMERIC;
ALTER TABLE historico ADD COLUMN IF NOT EXISTS multiplicador NUMERIC;

-- O recheio saiu de dentro da receita do cookie e virou receita própria, que
-- abastece um insumo em gramas. Toda receita que já existia é de cookie, e o
-- DEFAULT abaixo cuida disso sozinho — não há nada para converter.
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'cookie';
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES itens(id) ON DELETE SET NULL;
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT 'g';
UPDATE receitas SET tipo = 'cookie' WHERE tipo IS NULL;


-- ------------------------------------------------------------
-- 3. ÍNDICES
-- ------------------------------------------------------------

-- O app carrega o histórico ordenado por data, do mais novo para
-- o mais antigo. Sem este índice, o banco lê a tabela inteira e
-- ordena a cada abertura do sistema.
CREATE INDEX IF NOT EXISTS historico_quando_idx ON historico (quando DESC);

-- Chave estrangeira não ganha índice sozinha no Postgres, e este
-- ajuda tanto a busca por cliente quanto a exclusão de clientes.
CREATE INDEX IF NOT EXISTS encomendas_cliente_idx ON encomendas (cliente_id);

-- O financeiro e sempre lido por intervalo de datas.
CREATE INDEX IF NOT EXISTS financeiro_data_idx ON financeiro (data DESC);


-- ------------------------------------------------------------
-- 4. SEGURANÇA (RLS)
--
-- Sem RLS, a chave pública que fica no navegador daria acesso
-- livre aos dados. Com RLS, só quem estiver logado enxerga.
--
-- O bloco abaixo é conservador de propósito: liga o RLS em todas
-- as tabelas e só cria a política onde ainda não existe nenhuma.
-- Se você já ajustou alguma política à mão, ela é preservada.
-- ------------------------------------------------------------

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['itens', 'receitas', 'clientes', 'encomendas', 'historico', 'congelados', 'financeiro', 'recorrentes', 'configuracoes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tabela
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'kk_acesso_autenticado', tabela
      );
      RAISE NOTICE 'Política de acesso criada para %', tabela;
    ELSE
      RAISE NOTICE 'Tabela % já tem política própria — preservada', tabela;
    END IF;
  END LOOP;
END $$;


-- ------------------------------------------------------------
-- 5. CONFERÊNCIA
--
-- Rode para ver se ficou tudo no lugar. O esperado é: cada tabela
-- com rls_ativo = true e ao menos uma política.
-- ------------------------------------------------------------

-- SELECT c.relname AS tabela,
--        c.relrowsecurity AS rls_ativo,
--        count(p.policyname) AS politicas
-- FROM pg_class c
-- LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
-- WHERE c.relnamespace = 'public'::regnamespace
--   AND c.relname IN ('itens','receitas','clientes','encomendas','historico','congelados')
-- GROUP BY c.relname, c.relrowsecurity
-- ORDER BY c.relname;
