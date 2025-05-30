const express = require('express');
const router = express.Router();
const { calcularFrete } = require('../utils/melhorEnvioUtils'); // Importa a função de cálculo de frete
const db = require('../database'); // Importa a conexão com o banco de dados para buscar detalhes do produto

// POST /frete/calcular - Calcula o frete para um determinado CEP e uma lista de IDs de produtos
// Endpoint: http://localhost:3000/frete/calcular
// Body esperado:
// {
//   "cepDestino": "SEU_CEP_DESTINO",
//   "itens": [ // Agora aceita apenas produto_id e quantidade
//     { "produto_id": 1, "quantidade": 2 },
//     { "produto_id": 3, "quantidade": 1 }
//   ]
// }
router.post('/calcular', async (req, res) => {
    const { cepDestino, itens } = req.body; // 'itens' agora contém produto_id e quantidade

    if (!cepDestino || !itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'CEP de destino e uma lista de itens (produto_id e quantidade) são obrigatórios para calcular o frete.' });
    }

    let itensProdutosParaFrete = []; // Esta será a lista com peso, altura, etc., dos produtos

    try {
        // Para cada item recebido, buscamos os detalhes completos do produto no DB
        for (const item of itens) {
            if (typeof item.produto_id !== 'number' || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
                return res.status(400).json({ error: 'Cada item deve ter produto_id e quantidade válidos.' });
            }

            const produto = await new Promise((resolve, reject) => {
                db.get('SELECT id, nome, preco, peso, altura, largura, comprimento, estoque FROM produtos WHERE id = ?', [item.produto_id], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (!produto) {
                return res.status(404).json({ error: `Produto com ID ${item.produto_id} não encontrado.` });
            }

            // Adiciona o produto com suas dimensões e peso à lista para o cálculo do frete
            itensProdutosParaFrete.push({
                peso: produto.peso,
                altura: produto.altura,
                largura: produto.largura,
                comprimento: produto.comprimento,
                quantidade: item.quantidade // A quantidade que foi solicitada
            });
        }

        // Agora chamamos calcularFrete com a lista de itensProdutosParaFrete completa
        const opcoesFreteBrutas = await calcularFrete(cepDestino, itensProdutosParaFrete);

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

        res.json(opcoesFreteFormatadas);

    } catch (error) {
        console.error('Erro na rota /frete/calcular:', error.message);
        res.status(500).json({ error: error.message || 'Erro ao calcular o frete.' });
    }
});

module.exports = router;