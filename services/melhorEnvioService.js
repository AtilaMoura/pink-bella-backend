const axios = require('axios');

const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = process.env.MELHOR_ENVIO_URL;
const CEP_ORIGEM_LOJA = process.env.CEP_ORIGEM_LOJA;
const SEU_EMAIL_MELHOR_ENVIO = process.env.SEU_EMAIL_MELHOR_ENVIO;

// Medidas mínimas exigidas pelo Melhor Envio (em cm para altura/largura/comprimento, kg para peso)
const MEDIDAS_MINIMAS = {
    height: 2,
    width: 11,
    length: 16,
    weight: 0.1 // Peso mínimo em KG
};

/**
 * Calcula o frete usando a API do Melhor Envio, aplicando a lógica de dimensões personalizada da PinkBella.
 * @param {string} cepDestino - CEP de destino.
 * @param {number} quantidadeTotalItens - Quantidade total de unidades de produtos na compra.
 * @returns {Promise<Array>} - Retorna um array de opções de frete.
 * @param {Array<Object>} orders
 */
async function calcularFrete(cepDestino, quantidadeTotalItens) { // <-- AGORA RECEBE APENAS quantidadeTotalItens
    if (!MELHOR_ENVIO_TOKEN) {
        throw new Error('MELHOR_ENVIO_TOKEN não configurado no .env');
    }
    if (!CEP_ORIGEM_LOJA || !SEU_EMAIL_MELHOR_ENVIO) {
        throw new Error('CEP de origem da loja ou e-mail do Melhor Envio não configurados no .env');
    }
    if (typeof quantidadeTotalItens !== 'number' || quantidadeTotalItens <= 0) {
        throw new Error('A quantidade total de itens é obrigatória e deve ser um número positivo para calcular o frete.');
    }

    // --- Lógica para agregar peso e dimensões dos produtos com base na quantidadeTotalItens ---
    let pesoCalculado = 0;
    if (quantidadeTotalItens === 1) {
        pesoCalculado = 500; // 500g para o primeiro item
    } else if (quantidadeTotalItens > 1) {
        pesoCalculado = 500 + (250 * (quantidadeTotalItens - 1)); // 500g + 250g para cada item extra
    }

    let alturaCalculada = 0;
    if (quantidadeTotalItens === 1) {
        alturaCalculada = 8; // 8cm para o primeiro item
    } else if (quantidadeTotalItens > 1) {
        alturaCalculada = 8 + (2 * (quantidadeTotalItens - 1)); // 8cm + 2cm para cada item extra
    }

    // Largura e Comprimento são fixos em 25cm
    const larguraFixa = 25;
    const comprimentoFixo = 25;

    // Garante que as dimensões e peso respeitem os mínimos exigidos pelo Melhor Envio
    // E converte peso para KG (dividindo por 1000)
    const pacoteFinal = {
        height: Math.max(alturaCalculada, MEDIDAS_MINIMAS.height),
        width: Math.max(larguraFixa, MEDIDAS_MINIMAS.width),
        length: Math.max(comprimentoFixo, MEDIDAS_MINIMAS.length),
        weight: Math.max(pesoCalculado / 1000, MEDIDAS_MINIMAS.weight) // Peso em KG
    };
    // --- Fim da lógica de agregação ---

    const dadosFrete = {
        from: { postal_code: CEP_ORIGEM_LOJA },
        to: { postal_code: cepDestino },
        volumes: [pacoteFinal], // Envia o pacote final calculado
        options: {
            receipt: false,
            own_hand: false
        }
    };

    try {
        const response = await axios.post(`${MELHOR_ENVIO_URL}/me/shipment/calculate`, dadosFrete, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
                'User-Agent': `PinkBellaBackend (${SEU_EMAIL_MELHOR_ENVIO})`
            }
        });

        const opcoesValidas = response.data
            .filter(service => !service.error)
            .map(service => ({
                ...service,
                pacote_utilizado: pacoteFinal // Adiciona os detalhes do pacote usado para o cálculo
            }));

        if (opcoesValidas.length === 0) {
            console.error('Melhor Envio: Nenhuma opção de frete válida encontrada para o trecho/dimensões.');
            throw new Error('Nenhuma opção de frete disponível para o trecho ou dimensões informadas.');
        }

        return opcoesValidas;

    } catch (error) {
        console.error('Erro ao chamar a API do Melhor Envio:', error.message);
        if (error.response) {
            console.error('Detalhes do erro Melhor Envio:', error.response.data);
            // Tenta pegar uma mensagem de erro mais específica do Melhor Envio, se houver
            const melhorEnvioErrorMsg = error.response.data.message || (error.response.data.errors && Object.values(error.response.data.errors).flat().join(', '));
            throw new Error(`Erro na integração com Melhor Envio: ${melhorEnvioErrorMsg || JSON.stringify(error.response.data)}`);
        }
        throw new Error('Erro desconhecido ao calcular frete com Melhor Envio.');
    }
}



