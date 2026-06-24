const request = require('supertest');
const app = require('../app');

// Mock do banco — nunca toca o banco de produção
jest.mock('../database', () => ({
  get: jest.fn(),
  run: jest.fn(),
  all: jest.fn(),
  query: jest.fn(),
  serialize: jest.fn((fn) => fn && fn()),
}));

// Mock do ViaCEP
jest.mock('../utils/cepUtils', () => ({
  lookupAddressByCep: jest.fn().mockResolvedValue({
    logradouro: 'Rua das Flores',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
  }),
}));

const db = require('../database');

beforeEach(() => {
  jest.clearAllMocks();
});

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
    db.all.mockImplementationOnce((sql, params, cb) => cb(null, []));

    const res = await request(app).get('/clientes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('retorna clientes cadastrados', async () => {
    db.all.mockImplementationOnce((sql, params, cb) =>
      cb(null, [
        { id: 1, nome: 'Maria Teste', email: 'maria@teste.com', telefone: '11999999999', cpf: '12345678901', ativo: 1,
          data_cadastro: new Date().toISOString(), endereco: null },
      ])
    );

    const res = await request(app).get('/clientes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe('Maria Teste');
  });

  it('retorna 500 em erro de banco', async () => {
    db.all.mockImplementationOnce((sql, params, cb) => cb(new Error('Falha no banco')));

    const res = await request(app).get('/clientes');
    expect(res.status).toBe(500);
  });
});

describe('POST /clientes', () => {
  it('cadastra cliente com endereço — retorna 201', async () => {
    // 1. Verifica CPF duplicado (não encontra)
    db.get.mockImplementationOnce((sql, params, cb) => cb(null, null));
    // 2. INSERT enderecos
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ lastID: 10 }, null));
    // 3. INSERT clientes
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ lastID: 5 }, null));
    // 4. UPDATE endereco principal
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));

    const res = await request(app).post('/clientes').send(clienteBase);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('cliente');
  });

  it('retorna 400 se CPF já cadastrado', async () => {
    // Verifica CPF — encontra existente
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { id: 1, nome: 'Existente' })
    );

    const res = await request(app).post('/clientes').send(clienteBase);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 400 se nome não informado', async () => {
    const res = await request(app).post('/clientes').send({ email: 'teste@teste.com' });
    expect(res.status).toBe(400);
  });
});

describe('GET /clientes/:id', () => {
  it('retorna o cliente pelo id', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, {
        id: 5, nome: 'Maria Teste', email: 'maria@teste.com',
        telefone: '11999999999', cpf: '12345678901', ativo: 1,
        data_cadastro: new Date().toISOString(),
        endereco_id: 10, cep: '01310100', logradouro: 'Rua das Flores',
        numero: '100', bairro: 'Centro', cidade: 'São Paulo', estado: 'SP',
        complemento: null, referencia: null, tipo_endereco: 'Residencial', is_principal: true,
      })
    );

    const res = await request(app).get('/clientes/5');
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Maria Teste');
  });

  it('retorna 404 para id inexistente', async () => {
    db.get.mockImplementationOnce((sql, params, cb) => cb(null, null));

    const res = await request(app).get('/clientes/99999');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /clientes/:id (soft delete)', () => {
  it('alterna campo ativo sem deletar o registro', async () => {
    // Busca cliente atual
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { id: 5, ativo: 1 })
    );
    // UPDATE ativo = 0
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));

    const res = await request(app).delete('/clientes/5');
    expect(res.status).toBe(200);

    // Confirma que nunca foi chamado um DELETE real
    const deleteChamado = db.run.mock.calls.some(([sql]) =>
      sql.trim().toUpperCase().startsWith('DELETE')
    );
    expect(deleteChamado).toBe(false);
  });

  it('retorna 404 para cliente inexistente', async () => {
    db.get.mockImplementationOnce((sql, params, cb) => cb(null, null));

    const res = await request(app).delete('/clientes/99999');
    expect(res.status).toBe(404);
  });
});
