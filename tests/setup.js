// Define banco de dados em memória antes de qualquer módulo ser carregado
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.MELHOR_ENVIO_TOKEN = 'token-teste';
process.env.MELHOR_ENVIO_URL = 'http://localhost';
process.env.CEP_ORIGEM_LOJA = '01310100';
process.env.SEU_EMAIL_MELHOR_ENVIO = 'teste@teste.com';
