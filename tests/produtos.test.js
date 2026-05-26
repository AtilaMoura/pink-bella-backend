const request = require('supertest');
const app = require('../app');
const db = require('../database');

// Aguarda a fila do SQLite esvaziar (garante que as tabelas foram criadas)
const aguardarDb = () =>
  new Promise((resolve, reject) =>
    db.run('SELECT 1', (err) => (err ? reject(err) : resolve()))
  );

beforeAll(() => aguardarDb());

afterEach(() =>
  new Promise((resolve, reject) =>
    db.run('DELETE FROM produtos', (err) => (err ? reject(err) : resolve()))
  )
);

describe('GET /produtos', () => {
  it('retorna array vazio quando não há produtos', async () => {
    const res = await request(app).get('/produtos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna apenas produtos ativos', async () => {
    await new Promise((resolve, reject) =>
      db.run(
        `INSERT INTO produtos (nome, preco, estoque, ativo) VALUES ('Vestido', 99.90, 10, 1), ('Blusa', 49.90, 5, 0)`,
        (err) => (err ? reject(err) : resolve())
      )
    );
    const res = await request(app).get('/produtos');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe('Vestido');
  });
});

describe('POST /produtos', () => {
  it('cadastra um produto sem imagem', async () => {
    const res = await request(app)
      .post('/produtos')
      .field('nome', 'Saia Floral')
      .field('preco', '79.90')
      .field('estoque', '15');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('productId');
  });

  it('retorna 400 se nome estiver ausente', async () => {
    const res = await request(app)
      .post('/produtos')
      .field('preco', '50')
      .field('estoque', '10');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 400 se preco estiver ausente', async () => {
    const res = await request(app)
      .post('/produtos')
      .field('nome', 'Camiseta')
      .field('estoque', '10');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /produtos/:id', () => {
  it('retorna o produto pelo id', async () => {
    const inserido = await new Promise((resolve, reject) =>
      db.run(
        `INSERT INTO produtos (nome, preco, estoque, ativo) VALUES ('Calça', 129.90, 8, 1)`,
        function (err) { err ? reject(err) : resolve(this.lastID); }
      )
    );

    const res = await request(app).get(`/produtos/${inserido}`);
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Calça');
    expect(res.body.preco).toBe(129.90);
  });

  it('retorna 404 para id inexistente', async () => {
    const res = await request(app).get('/produtos/99999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /produtos/:id', () => {
  it('atualiza campos do produto', async () => {
    const id = await new Promise((resolve, reject) =>
      db.run(
        `INSERT INTO produtos (nome, preco, estoque, ativo) VALUES ('Regata', 39.90, 20, 1)`,
        function (err) { err ? reject(err) : resolve(this.lastID); }
      )
    );

    const res = await request(app)
      .put(`/produtos/${id}`)
      .field('nome', 'Regata Premium')
      .field('preco', '59.90')
      .field('estoque', '25');

    expect(res.status).toBe(200);

    const produto = await new Promise((resolve, reject) =>
      db.get('SELECT * FROM produtos WHERE id = ?', [id], (err, row) =>
        err ? reject(err) : resolve(row)
      )
    );
    expect(produto.nome).toBe('Regata Premium');
    expect(produto.estoque).toBe(25);
  });

  it('retorna 404 para id inexistente', async () => {
    const res = await request(app)
      .put('/produtos/99999')
      .field('nome', 'X')
      .field('preco', '10')
      .field('estoque', '1');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /produtos/:id', () => {
  it('faz soft delete (marca ativo = 0)', async () => {
    const id = await new Promise((resolve, reject) =>
      db.run(
        `INSERT INTO produtos (nome, preco, estoque, ativo) VALUES ('Shorts', 59.90, 12, 1)`,
        function (err) { err ? reject(err) : resolve(this.lastID); }
      )
    );

    const res = await request(app).delete(`/produtos/${id}`);
    expect(res.status).toBe(200);

    const produto = await new Promise((resolve, reject) =>
      db.get('SELECT ativo FROM produtos WHERE id = ?', [id], (err, row) =>
        err ? reject(err) : resolve(row)
      )
    );
    expect(produto.ativo).toBe(0);
  });

  it('retorna 404 para id inexistente', async () => {
    const res = await request(app).delete('/produtos/99999');
    expect(res.status).toBe(404);
  });
});
