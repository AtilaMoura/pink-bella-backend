const express = require('express');
const router = express.Router();
const db = require('../database');
const { lookupAddressByCep } = require('../utils/cepUtils'); // Importa a função de consulta de CEP

// ---

// 1. POST /clientes - Cadastrar um novo cliente
// Endpoint: http://localhost:3000/clientes
router.post('/', async (req, res) => { // Tornando a função 'async' para usar 'await'
    // Removemos 'endereco' do req.body, pois ele não será mais usado
    const { nome, cpf_cnpj, cep } = req.body;

    if (!nome || !cep) {
        return res.status(400).json({ error: 'O nome do cliente e o CEP são obrigatórios.' });
    }

    let logradouro = '';
    let bairro = '';
    let cidade = '';
    let estado = '';
    let cepValidado = cep.replace(/\D/g, ''); // Inicia com o CEP do input, limpo

    try {
        // Tenta consultar o endereço usando a função utilitária
        const dadosEnderecoViaCep = await lookupAddressByCep(cep);

        if (!dadosEnderecoViaCep) {
            console.warn(`Atenção: CEP ${cep} inválido ou não encontrado para o cliente ${nome}. Os campos de endereço serão salvos em branco.`);
            // Se o CEP não for encontrado, os campos de endereço permanecerão em branco
        } else {
            // Se encontrou, preenche as variáveis com os dados do ViaCEP
            logradouro = dadosEnderecoViaCep.logradouro;
            bairro = dadosEnderecoViaCep.bairro;
            cidade = dadosEnderecoViaCep.cidade;
            estado = dadosEnderecoViaCep.estado;
            cepValidado = dadosEnderecoViaCep.cep; // Usa o CEP formatado e validado pelo ViaCEP
        }
    } catch (error) {
        // Captura erros na consulta ao ViaCEP (ex: problema de conexão)
        console.error('Erro ao consultar ViaCEP no cadastro de cliente:', error.message);
        // Os campos de endereço permanecerão em branco neste caso
    }

    // A instrução SQL agora inclui as novas colunas para o endereço
    // Certifique-se que sua tabela 'clientes' no database.sqlite tem as colunas:
    // logradouro TEXT, bairro TEXT, cidade TEXT, estado TEXT
    const sql = `INSERT INTO clientes (nome, cpf_cnpj, cep, logradouro, bairro, cidade, estado) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    try {
        // Envolve db.run em uma Promise para poder usar async/await
        await new Promise((resolve, reject) => {
            db.run(sql,
                [
                    nome,
                    cpf_cnpj,
                    cepValidado, // CEP validado e limpo
                    logradouro,
                    bairro,
                    cidade,
                    estado
                ],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
        res.status(201).json({ message: 'Cliente cadastrado com sucesso!' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'CPF/CNPJ já cadastrado.' });
        }
        console.error('Erro ao cadastrar cliente:', err.message);
        return res.status(500).json({ error: 'Erro interno ao cadastrar o cliente.' });
    }
});

// ---

// 2. GET /clientes - Listar todos os clientes
// Endpoint: http://localhost:3000/clientes
router.get('/', (req, res) => {
    // Seleciona todas as colunas, incluindo as novas de endereço
    const sql = `SELECT id, nome, cpf_cnpj, cep, logradouro, bairro, cidade, estado, criado_em FROM clientes`; // Adicionado 'criado_em' se existir na sua tabela
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar clientes:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar clientes.' });
        }
        res.json(rows);
    });
});

// ---

// 3. GET /clientes/:id - Obter detalhes de um cliente específico por ID
// Endpoint: http://localhost:3000/clientes/:id
router.get('/:id', (req, res) => {
    const { id } = req.params;
    // Seleciona todas as colunas para um cliente específico
    const sql = `SELECT id, nome, cpf_cnpj, cep, logradouro, bairro, cidade, estado, criado_em FROM clientes WHERE id = ?`;
    db.get(sql, [id], (err, row) => {
        if (err) {
            console.error('Erro ao buscar cliente por ID:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar o cliente.' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        res.json(row);
    });
});

// ---

// 4. PUT /clientes/:id - Atualizar um cliente existente
// Endpoint: http://localhost:3000/clientes/:id
router.put('/:id', async (req, res) => { // Tornando a função 'async' para usar 'await'
    const { id } = req.params;
    // Removemos 'endereco' do req.body aqui também
    const { nome, cpf_cnpj, cep } = req.body;

    if (!nome || !cep) {
        return res.status(400).json({ error: 'Nome do cliente e CEP são obrigatórios para atualização.' });
    }

    let logradouro = '';
    let bairro = '';
    let cidade = '';
    let estado = '';
    let cepValidado = cep.replace(/\D/g, '');

    try {
        const dadosEnderecoViaCep = await lookupAddressByCep(cep);

        if (!dadosEnderecoViaCep) {
            console.warn(`Atenção: CEP ${cep} inválido ou não encontrado para o cliente ${nome} (atualização). Os campos de endereço podem não ser atualizados.`);
        } else {
            logradouro = dadosEnderecoViaCep.logradouro;
            bairro = dadosEnderecoViaCep.bairro;
            cidade = dadosEnderecoViaCep.cidade;
            estado = dadosEnderecoViaCep.estado;
            cepValidado = dadosEnderecoViaCep.cep;
        }
    } catch (error) {
        console.error('Erro ao consultar ViaCEP na atualização de cliente:', error.message);
    }

    // A instrução SQL de atualização agora inclui as novas colunas
    const sql = `UPDATE clientes SET nome = ?, cpf_cnpj = ?, cep = ?, logradouro = ?, bairro = ?, cidade = ?, estado = ? WHERE id = ?`;

    try {
        await new Promise((resolve, reject) => {
            db.run(sql,
                [
                    nome,
                    cpf_cnpj,
                    cepValidado,
                    logradouro,
                    bairro,
                    cidade,
                    estado,
                    id
                ],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });

        res.json({ message: 'Cliente atualizado com sucesso!' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'CPF/CNPJ já cadastrado para outro cliente.' });
        }
        console.error('Erro ao atualizar cliente:', err.message);
        return res.status(500).json({ error: 'Erro interno ao atualizar o cliente.' });
    }
});

// ---

// 5. DELETE /clientes/:id - Deletar um cliente
// Endpoint: http://localhost:3000/clientes/:id
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM clientes WHERE id = ?`;
    db.run(sql, [id], function(err) {
        if (err) {
            console.error('Erro ao deletar cliente:', err.message);
            return res.status(500).json({ error: 'Erro interno ao deletar o cliente.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        res.json({ message: 'Cliente deletado com sucesso!' });
    });
});

module.exports = router;