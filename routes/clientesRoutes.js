const express = require('express');
const router = express.Router();
const db = require('../database');
const { lookupAddressByCep } = require('../utils/cepUtils'); // Importa a função de consulta de CEP

// ---

// 1. POST /clientes - Cadastrar um novo cliente
// Endpoint: http://localhost:3000/clientes
router.post('/', async (req, res) => {
    const { nome, email, telefone, cpf, endereco } = req.body;

    // --- 1. Validação Inicial dos Dados ---
    if (!nome || !email || !endereco || !endereco.cep || !endereco.numero) {
        return res.status(400).json({ error: 'Nome, email, CEP e número do endereço são obrigatórios.' });
    }

    // Validação básica de email e CPF (melhorar com regex em produção)
    if (!email.includes('@') || !email.includes('.')) {
        return res.status(400).json({ error: 'Formato de e-mail inválido.' });
    }

    // --- 2. Buscar/Validar Endereço via CEPUtils ---
    let dadosEnderecoCompletos;
    try {
        dadosEnderecoCompletos = await lookupAddressByCep(endereco.cep);
        if (!dadosEnderecoCompletos) {
            return res.status(400).json({ error: 'CEP não encontrado ou inválido. Por favor, verifique o CEP.' });
        }
    } catch (error) {
        console.error('Erro ao consultar CEP:', error.message);
        return res.status(500).json({ error: 'Erro ao validar o CEP. Tente novamente mais tarde.' });
    }

    // Adicionar os dados fornecidos pelo usuário aos dados completos do CEP
    const enderecoCompletoParaDB = {
        ...dadosEnderecoCompletos, // logradouro, bairro, cidade, estado
        numero: endereco.numero,
        complemento: endereco.complemento || null,
        referencia: endereco.referencia || null,
        tipo_endereco: endereco.tipo_endereco || 'Residencial',
        is_principal: endereco.is_principal !== undefined ? endereco.is_principal : true // Padrão é principal
    };

    // --- 3. Iniciar Transação DB para Cadastro de Cliente e Endereço ---
    db.serialize(() => {
        db.run('BEGIN TRANSACTION;', async function(err) {
            if (err) {
                console.error('Erro ao iniciar transação:', err.message);
                return res.status(500).json({ error: 'Erro interno ao iniciar a transação.' });
            }

            try {
                // --- 4. Inserir Cliente ---
                const clienteId = await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO clientes (nome, email, telefone, cpf, data_cadastro)
                         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [nome, email, telefone || null, cpf || null],
                        function(err) {
                            if (err) {
                                // Se for erro de UNIQUE constraint (email/cpf já existem)
                                if (err.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
                                    if (err.message.includes('email')) {
                                        return reject(new Error('Este e-mail já está cadastrado.'));
                                    }
                                    if (err.message.includes('cpf')) {
                                        return reject(new Error('Este CPF já está cadastrado.'));
                                    }
                                }
                                return reject(err);
                            }
                            resolve(this.lastID); // ID do cliente recém-criado
                        }
                    );
                });

                if (!clienteId) {
                    throw new Error('Não foi possível obter o ID do cliente inserido.');
                }

                // --- 5. Inserir Endereço Principal na Tabela 'enderecos' ---
                const enderecoId = await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO enderecos (
                            cliente_id, cep, logradouro, numero, complemento,
                            bairro, cidade, estado, referencia, tipo_endereco, is_principal
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            clienteId,
                            enderecoCompletoParaDB.cep,
                            enderecoCompletoParaDB.logradouro,
                            enderecoCompletoParaDB.numero,
                            enderecoCompletoParaDB.complemento,
                            enderecoCompletoParaDB.bairro,
                            enderecoCompletoParaDB.cidade,
                            enderecoCompletoParaDB.estado,
                            enderecoCompletoParaDB.referencia,
                            enderecoCompletoParaDB.tipo_endereco,
                            enderecoCompletoParaDB.is_principal ? 1 : 0 // SQLite 0 para false, 1 para true
                        ],
                        function(err) {
                            if (err) return reject(err);
                            resolve(this.lastID); // ID do endereço recém-criado
                        }
                    );
                });

                if (!enderecoId) {
                    throw new Error('Não foi possível obter o ID do endereço inserido.');
                }

                // --- 6. Atualizar 'endereco_principal_id' na Tabela 'clientes' ---
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE clientes SET endereco_principal_id = ? WHERE id = ?`,
                        [enderecoId, clienteId],
                        function(err) {
                            if (err) return reject(err);
                            if (this.changes === 0) { // Se nenhuma linha foi afetada, algo deu errado
                                return reject(new Error(`Falha ao vincular endereço ${enderecoId} ao cliente ${clienteId}.`));
                            }
                            resolve();
                        }
                    );
                });

                // --- 7. Commit da Transação ---
                db.run('COMMIT;', function(err) {
                    if (err) {
                        console.error('Erro ao fazer commit:', err.message);
                        return res.status(500).json({ error: 'Erro interno ao finalizar o cadastro do cliente.' });
                    }
                    res.status(201).json({
                        message: 'Cliente e endereço cadastrados com sucesso!',
                        cliente_id: clienteId,
                        endereco_id: enderecoId,
                        nome: nome,
                        email: email,
                        endereco_principal: {
                            ...enderecoCompletoParaDB,
                            id: enderecoId // Incluir o ID do endereço na resposta
                        }
                    });
                });

            } catch (innerError) {
                // --- Em caso de qualquer erro, faz Rollback da Transação ---
                console.error('Erro durante a transação de cadastro de cliente:', innerError.message);
                db.run('ROLLBACK;', function(rollbackErr) {
                    if (rollbackErr) {
                        console.error('Erro ao fazer rollback:', rollbackErr.message);
                    }
                    res.status(500).json({ error: `Erro ao cadastrar cliente: ${innerError.message}. Transação revertida.` });
                });
            }
        });
    });
});


// ---

// 2. GET /clientes/:id - Obter detalhes de um cliente específico por ID
// Endpoint: http://localhost:3000/clientes/:id

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Consulta SQL usando JOIN para obter dados do cliente e seu endereço principal
        const cliente = await new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    c.id AS cliente_id,
                    c.nome,
                    c.email,
                    c.telefone,
                    c.cpf,
                    c.data_cadastro,
                    c.ativo,
                    e.id AS endereco_id,
                    e.cep,
                    e.logradouro,
                    e.numero,
                    e.complemento,
                    e.bairro,
                    e.cidade,
                    e.estado,
                    e.referencia,
                    e.tipo_endereco,
                    e.is_principal
                FROM clientes c
                LEFT JOIN enderecos e ON c.endereco_principal_id = e.id
                WHERE c.id = ?`,
                [id],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                }
            );
        });

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        // Formata a resposta para agrupar o endereço
        const clienteFormatado = {
            id: cliente.cliente_id,
            nome: cliente.nome,
            email: cliente.email,
            telefone: cliente.telefone,
            cpf: cliente.cpf,
            data_cadastro: cliente.data_cadastro,
            endereco_principal: cliente.endereco_id ? { // Só inclui o objeto endereço se houver um ID
                id: cliente.endereco_id,
                cep: cliente.cep,
                logradouro: cliente.logradouro,
                numero: cliente.numero,
                complemento: cliente.complemento,
                bairro: cliente.bairro,
                cidade: cliente.cidade,
                estado: cliente.estado,
                referencia: cliente.referencia,
                tipo_endereco: cliente.tipo_endereco,
                is_principal: Boolean(cliente.is_principal) // Converte 0/1 para boolean
            } : null
        };

        res.json(clienteFormatado);

    } catch (error) {
        console.error('Erro ao buscar cliente:', error.message);
        res.status(500).json({ error: 'Erro ao buscar cliente.' });
    }
});

