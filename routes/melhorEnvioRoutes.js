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

module.exports = router;