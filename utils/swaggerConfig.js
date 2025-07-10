const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Documentação da API - Melhor Envio + Clientes',
      version: '1.0.0',
      description: 'API para integração com Melhor Envio e gerenciamento de clientes',
    },
  },
  apis: ['./routes/*.js'], // ou altere para o caminho correto das suas rotas
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
