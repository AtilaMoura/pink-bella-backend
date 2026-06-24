const request = require('supertest');
const app = require('../app');

// Mocka o banco — todos os testes controlam o que db.get/run retornam
jest.mock('../database', () => ({
  get: jest.fn(),
  run: jest.fn(),
  all: jest.fn(),
  query: jest.fn(),
  serialize: jest.fn((fn) => fn && fn()),
}));

// Mocka o melhorEnvioService — sem chamadas externas
jest.mock('../services/melhorEnvioService', () => ({
  calcularFrete: jest.fn(),
  verificarStatusCompra: jest.fn(),
  limparCarrinhoObsoleto: jest.fn(),
}));

// Mocka comprasService (usado em outras rotas do mesmo router)
jest.mock('../services/comprasService', () => ({
  getAllComprasFormatted: jest.fn(),
  editarCompra: jest.fn(),
  atualizarStatusCompra: jest.fn(),
  atualizarStatusPorCodigoEtiqueta: jest.fn(),
  buscarComprasComEtiquetaPendente: jest.fn(),
}));

const db = require('../database');
const melhorEnvioService = require('../services/melhorEnvioService');

// Opções de frete que a API ME retornaria
const opcoesMock = [
  { id: 3, company: { name: 'Jadlog', picture: null }, name: '.Package', price: '43.02', delivery_time: '19', error: undefined, pacote_utilizado: {} },
  { id: 2, company: { name: 'JeT', picture: null }, name: 'Standard', price: '45.89', delivery_time: '14', error: undefined, pacote_utilizado: {} },
  { id: 1, company: { name: 'Correios', picture: null }, name: 'PAC', price: '47.29', delivery_time: '21', error: undefined, pacote_utilizado: {} },
];

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /compras/:id/cotar-frete
// ---------------------------------------------------------------------------

describe('GET /compras/:id/cotar-frete', () => {
  it('retorna 404 quando compra não existe', async () => {
    db.get.mockImplementationOnce((sql, params, cb) => cb(null, null));

    const res = await request(app).get('/compras/999/cotar-frete');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('chama calcularFrete com valor_produtos como valorDeclarado', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { cep: '01310100', valor_produtos: 150.00, total_itens: 2 })
    );
    melhorEnvioService.calcularFrete.mockResolvedValueOnce(opcoesMock);

    const res = await request(app).get('/compras/1/cotar-frete');

    expect(res.status).toBe(200);
    // Confirma que calcularFrete recebeu o valor_produtos como 3º argumento
    expect(melhorEnvioService.calcularFrete).toHaveBeenCalledWith(
      '01310100',
      2,
      150.00
    );
  });

  it('retorna opções ordenadas por preço crescente', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { cep: '01310100', valor_produtos: 100.00, total_itens: 1 })
    );
    melhorEnvioService.calcularFrete.mockResolvedValueOnce(opcoesMock);

    const res = await request(app).get('/compras/1/cotar-frete');

    expect(res.status).toBe(200);
    const opcoes = res.body.opcoes_frete;
    expect(opcoes).toHaveLength(3);
    // Jadlog R$43,02 deve vir primeiro (mais barato)
    expect(opcoes[0].nome_transportadora).toBe('Jadlog');
    expect(opcoes[0].preco_frete).toBe(43.02);
    // Correios R$47,29 deve vir por último
    expect(opcoes[2].nome_transportadora).toBe('Correios');
  });

  it('retorna cep_destino e total_itens na resposta', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { cep: '03472-090', valor_produtos: 80.00, total_itens: 3 })
    );
    melhorEnvioService.calcularFrete.mockResolvedValueOnce(opcoesMock);

    const res = await request(app).get('/compras/5/cotar-frete');

    expect(res.status).toBe(200);
    expect(res.body.cep_destino).toBe('03472090'); // sem hífen
    expect(res.body.total_itens).toBe(3);
  });

  it('retorna 500 quando calcularFrete lança erro', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { cep: '01310100', valor_produtos: 50.00, total_itens: 1 })
    );
    melhorEnvioService.calcularFrete.mockRejectedValueOnce(new Error('Timeout ME'));

    const res = await request(app).get('/compras/1/cotar-frete');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Timeout ME/);
  });
});

// ---------------------------------------------------------------------------
// PUT /compras/:id/frete
// ---------------------------------------------------------------------------

