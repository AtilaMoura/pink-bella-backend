const axios = require('axios');
const db = require('../database');

const CLIENT_ID = process.env.MELHOR_ENVIO_CLIENT_ID;
const CLIENT_SECRET = process.env.MELHOR_ENVIO_CLIENT_SECRET;
const CALLBACK_URL = process.env.MELHOR_ENVIO_CALLBACK_URL || 'http://localhost:3000/melhor-envio/callback';

// Extrai a URL base sem /api/v2 (ex: https://sandbox.melhorenvio.com.br)
function getBaseUrl() {
  return (process.env.MELHOR_ENVIO_URL || '').replace('/api/v2', '');
}

function initTokenTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS melhorenvio_tokens (
      id INTEGER PRIMARY KEY DEFAULT 1,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Erro ao criar tabela melhorenvio_tokens:', err.message);
    else console.log('Tabela melhorenvio_tokens verificada/criada.');
  });
}

async function getStoredTokens() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM melhorenvio_tokens WHERE id = 1', (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function saveTokens(accessToken, refreshToken, expiresIn) {
  const expiresAt = Date.now() + expiresIn * 1000;
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO melhorenvio_tokens (id, access_token, refresh_token, expires_at, updated_at)
       VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [accessToken, refreshToken, expiresAt],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: CALLBACK_URL,
    code,
  });
  const response = await axios.post(`${getBaseUrl()}/oauth/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  });
  const { access_token, refresh_token, expires_in } = response.data;
  await saveTokens(access_token, refresh_token, expires_in);
  console.log('Tokens Melhor Envio salvos com sucesso.');
  return access_token;
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  const response = await axios.post(`${getBaseUrl()}/oauth/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  });
  const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;
  await saveTokens(access_token, newRefreshToken, expires_in);
  console.log('Token Melhor Envio renovado automaticamente.');
  return access_token;
}

async function getValidToken() {
  const tokens = await getStoredTokens();

  if (!tokens || !tokens.access_token) {
    throw new Error('MELHOR_ENVIO_NAO_AUTORIZADO: acesse /melhor-envio/auth para autorizar o app.');
  }

  // Renova proativamente se expirar em menos de 5 minutos
  if (tokens.expires_at && Date.now() > tokens.expires_at - 300_000) {
    if (tokens.refresh_token) {
      return await refreshAccessToken(tokens.refresh_token);
    }
    throw new Error('MELHOR_ENVIO_NAO_AUTORIZADO: token expirado, acesse /melhor-envio/auth para reautorizar.');
  }

  return tokens.access_token;
}

function getAuthorizationUrl() {
  const scopes = [
    'cart-read', 'cart-write', 'companies-read', 'companies-write',
    'coupons-read', 'coupons-write', 'notifications-read', 'orders-read',
    'products-read', 'products-destroy', 'products-write', 'purchases-read',
    'shipping-calculate', 'shipping-cancel', 'shipping-checkout',
    'shipping-companies', 'shipping-generate', 'shipping-preview',
    'shipping-print', 'shipping-share', 'shipping-tracking',
    'ecommerce-shipping', 'transactions-read', 'users-read', 'users-write',
    'webhooks-read', 'webhooks-write', 'webhooks-delete',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    response_type: 'code',
    state: 'pink-bella',
    scope: scopes,
  });

  return `${getBaseUrl()}/oauth/authorize?${params.toString()}`;
}

module.exports = { initTokenTable, getValidToken, exchangeCodeForTokens, getAuthorizationUrl };
