require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env

const express = require('express');
const cors = require('cors');
const path = require('path'); 
const db = require('./database');
const produtosRoutes = require('./routes/produtosRoutes'); // Importa as rotas de produtos
const clientesRoutes = require('./routes/clientesRoutes');
const comprasRoutes = require('./routes/comprasRoutes');
const freteRoutes = require('./routes/freteRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares  
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rota de teste
app.get('/', (req, res) => {
    res.send('Backend Pink Bella funcionando! Agora sim ');
});
app.use('/produtos', produtosRoutes);
app.use('/clientes', clientesRoutes);
app.use('/compras', comprasRoutes);
app.use('/frete', freteRoutes); 

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
});