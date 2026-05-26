const request = require('supertest');
const app = require('../app');
const db = require('../database');

// Mock do ViaCEP — sem chamadas externas
jest.mock('../utils/cepUtils', () => ({
  lookupAddressByCep: jest.fn().mockResolvedValue({
    logradouro: 'Rua das Flores',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
  }),
}));

const aguardarDb = () =>
  new Promise((resolve, reject) =>
    db.run('SELECT 1', (err) => (err ? reject(err) : resolve()))
  );

beforeAll(() => aguardarDb());

afterEach(() =>
  new Promise((resolve, reject) =>
    db.serialize(() => {
      db.run('DELETE FROM enderecos', () => {});
      db.run('DELETE FROM clientes', (err) => (err ? reject(err) : resolve()));
    })
  )
);

const clienteBase = {
  nome: 'Maria Teste',
  email: 'maria@teste.com',
  telefone: '11999999999',
  cpf: '12345678901',
  endereco: {
    cep: '01310100',
    numero: '100',
    logradouro: 'Rua das Flores',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
  },
};

describe('GET /clientes', () => {
  it('retorna array vazio quando não há clientes', async () => {
    const res = await request(app).get('/clientes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('retorna clientes cadastrados', async () => {
    await request(app).post('/clientes').send(clienteBase);
    const res = await request(app).get('/clientes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe('Maria Teste');
  });
});

describe('POST /clientes', () => {
  it('cadastra cliente com endereço', async () => {
    const res = await request(app).post('/clientes').send(clienteBase);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('cliente');
    expect(res.body.cliente.clienteId).toBeDefined();
  });

  it('retorna 400 se CPF for duplicado', async () => {
    await request(app).post('/clientes').send(clienteBase);
    const res = await request(app).post('/clientes').send({
      ...clienteBase,
      email: 'outro@teste.com',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /clientes/:id', () => {
  it('retorna o cliente pelo id', async () => {
    const criado = await request(app).post('/clientes').send(clienteBase);
    const id = criado.body.cliente.clienteId;

    const res = await request(app).get(`/clientes/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Maria Teste');
    expect(res.body.endereco).toBeDefined();
  });

  it('retorna 404 para id inexistente', async () => {
    const res = await request(app).get('/clientes/99999');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /clientes/:id', () => {
  it('faz soft delete (toggle ativo)', async () => {
    const criado = await request(app).post('/clientes').send(clienteBase);
    const id = criado.body.cliente.clienteId;

    const res = await request(app).delete(`/clientes/${id}`);
    expect(res.status).toBe(200);

    const cliente = await new Promise((resolve, reject) =>
      db.get('SELECT ativo FROM clientes WHERE id = ?', [id], (err, row) =>
        err ? reject(err) : resolve(row)
      )
    );
    expect(cliente.ativo).toBe(0);
  });
});
