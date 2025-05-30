const express = require('express');
const router = express.Router();
const db = require('../database');

// 1. POST /clientes - Cadastrar um novo cliente
// Endpoint: http://localhost:3000/clientes
router.post('/', (req, res) => {
    const { nome, cpf_cnpj, cep, endereco } = req.body;

    if (!nome) {
        return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
    }

    const sql = `INSERT INTO clientes (nome, cpf_cnpj, cep, endereco) VALUES (?, ?, ?, ?)`;
    db.run(sql, [nome, cpf_cnpj, cep, endereco], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'CPF/CNPJ já cadastrado.' });
            }
            console.error('Erro ao cadastrar cliente:', err.message);
            return res.status(500).json({ error: 'Erro interno ao cadastrar o cliente.' });
        }
        res.status(201).json({ message: 'Cliente cadastrado com sucesso!', clientId: this.lastID });
    });
});

// 2. GET /clientes - Listar todos os clientes
// Endpoint: http://localhost:3000/clientes
router.get('/', (req, res) => {
    const sql = `SELECT * FROM clientes`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar clientes:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar clientes.' });
        }
        res.json(rows);
    });
});

// 3. GET /clientes/:id - Obter detalhes de um cliente específico por ID
// Endpoint: http://localhost:3000/clientes/:id
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const sql = `SELECT * FROM clientes WHERE id = ?`;
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

// 4. PUT /clientes/:id - Atualizar um cliente existente
// Endpoint: http://localhost:3000/clientes/:id
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { nome, cpf_cnpj, cep, endereco } = req.body;

    if (!nome) {
        return res.status(400).json({ error: 'O nome do cliente é obrigatório para atualização.' });
    }

    const sql = `UPDATE clientes SET nome = ?, cpf_cnpj = ?, cep = ?, endereco = ? WHERE id = ?`;
    db.run(sql, [nome, cpf_cnpj, cep, endereco, id], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'CPF/CNPJ já cadastrado para outro cliente.' });
            }
            console.error('Erro ao atualizar cliente:', err.message);
            return res.status(500).json({ error: 'Erro interno ao atualizar o cliente.' });
        }
        if (this.changes === 0) { // Se 0 linhas foram afetadas, o cliente não foi encontrado ou não houve alteração
            return res.status(404).json({ error: 'Cliente não encontrado ou nenhum dado alterado.' });
        }
        res.json({ message: 'Cliente atualizado com sucesso!' });
    });
});

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
        if (this.changes === 0) { // Se 0 linhas foram afetadas, o cliente não foi encontrado
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        res.json({ message: 'Cliente deletado com sucesso!' });
    });
});

module.exports = router;