describe('PUT /compras/:id/frete', () => {
  const freteValido = {
    id_servico: 2,
    nome_transportadora: 'JeT',
    servico: 'Standard',
    preco_frete: 45.89,
    prazo_dias_uteis: 14,
  };

  it('retorna 400 quando id_servico está ausente', async () => {
    const res = await request(app)
      .put('/compras/1/frete')
      .send({ preco_frete: 45.89 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id_servico/);
  });

  it('retorna 400 quando preco_frete está ausente', async () => {
    const res = await request(app)
      .put('/compras/1/frete')
      .send({ id_servico: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/preco_frete/);
  });

  it('retorna 404 quando compra não existe', async () => {
    db.get.mockImplementationOnce((sql, params, cb) => cb(null, null));

    const res = await request(app)
      .put('/compras/999/frete')
      .send(freteValido);

    expect(res.status).toBe(404);
  });

  it('retorna 400 para status não permitido (Postado)', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Postado', valor_produtos: '100.00' })
    );

    const res = await request(app)
      .put('/compras/1/frete')
      .send(freteValido);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Postado/);
  });

  it('compra em Pendente: mantém status e NÃO chama limparCarrinhoObsoleto', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pendente', valor_produtos: '200.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));

    const res = await request(app)
      .put('/compras/1/frete')
      .send(freteValido);

    expect(res.status).toBe(200);
    expect(res.body.status_compra).toBe('Pendente');
    expect(res.body.aviso).toBeNull();
    expect(melhorEnvioService.limparCarrinhoObsoleto).not.toHaveBeenCalled();
  });

  it('compra em Pago: mantém status e NÃO chama limparCarrinhoObsoleto', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pago', valor_produtos: '200.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));

    const res = await request(app)
      .put('/compras/1/frete')
      .send(freteValido);

    expect(res.status).toBe(200);
    expect(res.body.status_compra).toBe('Pago');
    expect(melhorEnvioService.limparCarrinhoObsoleto).not.toHaveBeenCalled();
  });

  it('compra em Pagar Etiqueta: reseta para Pago e chama limparCarrinhoObsoleto', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pagar Etiqueta', valor_produtos: '200.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));
    melhorEnvioService.limparCarrinhoObsoleto.mockResolvedValueOnce({
      removidos: [{ id: 'abc', price: 45.89 }],
      mantidos: [],
      totalAntes: 45.89,
      totalDepois: 0,
    });

    const res = await request(app)
      .put('/compras/1/frete')
      .send(freteValido);

    expect(res.status).toBe(200);
    expect(res.body.status_compra).toBe('Pago');
    expect(res.body.aviso).toMatch(/Adicionar ao Carrinho/);
    expect(melhorEnvioService.limparCarrinhoObsoleto).toHaveBeenCalledTimes(1);
  });

  it('compra em Pagar Etiqueta: SQL contém codigo_etiqueta = NULL', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pagar Etiqueta', valor_produtos: '150.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));
    melhorEnvioService.limparCarrinhoObsoleto.mockResolvedValueOnce({ removidos: [], mantidos: [], totalAntes: 0, totalDepois: 0 });

    await request(app).put('/compras/1/frete').send(freteValido);

    // Confirma que o UPDATE incluiu a limpeza dos códigos
    const sqlExecutado = db.run.mock.calls[0][0];
    expect(sqlExecutado).toMatch(/codigo_etiqueta\s*=\s*NULL/i);
    expect(sqlExecutado).toMatch(/codigo_envio\s*=\s*NULL/i);
  });

  it('compra em Pendente: SQL NÃO contém codigo_etiqueta = NULL', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pendente', valor_produtos: '150.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));

    await request(app).put('/compras/1/frete').send(freteValido);

    const sqlExecutado = db.run.mock.calls[0][0];
    expect(sqlExecutado).not.toMatch(/codigo_etiqueta/i);
  });

  it('novo_total é calculado corretamente (valor_produtos + preco_frete)', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pendente', valor_produtos: '200.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));

    const res = await request(app)
      .put('/compras/1/frete')
      .send({ ...freteValido, preco_frete: 30.00 });

    expect(res.status).toBe(200);
    expect(res.body.novo_total).toBeCloseTo(230.00, 2);
  });

  it('limparCarrinhoObsoleto falha silenciosamente — resposta ainda é 200', async () => {
    db.get.mockImplementationOnce((sql, params, cb) =>
      cb(null, { status_compra: 'Pagar Etiqueta', valor_produtos: '100.00' })
    );
    db.run.mockImplementationOnce((sql, params, cb) => cb.call({ changes: 1 }, null));
    melhorEnvioService.limparCarrinhoObsoleto.mockRejectedValueOnce(new Error('Timeout ME'));

    const res = await request(app)
      .put('/compras/1/frete')
      .send(freteValido);

    // Mesmo com erro no carrinho, a troca de frete deve ter sucesso
    expect(res.status).toBe(200);
    expect(res.body.status_compra).toBe('Pago');
  });
});

