// Rota pública — não passa pelo middleware de autenticação
const express = require('express');
const router = express.Router();
const { exchangeCodeForTokens, getAuthorizationUrl } = require('../services/melhorEnvioAuth');

// GET /melhor-envio/auth — mostra a URL de autorização e formulário manual
router.get('/auth', (req, res) => {
  const url = getAuthorizationUrl();
  res.send(`
    <html>
    <head><meta charset="utf-8"><title>Autorizar Melhor Envio</title>
    <style>
      body { font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; }
      .btn { background: #e91e63; color: white; padding: 14px 28px; border: none;
             border-radius: 8px; font-size: 1.1rem; cursor: pointer; text-decoration: none; display: inline-block; }
      .box { background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0; }
      input { width: 100%; padding: 10px; font-size: 1rem; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
      .success { color: #28a745; } .error { color: #dc3545; }
    </style>
    </head>
    <body>
      <h2>🔑 Autorizar Pink Bella no Melhor Envio</h2>

      <div class="box">
        <h3>Passo 1 — Clique para autorizar</h3>
        <a href="${url}" class="btn" target="_blank">Abrir autorização no Melhor Envio</a>
        <p style="margin-top:12px;font-size:0.9rem;color:#666">
          Após autorizar, você será redirecionado para a URL configurada no app.<br>
          Se a URL não carregar, <strong>copie o parâmetro <code>code=...</code> da barra de endereço</strong>.
        </p>
      </div>

      <div class="box">
        <h3>Passo 2 — Cole o código aqui</h3>
        <p style="font-size:0.9rem;color:#666">
          Na barra de endereço você verá algo como:<br>
          <code>https://seusite.com/callback?code=<strong>ABC123...</strong>&state=pink-bella</code><br>
          Copie apenas o valor do <code>code</code>.
        </p>
        <form method="POST" action="/melhor-envio/trocar-codigo">
          <input type="text" name="code" placeholder="Cole o code aqui..." required />
          <br><br>
          <button type="submit" class="btn">✅ Salvar tokens</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// POST /melhor-envio/trocar-codigo — troca o code manualmente por tokens
router.post('/trocar-codigo', async (req, res) => {
  const { code } = req.body;

  if (!code || code.trim() === '') {
    return res.status(400).send('<h2>Código não informado.</h2><a href="/melhor-envio/auth">Voltar</a>');
  }

  try {
    await exchangeCodeForTokens(code.trim());
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#28a745">✅ Melhor Envio autorizado com sucesso!</h2>
        <p>Tokens salvos no banco de dados. O sistema já pode calcular fretes e gerar etiquetas.</p>
        <p>Pode fechar esta janela.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro ao trocar code por tokens:', err.response?.data || err.message);
    res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#dc3545">❌ Erro ao obter tokens</h2>
        <p>${err.response?.data?.message || err.message}</p>
        <a href="/melhor-envio/auth">Tentar novamente</a>
      </body></html>
    `);
  }
});

// GET /melhor-envio/callback — recebe o redirect automático (se a URL for acessível)
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/melhor-envio/auth?erro=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/melhor-envio/auth');
  }

  try {
    await exchangeCodeForTokens(code);
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#28a745">✅ Melhor Envio autorizado com sucesso!</h2>
        <p>Tokens salvos. Pode fechar esta janela e voltar ao sistema.</p>
        <script>setTimeout(() => window.close(), 3000)</script>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro ao trocar code por tokens:', err.response?.data || err.message);
    res.redirect('/melhor-envio/auth');
  }
});

module.exports = router;
