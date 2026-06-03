-- Schema PostgreSQL — Pink Bella
-- Rodar no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  peso NUMERIC(10,3),
  altura NUMERIC(10,2),
  largura NUMERIC(10,2),
  comprimento NUMERIC(10,2),
  estoque INTEGER NOT NULL DEFAULT 0,
  descricao TEXT,
  imagem TEXT,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS enderecos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  referencia TEXT,
  tipo_endereco TEXT DEFAULT 'Residencial',
  is_principal BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cpf TEXT UNIQUE,
  data_cadastro TIMESTAMP DEFAULT NOW(),
  endereco_principal_id INTEGER,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS compras (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  endereco_entrega_id INTEGER NOT NULL,
  data_compra TIMESTAMP DEFAULT NOW(),
  valor_total NUMERIC(10,2) NOT NULL,
  valor_produtos NUMERIC(10,2) NOT NULL DEFAULT 0,
  status_compra TEXT DEFAULT 'Pendente',
  valor_frete NUMERIC(10,2),
  transportadora TEXT,
  servico_frete TEXT,
  prazo_frete_dias INTEGER,
  codigo_envio TEXT,
  codigo_etiqueta TEXT,
  codigo_rastreio TEXT,
  url_melhor_envio TEXT,
  melhor_envio_service_id INTEGER,
  melhor_envio_label_id TEXT,
  last_webhook_event_id TEXT,
  peso_pacote NUMERIC(10,3),
  altura_pacote NUMERIC(10,2),
  largura_pacote NUMERIC(10,2),
  comprimento_pacote NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS itens_compra (
  id SERIAL PRIMARY KEY,
  compra_id INTEGER NOT NULL,
  produto_id INTEGER NOT NULL,
  quantidade INTEGER NOT NULL,
  preco_unitario_no_momento_da_compra NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracoes_loja (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT NOT NULL,
  documento TEXT NOT NULL,
  cnpj TEXT,
  inscricao_estadual TEXT,
  logradouro TEXT NOT NULL,
  complemento TEXT,
  numero TEXT NOT NULL,
  bairro TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado_sigla TEXT NOT NULL,
  cep TEXT NOT NULL,
  pais_id TEXT NOT NULL DEFAULT 'BR'
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  ativo INTEGER DEFAULT 1,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS melhorenvio_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  updated_at TIMESTAMP DEFAULT NOW()
);
