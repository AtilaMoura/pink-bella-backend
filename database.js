const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define o caminho para o arquivo do banco de dados
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            preco REAL NOT NULL,
            peso REAL,
            altura REAL,
            largura REAL,
            comprimento REAL,
            estoque INTEGER NOT NULL,
            imagem TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cpf_cnpj TEXT UNIQUE,
                cep TEXT,
                logradouro TEXT,
                bairro TEXT,
                cidade TEXT,
                estado TEXT,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
        db.run(`CREATE TABLE IF NOT EXISTS compras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            data TEXT DEFAULT CURRENT_TIMESTAMP,
            total REAL NOT NULL,
            frete REAL,
            produtos TEXT, -- Armazenará um JSON com os produtos da compra
            status TEXT NOT NULL DEFAULT 'Pendente', -- Campo de status da venda
            link_rastreio TEXT, -- Campo para o link de rastreio
            FOREIGN KEY (cliente_id) REFERENCES clientes (id)
        )`);
        console.log('Tabelas verificadas/criadas.');
    }
});

module.exports = db;