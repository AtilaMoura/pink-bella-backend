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
    weight: 0.1
};

/**
 * Calcula o frete usando a API do Melhor Envio.
 * @param {string} cepDestino - CEP de destino.
 * @param {Array} itensProdutos - Array de objetos, cada um com { peso, altura, largura, comprimento, quantidade }.
 * @returns {Promise<Array>} - Retorna um array de opções de frete.
 */
async function calcularFrete(cepDestino, itensProdutos) {
    if (!MELHOR_ENVIO_TOKEN) {
        throw new Error('MELHOR_ENVIO_TOKEN não configurado no .env');
    }
    if (!CEP_ORIGEM_LOJA || !SEU_EMAIL_MELHOR_ENVIO) {
        throw new Error('CEP de origem da loja ou e-mail do Melhor Envio não configurados no melhorEnvioUtils.js');
    }
    if (!itensProdutos || !Array.isArray(itensProdutos) || itensProdutos.length === 0) {
        throw new Error('A lista de produtos (itensProdutos) é obrigatória para calcular o frete.');
    }

    // --- Lógica para agregar peso e dimensões dos produtos ---
    let pesoTotal = 0;
    let maiorAltura = 0;
    let maiorLargura = 0;
    let maiorComprimento = 0;

    for (const item of itensProdutos) {
        // Validação básica dos dados do item
        if (typeof item.peso !== 'number' || typeof item.altura !== 'number' ||
            typeof item.largura !== 'number' || typeof item.comprimento !== 'number' ||
            typeof item.quantidade !== 'number' || item.quantidade <= 0) {
            console.warn('Item de produto inválido encontrado:', item);
            continue; // Pula itens inválidos
        }

        pesoTotal += item.peso * item.quantidade;
        
        // Para dimensões, geralmente se pega a maior dimensão entre os produtos,
        // supondo que eles serão embalados em um único pacote que acomode o maior.
        // Se a embalagem for mais complexa (ex: somar alturas se empilhados), a lógica seria diferente.
        maiorAltura = Math.max(maiorAltura, item.altura);
        maiorLargura = Math.max(maiorLargura, item.largura);
        maiorComprimento = Math.max(maiorComprimento, item.comprimento);
    }

    // Garante que as dimensões e peso respeitem os mínimos exigidos pelo Melhor Envio
    const pacoteFinal = {
        height: Math.max(maiorAltura, MEDIDAS_MINIMAS.height),
        width: Math.max(maiorLargura, MEDIDAS_MINIMAS.width),
        length: Math.max(maiorComprimento, MEDIDAS_MINIMAS.length),
        weight: Math.max(pesoTotal, MEDIDAS_MINIMAS.weight)
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

    // NOVO CÓDIGO AQUI: Filtra apenas as opções de frete que NÃO têm erro
    const opcoesValidas = response.data.filter(service => !service.error);

    // Se, após filtrar, não houver NENHUMA opção de frete válida, então dispara um erro.
    if (opcoesValidas.length === 0) {
        console.error('Melhor Envio: Nenhuma opção de frete válida encontrada para o trecho/dimensões.');
        // Opcional: console.error('Resposta completa do Melhor Envio para depuração:', JSON.stringify(response.data, null, 2));
        throw new Error('Nenhuma opção de frete disponível para o trecho ou dimensões informadas.');
    }

    // Retorna apenas as opções válidas
    return opcoesValidas;

    } catch (error) {
    console.error('Erro ao chamar a API do Melhor Envio:', error.message);
    if (error.response) {
        console.error('Detalhes do erro Melhor Envio:', error.response.data);
        throw new Error(`Erro na integração com Melhor Envio: ${error.response.data.message || JSON.stringify(error.response.data)}`);
    }
    throw new Error('Erro desconhecido ao calcular frete com Melhor Envio.');
    }
}

module.exports = {
    calcularFrete
};