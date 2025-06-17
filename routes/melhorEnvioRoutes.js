// routes/melhorEnvioRoutes.js
const express = require('express');
const router = express.Router();
const melhorEnvioService = require('../services/melhorEnvioService');

router.post('/adicionar-ao-carrinho', async (req, res) => {
  const { purchaseIds } = req.body;

  console.log('Requisição recebida para /adicionar-ao-carrinho. purchaseIds:', purchaseIds);

  if (!purchaseIds || !Array.isArray(purchaseIds) || purchaseIds.length === 0) {
    return res.status(400).json({ message: "É necessário fornecer IDs de compra válidos." });
  }

  const results = []; // Para armazenar as respostas de cada envio
  const errors = []; // Para armazenar erros específicos de cada envio

  for (const purchaseId of purchaseIds) {
    console.log(`--- Processando compra ID: ${purchaseId} ---`);
    try {
      // Chama o serviço para adicionar um ÚNICO envio ao carrinho
      const result = await melhorEnvioService.adicionarEnviosAoCarrinho(purchaseId);
      results.push({ purchaseId, status: 'success', data: result });
      console.log(`Compra ${purchaseId} adicionada ao carrinho com sucesso.`);
    } catch (error) {
      console.error(`Erro ao adicionar compra ${purchaseId} ao carrinho:`, error.message);
      let errorDetails = error.message;
      if (error.response && error.response.data) {
        errorDetails = error.response.data;
        console.error("Detalhes do erro da API Melhor Envio para compra", purchaseId, ":", errorDetails);
      }
      errors.push({ purchaseId, status: 'error', message: error.message, details: errorDetails });
    }
  }

  // Responde ao cliente com os resultados de todos os processamentos
  if (errors.length > 0) {
    return res.status(207).json({ // 207 Multi-Status para indicar sucesso parcial
      message: "Algumas compras foram adicionadas ao carrinho, outras tiveram erros.",
      successful: results,
      failed: errors
    });
  } else {
    return res.status(200).json({
      message: "Todas as compras foram adicionadas ao carrinho com sucesso.",
      data: results
    });
  }
});

router.get('/valorfrete', async(req, res) => {
  try {
    const valor = await melhorEnvioService.getTotalValorCarrinho();
    console.log('Valor do carrinho:', valor);
    return res.json(valor);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao consultar o valor do carrinho' });
  }
})

router.get('/saldo', async (req, res) => {
  try {
    const saldo = await melhorEnvioService.getBalance();
    res.json(saldo);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar saldo no Melhor Envio' });
  }
});

router.post('/gerenciar-credito', async (req, res) => {
    // Parâmetros opcionais: valor mínimo desejado e gateway de pagamento
    const { minDesiredBalance = 50.00, gateway = 'pix' } = req.body;

    try {
        // 1. Consultar saldo atual
        const balanceResponse = await melhorEnvioService.getBalance();
        const currentBalance = parseFloat(balanceResponse.balance);
        console.log(`Saldo atual no Melhor Envio: R$ ${currentBalance}`);

        // 2. Consultar itens no carrinho e calcular o custo total do frete
        const cartItems = await melhorEnvioService.getCartItems();
        let totalCartShippingCost = 0;

        if (cartItems && cartItems.length > 0) {
            cartItems.forEach(item => {
                if (item.price && typeof item.price === 'string') {
                    totalCartShippingCost += parseFloat(item.price.replace(',', '.'));
                } else if (item.price && typeof item.price === 'number') {
                    totalCartShippingCost += item.price;
                }
            });
            console.log(`Custo total dos fretes no carrinho: R$ ${totalCartShippingCost.toFixed(2)}`);
        } else {
            console.log('Carrinho do Melhor Envio está vazio.');
        }

        // 3. Determinar o valor necessário para depósito
        let depositAmountNeeded = 0;
        if (currentBalance < totalCartShippingCost) {
            depositAmountNeeded = totalCartShippingCost - currentBalance;
            // Adiciona um buffer para garantir futuras compras ou um saldo mínimo
            depositAmountNeeded = Math.ceil(depositAmountNeeded + minDesiredBalance);
            console.log(`Saldo insuficiente. Necessário depositar: R$ ${depositAmountNeeded.toFixed(2)}`);
        } else if (currentBalance < minDesiredBalance) {
            depositAmountNeeded = minDesiredBalance - currentBalance;
            console.log(`Saldo abaixo do mínimo desejado. Necessário depositar: R$ ${depositAmountNeeded.toFixed(2)}`);
        }

        if (depositAmountNeeded > 0) {
            // 4. Solicitar adição de fundos via o gateway especificado (Pix por padrão)
            const depositResponse = await melhorEnvioService.addFunds(depositAmountNeeded, gateway);

            // Retorna os detalhes do pagamento (incluindo pix_code e pix_qrcode se gateway='pix')
            return res.status(200).json({
                message: "Saldo insuficiente. Depósito solicitado com sucesso.",
                currentBalance: currentBalance,
                totalCartShippingCost: totalCartShippingCost,
                depositAmountRequested: depositAmountNeeded,
                paymentDetails: depositResponse
            });
        } else {
            // Saldo suficiente, não é necessário depósito
            return res.status(200).json({
                message: "Saldo suficiente para cobrir os fretes do carrinho e manter o mínimo desejado.",
                currentBalance: currentBalance,
                totalCartShippingCost: totalCartShippingCost
            });
        }

    } catch (error) {
        console.error("Erro ao gerenciar crédito Melhor Envio:", error.message);
        // Tratamento de erro detalhado para o cliente
        if (error.response) {
            console.error("Detalhes do erro da API Melhor Envio (gerenciar crédito):", error.response.data);
            return res.status(error.response.status || 500).json({
                message: "Erro na comunicação com a API do Melhor Envio ao gerenciar crédito.",
                details: error.response.data
            });
        }
        return res.status(500).json({
            message: "Erro interno do servidor ao gerenciar crédito.",
            error: error.message
        });
    }});

module.exports = router;