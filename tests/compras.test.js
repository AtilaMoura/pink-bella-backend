const request = require('supertest');
const app = require('../app');

// Mock completo do comprasService para não depender de banco com JOINs complexos
jest.mock('../services/comprasService', () => ({
  getAllComprasFormatted: jest.fn(),
  editarCompra: jest.fn(),
  atualizarStatusCompra: jest.fn(),
  atualizarStatusPorCodigoEtiqueta: jest.fn(),
  buscarComprasComEtiquetaPendente: jest.fn(),
}));

// Mock do melhorEnvioService para não fazer chamadas externas
jest.mock('../services/melhorEnvioService', () => ({
  calcularFrete: jest.fn(),
  verificarStatusCompra: jest.fn(),
}));

const comprasService = require('../services/comprasService');

describe('GET /compras', () => {
  it('retorna lista de compras formatadas', async () => {
    const comprasMock = [
      {
        id: 1,
        data_compra: '2024-01-15 10:00:00',
        valor_total: 199.90,
        status_compra: 'Pendente',
        cliente: { id: 1, nome: 'Ana Silva' },
        itens: [],
      },
    ];
    comprasService.getAllComprasFormatted.mockResolvedValueOnce(comprasMock);

    const res = await request(app).get('/compras');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cliente.nome).toBe('Ana Silva');
  });

  it('retorna array vazio quando não há compras', async () => {
    comprasService.getAllComprasFormatted.mockResolvedValueOnce([]);

    const res = await request(app).get('/compras');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna 500 em erro interno', async () => {
    comprasService.getAllComprasFormatted.mockRejectedValueOnce(new Error('Falha no banco'));

    const res = await request(app).get('/compras');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

describe('PUT /compras/:id/status', () => {
  const melhorEnvioService = require('../services/melhorEnvioService');

  it('atualiza status via verificarStatusCompra', async () => {
    melhorEnvioService.verificarStatusCompra.mockResolvedValueOnce({ status: 'Pago' });

    const res = await request(app)
      .put('/compras/1/status')
      .send({ status: 'Pago' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'Pago');
  });
});
