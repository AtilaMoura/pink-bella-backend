const express = require('express');
const router = express.Router();
const { lookupAddressByCep } = require('../utils/cepUtils')
const { calcularFrete } = require('../services/melhorEnvioService'); // Importa a função de cálculo de frete
// const db = require('../database'); // NÃO PRECISAMOS MAIS DO DB AQUI PARA O CÁLCULO DE FRETE
// const { lookupAddressByCep } = require('../utils/cepUtils'); // NÃO PRECISAMOS MAIS DO CEPUTILS DIRETAMENTE AQUI

// POST /frete/calcular - Calcula o frete para um determinado CEP e uma lista de IDs de produtos
// Endpoint: http://localhost:3000/frete/calcular
// Body esperado:
// {
//   "cepDestino": "SEU_CEP_DESTINO",
//   "itens": [ // Usaremos apenas a quantidade total de itens para o cálculo
//     { "produto_id": 1, "quantidade": 2 }, // Exemplo: 2 unidades de produto 1
//     { "produto_id": 3, "quantidade": 1 }  // Exemplo: 1 unidade de produto 3
//   ]
// }
router.post('/calcular', async (req, res) => {
    const { cepDestino, itens } = req.body;

    if (!cepDestino || !itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'CEP de destino e uma lista de itens (produto_id e quantidade) são obrigatórios para calcular o frete.' });
    }

    // --- 1. Calcular a quantidade total de itens ---
    // A regra de frete depende da quantidade total de itens, não dos itens individuais.
    let quantidadeTotalDeItens = 0;
    for (const item of itens) {
        if (typeof item.quantidade !== 'number' || item.quantidade <= 0) {
            return res.status(400).json({ error: 'Cada item deve ter uma quantidade válida e positiva.' });
        }
        quantidadeTotalDeItens += item.quantidade;
    }

    try {
        // --- 2. Chamar a função calcularFrete com a quantidade total de itens ---
        // A função calcularFrete em melhorEnvioUtils.js agora já incorpora sua lógica de peso/dimensão.
        const opcoesFreteBrutas = await calcularFrete(cepDestino, quantidadeTotalDeItens);

        // --- 3. Formatar e retornar as opções de frete ---
        const opcoesFreteFormatadas = opcoesFreteBrutas
            .map(opcao => {
                return {
                    id_servico: opcao.id,
                    nome_transportadora: opcao.company.name,
                    servico: opcao.name,
                    preco_frete: parseFloat(opcao.price),
                    prazo_dias_uteis: parseInt(opcao.delivery_time),
                    formato_tipo_entrega: opcao.format
                };
            })
            .sort((a, b) => a.preco_frete - b.preco_frete);
            const enderecoDetalhes = await lookupAddressByCep(cepDestino);
            
        res.json({
            // Não precisamos mais retornar o 'endereco_destino' aqui,
            // já que o `cepUtils` não é chamado nesta rota.
            // Se o frontend precisar do endereço, ele faria a chamada ao ViaCEP separadamente ou o cliente já teria.
            enderecoDestino: enderecoDetalhes,
            opcoes_frete: opcoesFreteFormatadas,
            quantidade_total_de_itens_considerada: quantidadeTotalDeItens // Útil para depuração
        });

    } catch (error) {
        console.error('Erro na rota /frete/calcular:', error.message);
        // Melhora a mensagem de erro para o cliente
        const errorMessage = error.message.includes('Melhor Envio') ?
                             error.message :
                             'Erro ao calcular o frete. Verifique o CEP e tente novamente.';
        res.status(500).json({ error: errorMessage });
    }
});

module.exports = router;