// Cria o primeiro usuário administrador.
// Uso: node scripts/criarUsuario.js [email] [senha] [nome]
// Exemplo: node scripts/criarUsuario.js admin@pinkbella.com minhasenha "Pink Bella"
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const rawDbPath = process.env.DB_PATH;
const dbPath =
  rawDbPath === ':memory:'
    ? ':memory:'
    : path.resolve(__dirname, '..', rawDbPath);

const db = new sqlite3.Database(dbPath);

const EMAIL = process.argv[2] || 'admin@pinkbella.com';
const SENHA = process.argv[3] || 'admin123';
const NOME = process.argv[4] || 'Administrador';

async function criar() {
  const hash = await bcrypt.hash(SENHA, 10);
  db.run(
    'INSERT INTO usuarios (email, senha_hash, nome) VALUES (?, ?, ?)',
    [EMAIL, hash, NOME],
    function (err) {
      if (err) {
        console.error('Erro ao criar usuário:', err.message);
      } else {
        console.log(`Usuário criado! ID: ${this.lastID} | Email: ${EMAIL}`);
        console.log('Guarde a senha com segurança — ela não pode ser recuperada.');
      }
      db.close();
    }
  );
}

criar();