// ---

// 3. GET /clientes - Listar todos os clientes
// Endpoint: http://localhost:3000/clientes
router.get('/', async (req, res) => {
    try {
        const clientes = await new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    c.id AS cliente_id,
                    c.nome,
                    c.email,
                    c.telefone,
                    c.cpf,
                    c.data_cadastro,
                    c.ativo,
                    e.id AS endereco_id,
                    e.cep,
                    e.logradouro,
                    e.numero,
                    e.complemento,
                    e.bairro,
                    e.cidade,
                    e.estado,
                    e.referencia,
                    e.tipo_endereco,
                    e.is_principal
                FROM clientes c
                LEFT JOIN enderecos e ON c.endereco_principal_id = e.id
                ORDER BY c.nome ASC`, // Ordena por nome do cliente
                [],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });

        // Formata a resposta para agrupar o endereço
        const clientesFormatados = clientes.map(cliente => ({
            id: cliente.cliente_id,
            nome: cliente.nome,
            email: cliente.email,
            telefone: cliente.telefone,
            cpf: cliente.cpf,
            data_cadastro: cliente.data_cadastro,
            endereco_principal: cliente.endereco_id ? { // Só inclui o objeto endereço se houver um ID
                id: cliente.endereco_id,
                cep: cliente.cep,
                logradouro: cliente.logradouro,
                numero: cliente.numero,
                complemento: cliente.complemento,
                bairro: cliente.bairro,
                cidade: cliente.cidade,
                estado: cliente.estado,
                referencia: cliente.referencia,
                tipo_endereco: cliente.tipo_endereco,
                is_principal: Boolean(cliente.is_principal) // Converte 0/1 para boolean
            } : null
        }));

        res.json(clientesFormatados);

    } catch (error) {
        console.error('Erro ao listar clientes:', error.message);
        res.status(500).json({ error: 'Erro ao listar clientes.' });
    }
});

// ---

// 4. PUT /clientes/:id - Atualizar um cliente existente
// Endpoint: http://localhost:3000/clientes/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, telefone, cpf, endereco } = req.body;

    // --- 1. Validação dos Dados ---
    if (!nome && !email && !telefone && !cpf && !endereco) {
        return res.status(400).json({ error: 'Nenhum dado para atualizar fornecido.' });
    }
    if (email && (!email.includes('@') || !email.includes('.'))) {
        return res.status(400).json({ error: 'Formato de e-mail inválido.' });
    }
    if (endereco && (!endereco.cep || !endereco.numero)) {
        return res.status(400).json({ error: 'CEP e número do endereço são obrigatórios para atualizar o endereço.' });
    }
    

    let dadosEnderecoCompletos = null;
    if (endereco && endereco.cep) {
        try {
            dadosEnderecoCompletos = await lookupAddressByCep(endereco.cep);
            if (!dadosEnderecoCompletos) {
                return res.status(400).json({ error: 'CEP do endereço para atualização não encontrado ou inválido.' });
            }
        } catch (error) {
            console.error('Erro ao consultar CEP para atualização:', error.message);
            return res.status(500).json({ error: 'Erro ao validar o CEP para atualização. Tente novamente mais tarde.' });
        }
    }

    // --- 2. Iniciar Transação DB ---
    db.serialize(() => {
        db.run('BEGIN TRANSACTION;', async function(err) {
            if (err) {
                console.error('Erro ao iniciar transação PUT:', err.message);
                return res.status(500).json({ error: 'Erro interno ao iniciar a transação de atualização.' });
            }

            try {
                // --- 3. Atualizar Dados do Cliente (se fornecidos) ---
                const updatesCliente = [];
                const paramsCliente = [];
                if (nome) { updatesCliente.push('nome = ?'); paramsCliente.push(nome); }
                if (email) { updatesCliente.push('email = ?'); paramsCliente.push(email); }
                if (telefone !== undefined) { updatesCliente.push('telefone = ?'); paramsCliente.push(telefone || null); } // Permite limpar
                if (cpf !== undefined) { updatesCliente.push('cpf = ?'); paramsCliente.push(cpf || null); } // Permite limpar
                

                if (updatesCliente.length > 0) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE clientes SET ${updatesCliente.join(', ')} WHERE id = ?`,
                            [...paramsCliente, id],
                            function(err) {
                                if (err) {
                                    if (err.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
                                        if (err.message.includes('email')) {
                                            return reject(new Error('Este e-mail já está cadastrado para outro cliente.'));
                                        }
                                        if (err.message.includes('cpf')) {
                                            return reject(new Error('Este CPF já está cadastrado para outro cliente.'));
                                        }
                                    }
                                    return reject(err);
                                }
                                if (this.changes === 0) {
                                    // Não retorna 404 aqui, pois pode ser que apenas o endereço esteja sendo atualizado,
                                    // ou que o cliente não exista, mas o erro será pego na atualização do endereço.
                                }
                                resolve();
                            }
                        );
                    });
                }

                // --- 4. Atualizar Endereço Principal (se fornecido) ---
                if (endereco && dadosEnderecoCompletos) {
                    const clienteExistente = await new Promise((resolve, reject) => {
                        db.get('SELECT endereco_principal_id FROM clientes WHERE id = ?', [id], (err, row) => {
                            if (err) return reject(err);
                            resolve(row);
                        });
                    });

                    if (!clienteExistente) {
                        throw new Error('Cliente não encontrado para atualização de endereço.');
                    }

                    if (!clienteExistente.endereco_principal_id) {
                        // Se o cliente não tem endereço principal cadastrado (caso raro, mas possível)
                        // Insere um novo endereço e o vincula como principal
                        const novoEnderecoId = await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO enderecos (
                                    cliente_id, cep, logradouro, numero, complemento,
                                    bairro, cidade, estado, referencia, tipo_endereco, is_principal
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    id, // Cliente ID
                                    dadosEnderecoCompletos.cep,
                                    dadosEnderecoCompletos.logradouro,
                                    endereco.numero,
                                    endereco.complemento || null,
                                    dadosEnderecoCompletos.bairro,
                                    dadosEnderecoCompletos.cidade,
                                    dadosEnderecoCompletos.estado,
                                    endereco.referencia || null,
                                    endereco.tipo_endereco || 'Residencial',
                                    true // Definindo como principal
                                ],
                                function(err) {
                                    if (err) return reject(err);
                                    resolve(this.lastID);
                                }
                            );
                        });
                        // Atualiza o cliente para apontar para o novo endereço principal
                        await new Promise((resolve, reject) => {
                            db.run(`UPDATE clientes SET endereco_principal_id = ? WHERE id = ?`, [novoEnderecoId, id], function(err) {
                                if (err) return reject(err);
                                resolve();
                            });
                        });
                    } else {
                        // Atualiza o endereço existente
                        await new Promise((resolve, reject) => {
                            db.run(
                                `UPDATE enderecos SET
                                    cep = ?, logradouro = ?, numero = ?, complemento = ?,
                                    bairro = ?, cidade = ?, estado = ?, referencia = ?, tipo_endereco = ?, is_principal = ?
                                WHERE id = ? AND cliente_id = ?`, // Garante que atualiza o endereço do cliente correto
                                [
                                    dadosEnderecoCompletos.cep,
                                    dadosEnderecoCompletos.logradouro,
                                    endereco.numero,
                                    endereco.complemento || null,
                                    dadosEnderecoCompletos.bairro,
                                    dadosEnderecoCompletos.cidade,
                                    dadosEnderecoCompletos.estado,
                                    endereco.referencia || null,
                                    endereco.tipo_endereco || 'Residencial',
                                    endereco.is_principal !== undefined ? (endereco.is_principal ? 1 : 0) : 1, // Se não especificado, mantém como principal
                                    clienteExistente.endereco_principal_id,
                                    id
                                ],
                                function(err) {
                                    if (err) return reject(err);
                                    if (this.changes === 0) {
                                        return reject(new Error(`Falha ao atualizar endereço ID ${clienteExistente.endereco_principal_id}. Nenhuma linha afetada.`));
                                    }
                                    resolve();
                                }
                            );
                        });
                    }
                }

                // --- 5. Commit da Transação ---
                db.run('COMMIT;', function(err) {
                    if (err) {
                        console.error('Erro ao fazer commit PUT:', err.message);
                        return res.status(500).json({ error: 'Erro interno ao finalizar a atualização do cliente.' });
                    }
                    res.json({ message: 'Cliente e/ou endereço atualizados com sucesso!' });
                });

            } catch (innerError) {
                // --- Em caso de qualquer erro, faz Rollback ---
                console.error('Erro durante a transação de atualização de cliente:', innerError.message);
                db.run('ROLLBACK;', function(rollbackErr) {
                    if (rollbackErr) {
                        console.error('Erro ao fazer rollback PUT:', rollbackErr.message);
                    }
                    res.status(500).json({ error: `Erro ao atualizar cliente: ${innerError.message}. Transação revertida.` });
                });
            }
        });
    });
});

