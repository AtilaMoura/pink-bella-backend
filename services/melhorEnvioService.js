const axios = require('axios');
const db = require('../database'); 

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

async function adicionarEnviosAoCarrinho(purchaseId) {
  if (!purchaseId) {
    throw new Error("É necessário fornecer um ID de compra válido.");
  }

  try {
    // Busca dados da compra, cliente, endereço e loja
    const purchaseDetailsQuery = `
      SELECT
        c.id AS compra_id,
        c.valor_produtos AS insurance_value,
        c.melhor_envio_service_id AS service_id,
        c.peso_pacote AS package_weight,
        c.altura_pacote AS package_height,
        c.largura_pacote AS package_width,
        c.comprimento_pacote AS package_length,
        cli.nome AS destinatario_name,
        cli.telefone AS destinatario_phone,
        cli.email AS destinatario_email,
        cli.cpf AS destinatario_document,
        end.logradouro AS destinatario_address,
        end.complemento AS destinatario_complement,
        end.numero AS destinatario_number,
        end.bairro AS destinatario_district,
        end.cidade AS destinatario_city,
        end.estado AS destinatario_state_abbr,
        end.cep AS destinatario_postal_code,
        'BR' AS destinatario_country_id
      FROM compras c
      JOIN clientes cli ON cli.id = c.cliente_id
      JOIN enderecos end ON end.id = c.endereco_entrega_id
      WHERE c.id = ?
    `;

    const purchase = await new Promise((resolve, reject) => {
      db.get(purchaseDetailsQuery, [purchaseId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!purchase) {
      throw new Error(`Compra ${purchaseId} não encontrada no banco de dados.`);
    }

    // Busca produtos da compra
    const productsInPurchaseQuery = `
      SELECT
        p.nome AS product_name,
        ic.quantidade AS quantity,
        ic.preco_unitario_no_momento_da_compra AS unitary_value,
        p.peso AS item_weight,
        p.altura AS item_height,
        p.largura AS item_width,
        p.comprimento AS item_length
      FROM itens_compra ic
      JOIN produtos p ON p.id = ic.produto_id
      WHERE ic.compra_id = ?
    `;

    const productsInPurchase = await new Promise((resolve, reject) => {
      db.all(productsInPurchaseQuery, [purchaseId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    let totalWeight = purchase.package_weight || 0;
    let packageHeight = purchase.package_height || 0;
    let packageWidth = purchase.package_width || 0;
    let packageLength = purchase.package_length || 0;

    const productsForMelhorEnvio = productsInPurchase.map(item => {
      if (!purchase.package_weight) {
        totalWeight += (item.item_weight || 0) * item.quantity;
        packageHeight = Math.max(packageHeight, (item.item_height || 0));
        packageWidth = Math.max(packageWidth, (item.item_width || 0));
        packageLength = Math.max(packageLength, (item.item_length || 0));
      }

      return {
        name: item.product_name,
        quantity: String(item.quantity),
        unitary_value: String(item.unitary_value)
      };
    });

    // Monta o objeto de envio (único), e envia como array
    const orderMelhorEnvio = {
      from: {
        name: "Pink Bella",
        phone: "+5511978445381",
        email: "utilefacil.123@gmail.com",
        document: "43740234881",
        address: "Rua Cândido Rodrigues",
        state_register: "SP",
        number: "21",
        district: "Jardim Vila Formosa",
        city: "São Paulo",
        country_id: "BR",
        postal_code: "03472090",
        state_abbr: "SP",
        complement: "bloco A Ap 4"
      },
      to: {
        name: purchase.destinatario_name,
        phone: "+55" + String(purchase.destinatario_phone),
        email: purchase.destinatario_email,
        document: purchase.destinatario_document.replace(/\D/g, ''),
        address: purchase.destinatario_address,
        complement: purchase.destinatario_complement,
        number: String(purchase.destinatario_number),
        district: purchase.destinatario_district,
        city: purchase.destinatario_city,
        country_id: "BR",
        postal_code: purchase.destinatario_postal_code.replace(/\D/g, ''),
        state_abbr: purchase.destinatario_state_abbr
      },
      service: purchase.service_id,
      volumes: [
        {
          height: packageHeight,
          width: packageWidth,
          length: packageLength,
          weight: totalWeight
        }
      ],
      options: {
        insurance_value: purchase.insurance_value,
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true,
        platform: "Pink Bella",
        tags: [
          {
            tag: `PinkBella-Compra-${purchase.compra_id}`,
            url: `https://sua-plataforma.com/pedidos/${purchase.compra_id}`
          }
        ],
        invoice: { key: null }
      },
      products: productsForMelhorEnvio
    };

    const response = await axios.post(`${MELHOR_ENVIO_URL}/me/cart`, orderMelhorEnvio, {
      headers: {
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const price = response.data.price; // valor do frete (string ou number)
    const codigo_envio = response.data.protocol;

    console.log(price, codigo_envio)
await new Promise((resolve, reject) => { 
  db.run(
    'UPDATE compras SET valor_frete = ?, codigo_envio = ? WHERE id = ?',
    [parseFloat(price), codigo_envio, purchaseId],
    function (err) {
      if (err) return reject(err);
      resolve();
    }
  );
});

    return response.data;

  } catch (error) {
    console.error("Erro ao adicionar envios ao carrinho:", error);
    if (error.response) {
      console.error("Erro da API Melhor Envio:", error.response.data);
      throw new Error(`Erro da API Melhor Envio para compra ${purchaseId}: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Erro interno ao processar compra ${purchaseId}: ${error.message}`);
  }
}

async function getTotalValorCarrinho() {
  try {
    const response = await axios.get(`${MELHOR_ENVIO_URL}/me/cart`, {
      headers: {
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    const etiquetas = response.data.data;


    // Garante que é um array
    if (!Array.isArray(etiquetas)) {
      throw new Error('Resposta do carrinho não é um array');
    }

    // Soma os valores de todas as etiquetas no carrinho
    const total = etiquetas.reduce((acc, etiqueta) => {
      return acc + parseFloat(etiqueta.price || 0);
    }, 0);

    return { total };

  } catch (error) {
    console.error('Erro ao consultar o carrinho:', error.message);
    throw error;
  }
}

async function getBalance() {
  try {
    console.log('Consultando saldo da conta no Melhor Envio...');
    const response = await axios.get(`${MELHOR_ENVIO_URL}/me/balance`, {
      headers: {
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error("Erro ao consultar saldo no Melhor Envio:", error.message);
    if (error.response) {
      console.error("Detalhes do erro da API Melhor Envio (saldo):", error.response.data);
    }
    throw error;
  }
}

async function adicionarCredito(value, gateway = 'pix') {
    try {
      console.log(`Solicitando adição de R$ ${value} via ${gateway} ao Melhor Envio...`);
      const payload = {
        value: parseFloat(value),
        gateway: gateway
      };
      // Usando a instância 'api'
      const response = await api.post('/me/deposit', payload); 
      return response.data;
    } catch (error) {
      console.error("Erro ao adicionar fundos (Pix) no Melhor Envio:", error.message);
      if (error.response) {
        console.error("Detalhes do erro da API Melhor Envio (depósito Pix):", error.response.data);
      }
      throw error;
    }
}



module.exports = {
    calcularFrete,
    adicionarEnviosAoCarrinho,
    getTotalValorCarrinho,
    getBalance,
    adicionarCredito
};