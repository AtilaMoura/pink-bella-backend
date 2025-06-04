const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define o caminho para o arquivo do banco de dados
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');

        // Ordem de criação é CRÍTICA devido às chaves estrangeiras:
        // 1. produtos (não tem FK para outras tabelas criadas aqui)
        // 2. enderecos (não tem FK para outras tabelas ainda a serem criadas, mas é referenciada por clientes e compras)
        // 3. clientes (referencia enderecos)
        // 4. compras (referencia clientes e enderecos)
        // 5. itens_compra (referencia compras e produtos)

        // Se você quer *apagar e recriar* todas as tabelas a cada reinício (bom para desenvolvimento):
        // A ordem de DROP precisa ser INVERSA à de criação devido às FKs.
        db.serialize(() => { // Garante que as operações db.run sejam sequenciais
            // 0. DROPA as tabelas na ordem inversa das dependências (se for para recriar do zero)
            // CUIDADO: ISSO VAI APAGAR TODOS OS SEUS DADOS A CADA REINÍCIO DO SERVIDOR!
            //db.run("DROP TABLE IF EXISTS itens_compra;");
            //db.run("DROP TABLE IF EXISTS compras;");
            //db.run("DROP TABLE IF EXISTS clientes;");
            //db.run("DROP TABLE IF EXISTS enderecos;");
            //db.run("DROP TABLE IF EXISTS produtos;");
            
            // 1. Cria a tabela 'produtos' (não tem FKs para outras tabelas aqui)
            db.run(`
                CREATE TABLE IF NOT EXISTS produtos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    preco REAL NOT NULL,
                    peso REAL,
                    altura REAL,
                    largura REAL,
                    comprimento REAL,
                    quantidade_estoque INTEGER NOT NULL, -- Corrigido de 'estoque' para 'quantidade_estoque'
                    imagem TEXT
                )
            `, (err) => {
                if (err) console.error('Erro ao criar tabela produtos:', err.message);
                else console.log('Tabela produtos verificada/criada.');
            });

            // 2. Cria a tabela 'enderecos'
            db.run(`
                CREATE TABLE IF NOT EXISTS enderecos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cliente_id INTEGER NOT NULL, -- A qual cliente este endereço pertence
                    cep TEXT NOT NULL,
                    logradouro TEXT NOT NULL,
                    numero TEXT,
                    complemento TEXT,
                    bairro TEXT ,
                    cidade TEXT ,
                    estado TEXT ,
                    referencia TEXT,
                    tipo_endereco TEXT DEFAULT 'Residencial',
                    is_principal BOOLEAN DEFAULT 0, -- 0 para falso, 1 para verdadeiro
                    FOREIGN KEY (cliente_id) REFERENCES clientes(id) -- REFERENCIA CLIENTES AQUI!
                )
            `, (err) => {
                if (err) console.error('Erro ao criar tabela enderecos:', err.message);
                else console.log('Tabela enderecos verificada/criada.');
            });

            // 3. Cria a tabela 'clientes' (referencia enderecos)
            db.run(`
                CREATE TABLE IF NOT EXISTS clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    telefone TEXT,
                    cpf TEXT UNIQUE,
                    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
                    endereco_principal_id INTEGER, 
                    ativo BOOLEAN DEFAULT 1,
                    FOREIGN KEY (endereco_principal_id) REFERENCES enderecos(id)
                )
            `, (err) => {
                if (err) console.error('Erro ao criar tabela clientes:', err.message);
                else console.log('Tabela clientes verificada/creada.');
            });

            // 4. Cria a tabela 'compras' (referencia clientes e enderecos)
            db.run(`
                CREATE TABLE IF NOT EXISTS compras (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cliente_id INTEGER NOT NULL,
                    endereco_entrega_id INTEGER NOT NULL,
                    data_compra DATETIME DEFAULT CURRENT_TIMESTAMP,
                    valor_total REAL NOT NULL,
                    status_compra TEXT DEFAULT 'Pendente',
                    valor_frete REAL,
                    transportadora TEXT,
                    servico_frete TEXT,
                    prazo_frete_dias INTEGER,
                    codigo_rastreio TEXT,
                    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
                    FOREIGN KEY (endereco_entrega_id) REFERENCES enderecos(id)
                )
            `, (err) => {
                if (err) console.error('Erro ao criar tabela compras:', err.message);
                else console.log('Tabela compras verificada/criada.');
            });

            // 5. Cria a tabela 'itens_compra' (referencia compras e produtos)
            // Certifique-se de que esta tabela também seja criada, pois ela completa o ciclo da compra
            db.run(`
                CREATE TABLE IF NOT EXISTS itens_compra (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    compra_id INTEGER NOT NULL,
                    produto_id INTEGER NOT NULL,
                    quantidade INTEGER NOT NULL,
                    preco_unitario_no_momento_da_compra REAL NOT NULL,
                    FOREIGN KEY (compra_id) REFERENCES compras(id),
                    FOREIGN KEY (produto_id) REFERENCES produtos(id)
                )
            `, (err) => {
                if (err) console.error('Erro ao criar tabela itens_compra:', err.message);
                else console.log('Tabela itens_compra verificada/criada.');
            });

            // Mensagem final após todas as tentativas de criação
            console.log('Todas as tabelas foram processadas.');
        });
    }
});

module.exports = db;