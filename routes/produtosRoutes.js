const express = require('express');
const router = express.Router(); // Cria um roteador Express
const multer = require('multer');
const path = require('path');
const db = require('../database'); // Importa a conexão com o banco de dados

// --- Configuração do Multer (repetida aqui para modularidade, mas idealmente seria um middleware separado) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
// --- Fim da configuração do Multer ---


// 1. POST /produtos - Cadastrar um novo produto (com upload de imagem)
router.post('/', upload.single('imagemProduto'), (req, res) => { // Repare que a rota é só '/' aqui
    const { nome, preco, peso, altura, largura, comprimento, estoque } = req.body;
    const imagem = req.file ? `/uploads/${req.file.filename}` : null;

    if (!nome || !preco || !estoque) {
        return res.status(400).json({ error: 'Nome, preço e estoque são campos obrigatórios.' });
    }

    const sql = `INSERT INTO produtos (nome, preco, peso, altura, largura, comprimento, estoque, imagem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [nome, preco, peso, altura, largura, comprimento, estoque, imagem], function(err) {
        if (err) {
            console.error('Erro ao cadastrar produto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao cadastrar o produto.' });
        }
        res.status(201).json({ message: 'Produto cadastrado com sucesso!', productId: this.lastID, imagemPath: imagem });
    });
});

// 2. GET /produtos - Listar todos os produtos
router.get('/', (req, res) => { // Repare que a rota é só '/' aqui
    const sql = `SELECT * FROM produtos`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar produtos:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar produtos.' });
        }
        res.json(rows);
    });
});

// 3. GET /produtos/:id - Obter detalhes de um produto específico por ID
router.get('/:id', (req, res) => { // Repare que a rota é só '/:id' aqui
    const { id } = req.params;
    const sql = `SELECT * FROM produtos WHERE id = ?`;
    db.get(sql, [id], (err, row) => {
        if (err) {
            console.error('Erro ao buscar produto por ID:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar o produto.' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }
        res.json(row);
    });
});

// 4. PUT /produtos/:id - Atualizar um produto existente (com ou sem nova imagem)
router.put('/:id', upload.single('imagemProduto'), (req, res) => { // Repare que a rota é só '/:id' aqui
    const { id } = req.params;
    const { nome, preco, peso, altura, largura, comprimento, estoque } = req.body;
    let imagem = req.file ? `/uploads/${req.file.filename}` : req.body.imagem;

    if (!nome || !preco || !estoque) {
        return res.status(400).json({ error: 'Nome, preço e estoque são campos obrigatórios para atualização.' });
    }

    const sql = `UPDATE produtos SET nome = ?, preco = ?, peso = ?, altura = ?, largura = ?, comprimento = ?, estoque = ?, imagem = ? WHERE id = ?`;
    db.run(sql, [nome, preco, peso, altura, largura, comprimento, estoque, imagem, id], function(err) {
        if (err) {
            console.error('Erro ao atualizar produto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao atualizar o produto.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Produto não encontrado ou nenhum dado alterado.' });
        }
        res.json({ message: 'Produto atualizado com sucesso!' });
    });
});

// 5. DELETE /produtos/:id - Deletar um produto
router.delete('/:id', (req, res) => { // Repare que a rota é só '/:id' aqui
    const { id } = req.params;
    const sql = `DELETE FROM produtos WHERE id = ?`;
    db.run(sql, [id], function(err) {
        if (err) {
            console.error('Erro ao deletar produto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao deletar o produto.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }
        res.json({ message: 'Produto deletado com sucesso!' });
    });
});

module.exports = router; // Exporta o roteador