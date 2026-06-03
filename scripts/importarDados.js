// Importa os dados exportados do SQLite para o PostgreSQL (Supabase)
// Uso: node scripts/importarDados.js
// Pré-requisito: rodar exportarDados.js antes

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const arquivo = path.resolve(__dirname, 'dados_exportados.json');
const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

// Ordem respeita as foreign keys
const ordem = [
  'produtos',
  'enderecos',
  'clientes',
  'compras',
  'itens_compra',
  'configuracoes_loja',
  'usuarios',
  'melhorenvio_tokens',
];

function buildInsert(tabela, row) {
  const colunas = Object.keys(row);
  const valores = Object.values(row);
  const placeholders = colunas.map((_, i) => `$${i + 1}`).join(', ');
  return {
    text: `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    values: valores,
  };
}

async function importarTabela(tabela) {
  const rows = dados[tabela];
  if (!rows || rows.length === 0) {
    console.log(`⏭️  ${tabela}: vazio — pulando`);
    return;
  }

  let ok = 0;
  let erros = 0;
  for (const row of rows) {
    try {
      const query = buildInsert(tabela, row);
      await pool.query(query);
      ok++;
    } catch (err) {
      erros++;
      if (erros <= 3) console.error(`  ❌ Erro em ${tabela}:`, err.message, row);
    }
  }
  console.log(`✅ ${tabela}: ${ok} inseridos${erros ? `, ${erros} erros` : ''}`);

  // Reseta sequence do SERIAL após inserção com IDs fixos
  if (['produtos','enderecos','clientes','compras','itens_compra','configuracoes_loja','usuarios'].includes(tabela)) {
    await pool.query(`SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), COALESCE(MAX(id), 1)) FROM ${tabela}`);
  }
}

async function main() {
  console.log('\n📥 Importando dados para o PostgreSQL...\n');

  for (const tabela of ordem) {
    await importarTabela(tabela);
  }

  console.log('\n✅ Importação concluída!\n');
  await pool.end();
}

main().catch(async err => {
  console.error('Erro fatal na importação:', err);
  await pool.end();
  process.exit(1);
});
