const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = 'produtos-imagens';

async function uploadImagem(buffer, mimetype, nomeArquivo) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(nomeArquivo, buffer, { contentType: mimetype, upsert: true });

  if (error) throw new Error('Erro ao fazer upload: ' + error.message);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function deletarImagem(urlPublica) {
  try {
    const path = urlPublica.split(`/${BUCKET}/`)[1];
    if (path) await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // silencioso — não bloqueia operação principal
  }
}

module.exports = { uploadImagem, deletarImagem };
