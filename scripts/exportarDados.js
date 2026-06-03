// Exporta todos os dados do SQLite para JSON
// Uso: node scripts/exportarDados.js

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const tabelas = [
  'produtos',
  'enderecos',
  'clientes',
  'compras',
  'itens_compra',
  'configuracoes_loja',
  'usuarios',
  'melhorenvio_tokens',
];

const dados = {};

function exportarTabela(tabela) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM ${tabela}`, (err, rows) => {
      if (err) {
        console.warn(`⚠️  Tabela "${tabela}" não encontrada — pulando.`);
        dados[tabela] = [];
        return resolve();
      }
      dados[tabela] = rows;
      console.log(`✅ ${tabela}: ${rows.length} registros`);
      resolve();
    });
  });
}

async function main() {
  console.log(`\n📦 Exportando dados de: ${dbPath}\n`);

  for (const tabela of tabelas) {
    await exportarTabela(tabela);
  }

  const saida = path.resolve(__dirname, 'dados_exportados.json');
  fs.writeFileSync(saida, JSON.stringify(dados, null, 2));

  const total = Object.values(dados).reduce((s, r) => s + r.length, 0);
  console.log(`\n✅ Exportação concluída — ${total} registros salvos em:\n   ${saida}\n`);

  db.close();
}

main().catch(err => {
  console.error('Erro na exportação:', err);
  db.close();
  process.exit(1);
});
