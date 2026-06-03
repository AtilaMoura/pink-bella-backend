// Migra imagens da pasta uploads/ para o Supabase Storage
// e atualiza as URLs no banco de dados
// Uso: node scripts/migrarImagens.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadImagem } = require('../utils/supabaseStorage');
const db = require('../database');

const pastaUploads = path.resolve(__dirname, '..', 'uploads');

async function migrar() {
  console.log('\n📸 Migrando imagens para Supabase Storage...\n');

  // Busca todos os produtos com imagem local (/uploads/...)
  const { rows: produtos } = await db.pool.query(
    "SELECT id, imagem FROM produtos WHERE imagem LIKE '/uploads/%'"
  );

  if (produtos.length === 0) {
    console.log('Nenhuma imagem local encontrada — tudo já está no Supabase.');
    process.exit(0);
  }

  let ok = 0, erros = 0;

  for (const produto of produtos) {
    const nomeArquivo = path.basename(produto.imagem);
    const caminhoLocal = path.join(pastaUploads, nomeArquivo);

    if (!fs.existsSync(caminhoLocal)) {
      console.warn(`⚠️  Produto #${produto.id}: arquivo não encontrado — ${caminhoLocal}`);
      erros++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(caminhoLocal);
      const ext = path.extname(nomeArquivo).toLowerCase();
      const mimetype = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';

      const novaUrl = await uploadImagem(buffer, mimetype, nomeArquivo);

      await db.pool.query('UPDATE produtos SET imagem = $1 WHERE id = $2', [novaUrl, produto.id]);

      console.log(`✅ Produto #${produto.id}: ${nomeArquivo} → ${novaUrl}`);
      ok++;
    } catch (err) {
      console.error(`❌ Produto #${produto.id}:`, err.message);
      erros++;
    }
  }

  console.log(`\n✅ Migração concluída — ${ok} imagens enviadas${erros ? `, ${erros} erros` : ''}\n`);
  process.exit(0);
}

migrar().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
