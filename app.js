require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swaggerConfig');
const autenticar = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');
const produtosRoutes = require('./routes/produtosRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const comprasRoutes = require('./routes/comprasRoutes');
const freteRoutes = require('./routes/freteRoutes');
const addressRoutes = require('./routes/addressRoutes');
const melhorEnvioRoutes = require('./routes/melhorEnvioRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.send('Backend Pink Bella funcionando!');
});

// Rota pública — sem autenticação
app.use('/auth', authRoutes);

// Middleware de autenticação aplicado a todas as rotas de negócio
app.use(autenticar);

app.use('/produtos', produtosRoutes);
app.use('/clientes', clientesRoutes);
app.use('/compras', comprasRoutes);
app.use('/frete', freteRoutes);
app.use('/endereco', addressRoutes);
app.use('/melhor-envio', melhorEnvioRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

module.exports = app;
