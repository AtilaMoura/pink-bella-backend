const express = require('express');
const router = express.Router();
const db = require('../database'); // Conexão com o banco de dados
const axios = require('axios'); // Para requisições HTTP ao Melhor Envio

// Configurações do Melhor Envio
const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
const MELHOR_ENVIO_URL = 'https://www.melhorenvio.com.br/api/v2'; // URL da API do Melhor Envio

// 1. POST /compras - Registrar uma nova compra (venda)
// Endpoint: http://localhost:3000/compras
router.post('/', async (req, res) => {
    const { cliente_id, itens } = req.body; // 'itens' será um array de { produto_id, quantidade }

    if (!cliente_id || !itens || itens.length === 0) {
        return res.status(400).json({ error: 'ID do cliente e itens da compra são obrigatórios.' });
    }

    let totalCompra = 0;
    let produtosParaSalvar = []; // Lista formatada dos produtos na compra
    let produtosParaAtualizarEstoque = []; // Para controle de estoque

    try {
        // 1. Validar produtos e calcular o total da compra
        for (const item of itens) {
            const produto = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM produtos WHERE id = ?', [item.produto_id], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (!produto) {
                return res.status(404).json({ error: `Produto com ID ${item.produto_id} não encontrado.` });
            }
            if (produto.estoque < item.quantidade) {
                return res.status(400).json({ error: `Estoque insuficiente para o produto ${produto.nome}. Disponível: ${produto.estoque}, Solicitado: ${item.quantidade}.` });
            }

            totalCompra += produto.preco * item.quantidade;
            produtosParaSalvar.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                quantidade: item.quantidade,
                peso: produto.peso,
                altura: produto.altura,
                largura: produto.largura,
                comprimento: produto.comprimento
            });
            produtosParaAtualizarEstoque.push({
                id: produto.id,
                novaQuantidadeEstoque: produto.estoque - item.quantidade
            });
        }

        // 2. Obter informações do cliente para cálculo de frete (CEP)
        const cliente = await new Promise((resolve, reject) => {
            db.get('SELECT cep FROM clientes WHERE id = ?', [cliente_id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!cliente || !cliente.cep) {
            return res.status(400).json({ error: 'Cliente não encontrado ou CEP do cliente não cadastrado para cálculo de frete.' });
        }

        // 3. Preparar dados para o cálculo de frete do Melhor Envio
        // Para simulação, estamos usando dimensões/peso mínimos. Adapte conforme a soma dos produtos.
        const pacote = {
            height: 2, // Altura mínima em cm
            width: 11, // Largura mínima em cm
            length: 16, // Comprimento mínimo em cm
            weight: 0.1, // Peso mínimo em kg
        };

        // Calcule as dimensões e peso totais a partir dos produtos
        let pesoTotal = 0;
        let dimensoes = { altura: 0, largura: 0, comprimento: 0 };
        for (const p of produtosParaSalvar) {
            pesoTotal += p.peso * p.quantidade;
            // Para as dimensões, você pode usar a maior dimensão individual ou tentar somar, dependendo da embalagem.
            // Aqui, um exemplo simples que pega a maior dimensão entre os itens para cada dimensão
            if (p.altura > dimensoes.altura) dimensoes.altura = p.altura;
            if (p.largura > dimensoes.largura) dimensoes.largura = p.largura;
            if (p.comprimento > dimensoes.comprimento) dimensoes.comprimento = p.comprimento;
        }

        // Garante que as dimensões mínimas do Melhor Envio sejam respeitadas
        pacote.height = Math.max(dimensoes.altura, 2);
        pacote.width = Math.max(dimensoes.largura, 11);
        pacote.length = Math.max(dimensoes.comprimento, 16);
        pacote.weight = Math.max(pesoTotal, 0.1); // Peso mínimo de 0.1kg

        const dadosFrete = {
            from: { postal_code: '03472090' }, // Seu CEP de origem (ex: um CEP de SP)
            to: { postal_code: cliente.cep },
            // products: productsForMelhorEnvio, // Opcional: detalhar cada produto para cálculo
            volumes: [pacote],
            options: {
                receipt: false, // Aviso de recebimento
                own_hand: false // Mão própria
            }
        };

        // 4. Chamar a API do Melhor Envio para calcular o frete
        const responseMelhorEnvio = await axios.post(`${MELHOR_ENVIO_URL}/me/shipment/calculate`, dadosFrete, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
                'User-Agent': 'PinkBellaBackend (utilefacil.123@gmail.com)' // Substitua pelo seu email
            }
        });

        // O Melhor Envio pode retornar várias opções de frete, pegamos a primeira
        const freteCalculado = responseMelhorEnvio.data;
        if (!freteCalculado || freteCalculado.length === 0 || freteCalculado[0].error) {
            console.error('Erro no cálculo de frete:', freteCalculado[0]?.error || 'Resposta vazia');
            return res.status(500).json({ error: 'Não foi possível calcular o frete. Verifique o CEP ou as configurações do Melhor Envio.' });
        }

        const valorFrete = freteCalculado[0].price; // Pega o preço da primeira opção de frete
        const nomeServicoFrete = freteCalculado[0].name; // Nome do serviço (ex: PAC, SEDEX)

        totalCompra += parseFloat(valorFrete); // Adiciona o frete ao total

        // 5. Inserir a compra no banco de dados
        const sqlCompra = `INSERT INTO compras (cliente_id, total, frete, produtos, status) VALUES (?, ?, ?, ?, ?)`;
        const produtosJson = JSON.stringify(produtosParaSalvar); // Salva os produtos como JSON

        const compraId = await new Promise((resolve, reject) => {
            db.run(sqlCompra, [cliente_id, totalCompra, valorFrete, produtosJson, 'Pendente'], function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            });
        });

        // 6. Atualizar o estoque dos produtos
        for (const produto of produtosParaAtualizarEstoque) {
            await new Promise((resolve, reject) => {
                db.run('UPDATE produtos SET estoque = ? WHERE id = ?', [produto.novaQuantidadeEstoque, produto.id], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
        }

        res.status(201).json({
            message: 'Compra registrada com sucesso!',
            compraId: compraId,
            total: totalCompra,
            frete: valorFrete,
            servicoFrete: nomeServicoFrete,
            status: 'Pendente'
        });

    } catch (error) {
        console.error('Erro ao registrar compra:', error.message);
        if (error.response) { // Erros da API do Melhor Envio
            console.error('Detalhes do erro Melhor Envio:', error.response.data);
            return res.status(error.response.status).json({ error: 'Erro na integração com Melhor Envio: ' + (error.response.data.message || JSON.stringify(error.response.data)) });
        }
        res.status(500).json({ error: 'Erro interno ao processar a compra.' });
    }
});


module.exports = router;