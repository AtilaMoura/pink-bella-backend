// Testa calcularFrete isoladamente — sem mock global do melhorEnvioService
// Mocka apenas axios e melhorEnvioAuth para não fazer chamadas externas

const retornoME = [
  { id: 2, company: { name: 'JeT' }, name: 'Standard', price: '53.17', delivery_time: '14' },
];

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: retornoME }),
}));

jest.mock('../services/melhorEnvioAuth', () => ({
  getValidToken: jest.fn().mockResolvedValue('token-teste'),
}));

// database e comprasService são importados pelo service mas não usados em calcularFrete
jest.mock('../database', () => ({}));
jest.mock('../services/comprasService', () => ({}));

const axios = require('axios');
const { calcularFrete } = require('../services/melhorEnvioService');

beforeEach(() => {
  axios.post.mockClear();
  axios.post.mockResolvedValue({ data: retornoME });
});

describe('calcularFrete — payload enviado ao Melhor Envio', () => {
  it('inclui insurance_value igual ao valorDeclarado', async () => {
    await calcularFrete('01310100', 2, 200.00);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.options.insurance_value).toBe(200.00);
  });

  it('usa insurance_value 0 quando valorDeclarado não é passado', async () => {
    await calcularFrete('01310100', 1);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.options.insurance_value).toBe(0);
  });

  it('inclui non_commercial: true nas options', async () => {
    await calcularFrete('01310100', 1, 50.00);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.options.non_commercial).toBe(true);
  });

  it('calcula peso correto para 1 item (500g = 0.5kg)', async () => {
    await calcularFrete('01310100', 1, 0);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.volumes[0].weight).toBe(0.5);
  });

  it('calcula peso correto para 3 itens (500 + 250*2 = 1000g = 1kg)', async () => {
    await calcularFrete('01310100', 3, 0);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.volumes[0].weight).toBe(1.0);
  });

  it('calcula altura correta para 1 item (8cm)', async () => {
    await calcularFrete('01310100', 1, 0);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.volumes[0].height).toBe(8);
  });

  it('calcula altura correta para 3 itens (8 + 2*2 = 12cm)', async () => {
    await calcularFrete('01310100', 3, 0);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.volumes[0].height).toBe(12);
  });

  it('mantém largura e comprimento fixos em 25cm', async () => {
    await calcularFrete('01310100', 5, 0);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.volumes[0].width).toBe(25);
    expect(payload.volumes[0].length).toBe(25);
  });

  it('envia CEP de origem da loja como from.postal_code', async () => {
    await calcularFrete('03472090', 1, 0);

    const payload = axios.post.mock.calls[0][1];
    expect(payload.from.postal_code).toBe(process.env.CEP_ORIGEM_LOJA);
    expect(payload.to.postal_code).toBe('03472090');
  });

  it('retorna apenas opções sem erro', async () => {
    axios.post.mockResolvedValueOnce({
      data: [
        { id: 1, company: { name: 'JeT' }, name: 'Standard', price: '45.89', delivery_time: '14' },
        { id: 2, company: { name: 'Erro' }, name: 'Serviço', price: null, delivery_time: '0', error: 'fora do raio' },
      ],
    });

    const resultado = await calcularFrete('01310100', 1, 0);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].company.name).toBe('JeT');
  });

  it('lança erro quando quantidadeTotalItens é 0', async () => {
    await expect(calcularFrete('01310100', 0, 0)).rejects.toThrow();
  });

  it('lança erro quando quantidadeTotalItens é negativo', async () => {
    await expect(calcularFrete('01310100', -1, 0)).rejects.toThrow();
  });
});
