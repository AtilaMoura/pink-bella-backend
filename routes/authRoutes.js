const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  try {
    const usuario = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM usuarios WHERE email = ? AND ativo = 1',
        [email],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nome: usuario.nome },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome },
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error.message);
    res.status(500).json({ error: 'Erro ao realizar login.' });
  }
});

module.exports = router;
