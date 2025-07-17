    const express = require('express');
    const router = express.Router();
    const db = require('../database');
    const { calcularFrete } = require('../services/melhorEnvioService'); // Para calcular o frete
    const melhorEnvioService = require('../services/melhorEnvioService');
    const { getFormattedCompraDetails } = require('../utils/formatadores')
    const comprasService = require('../services/comprasService'); // Certifique-se de importar

  
router.get('/', async (req, res) => {
    try {
        const todasCompras = await comprasService.getAllComprasFormatted();
        res.json(todasCompras);
    } catch (error) {
        console.error('Erro ao buscar todas as compras:', error.message);
        res.status(500).json({ error: 'Erro ao buscar a lista de compras.' });
    }
});

    router.post('/', async (req, res) => {
        const { cliente_id, endereco_entrega_id, itens } = req.body;

        // --- 1. Validação dos Dados de Entrada ---
        if (!cliente_id || !itens || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({ error: 'ID do cliente e uma lista de itens são obrigatórios.' });
        }

        for (const item of itens) {
            if (typeof item.produto_id !== 'number' || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
                return res.status(400).json({ error: 'Cada item deve ter produto_id e uma quantidade válida.' });
            }
        }

        let cliente;
        let enderecoEntrega;
        let quantidadeTotalDeItens = 0;
        let produtosCompradosDetalhes = [];
        let pacoteFinalCalculado = null; // Para armazenar o pacote final retornado do cálculo do frete

        try {
            // --- 2. Buscar Informações do Cliente ---
            cliente = await new Promise((resolve, reject) => {
                db.get('SELECT id, endereco_principal_id FROM clientes WHERE id = ?', [cliente_id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });

            if (!cliente) {
                return res.status(404).json({ error: 'Cliente não encontrado.' });
            }

            // --- 3. Determinar e Buscar Detalhes do Endereço de Entrega ---
            let idDoEnderecoParaEntrega = endereco_entrega_id;

            if (!idDoEnderecoParaEntrega) {
                if (!cliente.endereco_principal_id) {
                    return res.status(400).json({ error: 'Nenhum endereço de entrega fornecido e o cliente não possui um endereço principal cadastrado.' });
                }
                idDoEnderecoParaEntrega = cliente.endereco_principal_id;
            }

            enderecoEntrega = await new Promise((resolve, reject) => {
                db.get('SELECT id, cep, logradouro, numero, bairro, cidade, estado, complemento FROM enderecos WHERE id = ? AND cliente_id = ?', // Adicionei complemento
                    [idDoEnderecoParaEntrega, cliente_id],
                    (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
            });

            if (!enderecoEntrega) {
                return res.status(404).json({ error: `Endereço de entrega (ID ${idDoEnderecoParaEntrega}) não encontrado ou não pertence a este cliente.` });
            }

            // --- 4. Buscar Detalhes dos Produtos e Verificar Estoque ---
            // Usando Promise.all para buscar produtos em paralelo
            const produtosPromises = itens.map(item => {
                return new Promise((resolve, reject) => {
                    db.get('SELECT id, nome, preco, estoque FROM produtos WHERE id = ?', [item.produto_id], (err, row) => {
                        if (err) return reject(err);
                        if (!row) {
                            return reject(new Error(`Produto com ID ${item.produto_id} não encontrado.`));
                        }
                        // **CORREÇÃO AQUI:** Verificação de estoque com a coluna correta 'estoque'
                        if (row.estoque < item.quantidade) {
                            return reject(new Error(`Estoque insuficiente para o produto: ${row.nome}. Disponível: ${row.estoque}, Solicitado: ${item.quantidade}.`));
                        }
                        quantidadeTotalDeItens += item.quantidade; // Soma a quantidade para o cálculo do frete
                        resolve({ ...row, quantidade_comprada: item.quantidade });
                    });
                });
            });

            produtosCompradosDetalhes = await Promise.all(produtosPromises);

            // --- 5. Calcular e Selecionar o Frete Mais Barato ---
            // **CORREÇÃO AQUI:** Desestruturando o retorno de calcularFrete
            const opcoesFrete = await calcularFrete(enderecoEntrega.cep, quantidadeTotalDeItens);

            if (!opcoesFrete || opcoesFrete.length === 0) {
                return res.status(400).json({ error: 'Não foi possível calcular o frete para este destino com os produtos selecionados.' });
            }

            // Automaticamente seleciona a opção mais barata
            const freteEscolhido = opcoesFrete.sort((a, b) => a.price - b.price)[0];

            const pacoteFinalParaDb = freteEscolhido.pacote_utilizado;
            if (!pacoteFinalParaDb) {
                console.error('Erro: Dados do pacote final não encontrados na opção de frete escolhida.');
                return res.status(500).json({ error: 'Erro interno ao processar detalhes do frete.' });
            }

            if (!freteEscolhido) {
                return res.status(500).json({ error: 'Erro ao selecionar a melhor opção de frete.' });
            }

            // Calculando o valor total dos produtos
            let valorTotalProdutos = produtosCompradosDetalhes.reduce((acc, prod) => acc + (prod.preco * prod.quantidade_comprada), 0);
            let valorTotalCompra = valorTotalProdutos + parseFloat(freteEscolhido.price);

            // --- 6. Iniciar uma Transação no DB (Salvar Compra, Itens, Baixa Estoque) ---
            // db.serialize não é estritamente necessário aqui se todas as operações usam await Promise,
            // mas pode ser mantido para garantir a ordem sequencial de outras operações no futuro.
            // O importante é o BEGIN TRANSACTION e o COMMIT/ROLLBACK.
            db.run('BEGIN TRANSACTION;', async function(err) {
                if (err) {
                    console.error('Erro ao iniciar transação de compra:', err.message);
                    return res.status(500).json({ error: 'Erro interno ao iniciar a transação de compra.' });
                }

                try {
                    // --- 7. Salvar a compra na tabela 'compras' ---
                    const resultCompra = await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO compras (
                                cliente_id,
                                endereco_entrega_id,
                                valor_total,
                                valor_produtos,
                                status_compra,
                                valor_frete,
                                transportadora,
                                servico_frete,
                                prazo_frete_dias,
                                melhor_envio_service_id,
                                peso_pacote,
                                altura_pacote,
                                largura_pacote,
                                comprimento_pacote
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                cliente_id,
                                enderecoEntrega.id,
                                valorTotalCompra,
                                valorTotalProdutos,
                                'Pendente',
                                parseFloat(freteEscolhido.price),
                                freteEscolhido.company.name,
                                freteEscolhido.name,
                                parseInt(freteEscolhido.delivery_time),
                                freteEscolhido.id, 
                                pacoteFinalParaDb.weight,
                                pacoteFinalParaDb.height,
                                pacoteFinalParaDb.width,
                                pacoteFinalParaDb.length
                            ],
                            function(err) {
                                if (err) return reject(err);
                                resolve(this.lastID);
                            }
                        );
                    });

                    const compraId = resultCompra;
                    if (!compraId) {
                        throw new Error('Não foi possível obter o ID da compra inserida.');
                    }

                    // --- 8. Salvar cada item na tabela 'itens_compra' e Dar baixa no estoque ---
                    for (const item of produtosCompradosDetalhes) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO itens_compra (compra_id, produto_id, quantidade, preco_unitario_no_momento_da_compra)
                                VALUES (?, ?, ?, ?)`,
                                [
                                    compraId,
                                    item.id,
                                    item.quantidade_comprada,
                                    item.preco
                                ],
                                function(err) {
                                    if (err) return reject(err);
                                    resolve();
                                }
                            );
                        });

                        await new Promise((resolve, reject) => {
                            db.run(
                                `UPDATE produtos SET estoque = estoque - ? WHERE id = ?`,
                                [item.quantidade_comprada, item.id],
                                function(err) {
                                    if (err) return reject(err);
                                    if (this.changes === 0) {
                                        return reject(new Error(`Falha ao dar baixa no estoque do produto ID ${item.id}. Nenhuma linha afetada.`));
                                    }
                                    resolve();
                                }
                            );
                        });
                    }

                    // --- 9. Finalizar a transação (COMMIT) ---
                    db.run('COMMIT;', async function(err) {
                        if (err) {
                            console.error('Erro ao fazer commit da compra:', err.message);
                            return res.status(500).json({ error: 'Erro interno ao finalizar a compra.' });
                        }

                        // --- NOVO BLOCO: Buscar e formatar os detalhes completos da compra recém-criada ---
                        try {
                            const compraFormatadaParaRetorno = await getFormattedCompraDetails(db, compraId);

                            if (!compraFormatadaParaRetorno) {
                                console.error('Erro: Compra recém-criada não encontrada ao tentar formatar detalhes.');
                                return res.status(500).json({ error: 'Compra registrada, mas não foi possível recuperar seus detalhes.' });
                            }

                            res.status(201).json(compraFormatadaParaRetorno);

                        } catch (error) {
                            console.error('Erro ao buscar detalhes da compra após o registro:', error.message);
                            res.status(500).json({ error: `Compra registrada, mas houve um erro ao buscar seus detalhes: ${error.message}` });
                        }
                    });

                } catch (innerError) {
                    console.error('Erro durante a transação da compra:', innerError.message);
                    db.run('ROLLBACK;', function(rollbackErr) {
                        if (rollbackErr) {
                            console.error('Erro ao fazer rollback da compra:', rollbackErr.message);
                        }
                        res.status(500).json({ error: `Erro ao registrar a compra: ${innerError.message}. Transação revertida.` });
                    });
                }
            });

        } catch (error) {
            console.error('Erro no processamento inicial da compra:', error.message);
            res.status(500).json({ error: error.message || 'Erro ao processar a compra.' });
        }
    });

    router.get('/:id', async (req, res) => {
        const { id } = req.params;

        try {
            const compraFormatada = await getFormattedCompraDetails(db, id);

            if (!compraFormatada) {
                return res.status(404).json({ error: 'Compra não encontrada.' });
            }

            res.json(compraFormatada);

        } catch (error) {
            console.error(`Erro ao buscar detalhes da compra ${id}:`, error.message);
            res.status(500).json({ error: 'Erro ao buscar detalhes da compra.' });
        }
    });

    router.put('/:id/status', async (req, res) => {
        const compraId = req.params.id;
        const { status } = req.body;

        console.log('entrei no /:id/status!')

        try {
            //const pedidoAtualizado = await updateOrderStatus(compraId, status); verificarStatusCompra
            const pedidoAtualizado = await melhorEnvioService.verificarStatusCompra(compraId, status);
            res.json(pedidoAtualizado);

        } catch (error) {
            console.error('Erro ao atualizar status da compra:', error.message);
            res.status(500).json({ error: 'Erro interno do servidor ao atualizar o status.' });
        }
    });

    

    module.exports = router;