// ---

// 5. DELETE /clientes/:id - Deletar um cliente
// Endpoint: http://localhost:3000/clientes/:id
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;', async function(err) {
            if (err) {
                console.error('Erro ao iniciar transação de desativação:', err.message);
                return res.status(500).json({ error: 'Erro interno ao iniciar a transação.' });
            }

            try {
                // Primeiro, verificar se o cliente existe e já não está inativo
                const clienteExistente = await new Promise((resolve, reject) => {
                    db.get('SELECT id, ativo FROM clientes WHERE id = ?', [id], (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
                });

                if (!clienteExistente) {
                    db.run('ROLLBACK;');
                    return res.status(404).json({ error: 'Cliente não encontrado.' });
                }

                if (clienteExistente.ativo === 0) {
                    db.run('ROLLBACK;');
                    return res.status(409).json({ error: 'Cliente já está inativo.' }); // 409 Conflict
                }

                // Desativar o cliente (mudar 'ativo' para 0)
                await new Promise((resolve, reject) => {
                    db.run('UPDATE clientes SET ativo = 0 WHERE id = ?', [id], function(err) {
                        if (err) return reject(err);
                        if (this.changes === 0) {
                            return reject(new Error('Nenhuma linha afetada ao desativar cliente.'));
                        }
                        resolve();
                    });
                });

                // Commit da transação
                db.run('COMMIT;', function(err) {
                    if (err) {
                        console.error('Erro ao fazer commit da desativação:', err.message);
                        return res.status(500).json({ error: 'Erro interno ao finalizar a desativação do cliente.' });
                    }
                    res.status(200).json({ message: 'Cliente desativado com sucesso.' });
                });

            } catch (innerError) {
                console.error('Erro durante a transação de desativação de cliente:', innerError.message);
                db.run('ROLLBACK;', function(rollbackErr) {
                    if (rollbackErr) {
                        console.error('Erro ao fazer rollback da desativação:', rollbackErr.message);
                    }
                    res.status(500).json({ error: `Erro ao desativar cliente: ${innerError.message}. Transação revertida.` });
                });
            }
        });
    });
});


module.exports = router;