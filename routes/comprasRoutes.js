const express = require('express');
const router = express.Router();
const db = require('../database');
const { calcularFrete } = require('../utils/melhorEnvioUtils'); // Para calcular o frete

// Rota para registrar uma nova compra
// Endpoint: POST /compras
router.post('/', async (req, res) => {
    const { cliente_id, cep_destino, itens } = req.body;

    // --- 1. Validação dos Dados de Entrada ---
    if (!cliente_id || !itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'ID do cliente e uma lista de itens são obrigatórios.' });
    }

    // Validar cada item
    for (const item of itens) {
        if (typeof item.produto_id !== 'number' || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
            return res.status(400).json({ error: 'Cada item deve ter produto_id e uma quantidade válida.' });
        }
    }

    let cliente;
    let produtosCompradosDetalhes = [];
    let quantidadeTotalDeItens = 0; // Inicializa a quantidade total de itens aqui

    try {
        // --- 2. Buscar Informações do Cliente ---
        cliente = await new Promise((resolve, reject) => {
            db.get('SELECT id, cep, logradouro, bairro, cidade, estado FROM clientes WHERE id = ?', [cliente_id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const cepParaFrete = cep_destino || cliente.cep;
        if (!cepParaFrete) {
             return res.status(400).json({ error: 'CEP de destino não fornecido e não encontrado no cadastro do cliente.' });
        }

        // --- 3. Buscar Detalhes dos Produtos e Verificar Estoque ---
        const produtosPromises = itens.map(item => {
            return new Promise((resolve, reject) => {
                // Ajustado para 'quantidade_estoque' (como definimos na sua tabela produtos)
                db.get('SELECT id, nome, preco, estoque FROM produtos WHERE id = ?', [item.produto_id], (err, row) => {
                    if (err) return reject(err);
                    if (!row) {
                        return reject(new Error(`Produto com ID ${item.produto_id} não encontrado.`));
                    }
                    if (row.quantidade_estoque < item.quantidade) { // Usando quantidade_estoque
                        return reject(new Error(`Estoque insuficiente para o produto: ${row.nome}. Disponível: ${row.quantidade_estoque}, Solicitado: ${item.quantidade}.`));
                    }
                    // Adiciona a quantidade comprada ao total para o cálculo do frete
                    quantidadeTotalDeItens += item.quantidade;
                    resolve({ ...row, quantidade_comprada: item.quantidade });
                });
            });
        });

        produtosCompradosDetalhes = await Promise.all(produtosPromises);

        // --- 4. Calcular o Frete ---
        // Agora, chamamos calcularFrete passando a quantidadeTotalDeItens diretamente
        const opcoesFrete = await calcularFrete(cepParaFrete, quantidadeTotalDeItens);

        if (!opcoesFrete || opcoesFrete.length === 0) {
            return res.status(400).json({ error: 'Não foi possível calcular o frete para este destino com os produtos selecionados.' });
        }

        const freteEscolhido = opcoesFrete.sort((a, b) => a.price - b.price)[0];

        if (!freteEscolhido) {
             return res.status(500).json({ error: 'Erro ao selecionar a melhor opção de frete.' });
        }

        // Calculando o valor total dos produtos
        let valorTotalProdutos = produtosCompradosDetalhes.reduce((acc, prod) => acc + (prod.preco * prod.quantidade_comprada), 0);
        let valorTotalCompra = valorTotalProdutos + parseFloat(freteEscolhido.price);


        // --- PONTOS SEGUINTES (A SEREM IMPLEMENTADOS) ---
        // 5. Iniciar uma transação no DB
        // 6. Salvar a compra na tabela 'compras'
        // 7. Salvar cada item na tabela 'itens_compra'
        // 8. Dar baixa no estoque dos produtos
        // 9. Finalizar a transação

        res.status(200).json({
            message: 'Dados validados, produtos e frete calculados com sucesso!',
            cliente: cliente,
            produtos_comprados_detalhes: produtosCompradosDetalhes.map(p => ({
                id: p.id,
                nome: p.nome,
                preco: p.preco,
                quantidade_comprada: p.quantidade_comprada
            })),
            frete_calculado: {
                transportadora: freteEscolhido.company.name,
                servico: freteEscolhido.name,
                preco: parseFloat(freteEscolhido.price),
                prazo_dias_uteis: parseInt(freteEscolhido.delivery_time)
            },
            valor_total_produtos: valorTotalProdutos,
            valor_total_compra: valorTotalCompra,
            cep_utilizado_para_frete: cepParaFrete
        });

    } catch (error) {
        console.error('Erro no processamento da compra:', error.message);
        res.status(500).json({ error: error.message || 'Erro ao processar a compra.' });
    }
});

// Você pode adicionar outras rotas para compras aqui, como:
// GET /compras - Listar todas as compras
// GET /compras/:id - Obter detalhes de uma compra específica
// PUT /compras/:id/status - Atualizar o status de uma compra
// etc.

module.exports = router;