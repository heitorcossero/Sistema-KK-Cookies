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

-- Receitas. preco_venda é o valor do lote inteiro, não da unidade:
-- o preço por cookie sai de preco_venda / rendimento.
-- ingredientes: [{ "itemId": "uuid", "quantidade": 500 }, ...]
CREATE TABLE IF NOT EXISTS receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  rendimento NUMERIC DEFAULT 1,
  preco_venda NUMERIC DEFAULT 0,
  ingredientes JSONB DEFAULT '[]'::jsonb,
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
--                       receita_id + quantidade = cookies que foram
--                       para o freezer, faturamento e lucro do lote
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
  FOREACH tabela IN ARRAY ARRAY['itens', 'receitas', 'clientes', 'encomendas', 'historico', 'congelados']
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