async function adicionarEnviosAoCarrinho(listaDeCompras) {
    

    const data = {
  "from": {
    "name": "Pink Bella", // Mantendo o nome da sua loja
    "phone": "+5511978445381", // Seu número real (apenas números, com DDI + DDD)
    "email": "utilefacil.123@gmail.com", // Seu email real
    "document": "43740234881", // Seu CPF ou CNPJ (apenas números)
    "address": 'Rua Cândido Rodrigues',
    "state_register": 'SP',
    "number": '21',
    "district": 'Jardim Vila Formosa',
    "city": 'São Paulo',
    "country_id": 'BR',
    "postal_code": '03472-090',
    "state_abbr": 'SP',
    "complement": 'bloco A Ap 4',
  },
  "to": {
    "name": "Maria Silva", // Nome do cliente
    "phone": "+5511987654321", // Número do cliente (apenas números, com DDI + DDD)
    "email": "maria.silva@xample.com", // Email do cliente
    "document": "72656980704", // CPF do cliente (apenas números) "document": '38185684843',
    "address": 'Praça da Sé',
    "complement": 'Apto 10',
    "number": '100',
    "district": 'Sé',
    "city": 'São Paulo',
    "country_id": 'BR',
    "postal_code": '01001000',
    "state_abbr": 'SP'
  },
  "service": 2, // <-- Alterado para NUMBER, como esperado. ID do serviço (ex: PAC, SEDEX).
  "volumes": [
    {
      "height": 10, // cm (use as dimensões reais do seu pacote)
      "width": 25, // cm
      "length": 25, // cm
      "weight": 0.75 // kg
    }
  ],
  "options": {
    "insurance_value": 111.98, // Valor segurado (o valor total dos produtos)
    "receipt": false,
    "own_hand": false,
    "reverse": false,
    "non_commercial": true,
    "platform": "Pink Bella",
    "tags": [
      {
        "tag": "PinkBella-Compra-2", // Exemplo de tag
        "url": "https://sua-plataforma.com/pedidos/2" // URL do pedido (opcional)
      }
    ],
    "invoice": { "key": null } // <-- Adicionado, mesmo que non_commercial seja true
  },
  "products": [ // Produtos para a Declaração de Conteúdo
    {
      "name": "Vestido de alça", // Nome real do produto
      "quantity": "1", // Mantido como STRING
      "unitary_value": "55.99" // Mantido como STRING
    }
  ]
};

console.log("Payload FINAL para Melhor Envio certo:", JSON.stringify(data, null, 2));

    const response = await axios.post(`${MELHOR_ENVIO_URL}/me/cart`, listaDeCompras, {
        headers: {
            'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    return response.data;
}


// ... (Adicione outras funções de serviço do Melhor Envio aqui, como consultar saldo, pagar etiquetas) ...

module.exports = {
    calcularFrete,
    adicionarEnviosAoCarrinho
};