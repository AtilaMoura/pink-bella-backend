require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env

const express = require('express');
const cors = require('cors');
const db = require('./database');


const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
    res.send('Backend Pink Bella funcionando! Agora sim');
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
});