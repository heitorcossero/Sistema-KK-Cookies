-- 1. Tabela de Insumos
CREATE TABLE IF NOT EXISTS itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  unidade TEXT,
  custo_medio NUMERIC DEFAULT 0,
  estoque_minimo NUMERIC DEFAULT 0,
  quantidade NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Receitas
CREATE TABLE IF NOT EXISTS receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  rendimento NUMERIC DEFAULT 1,
  preco_venda NUMERIC DEFAULT 0,
  ingredientes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  whatsapp TEXT,
  conversa TEXT,
  ultima_conversa TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Encomendas
CREATE TABLE IF NOT EXISTS encomendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  titulo TEXT,
  data_entrega DATE,
  valor_total NUMERIC DEFAULT 0,
  produtos JSONB DEFAULT '[]'::jsonb,
  status JSONB DEFAULT '{"pago": false, "massaFeita": false, "assado": false, "tudoPronto": false, "entregue": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de Histórico
CREATE TABLE IF NOT EXISTS historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT,
  texto TEXT,
  lucro NUMERIC DEFAULT 0,
  detalhes_ingredientes JSONB DEFAULT '[]'::jsonb,
  item_id UUID,
  receita_id UUID,
  quantidade NUMERIC,
  quando TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela de Congelados
CREATE TABLE IF NOT EXISTS congelados (
  receita_id UUID PRIMARY KEY REFERENCES receitas(id) ON DELETE CASCADE,
  quantidade NUMERIC DEFAULT 0
);