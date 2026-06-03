const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const { uploadImagem, deletarImagem } = require('../utils/supabaseStorage');

// Multer usa memória — imagem vai para o Supabase, não para o disco
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 1. POST /produtos - Cadastrar um novo produto (com upload de imagem)
router.post('/', upload.single('imagemProduto'), async (req, res) => {
    const { nome, preco, peso, altura, largura, comprimento, estoque } = req.body;

    if (!nome || !preco || !estoque) {
        return res.status(400).json({ error: 'Nome, preço e estoque são campos obrigatórios.' });
    }

    let imagem = null;
    if (req.file) {
        try {
            const ext = path.extname(req.file.originalname) || '.jpg';
            const nomeArquivo = `produto-${Date.now()}${ext}`;
            imagem = await uploadImagem(req.file.buffer, req.file.mimetype, nomeArquivo);
        } catch (err) {
            console.error('Erro no upload da imagem:', err.message);
            return res.status(500).json({ error: 'Erro ao fazer upload da imagem.' });
        }
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

// 2. GET /produtos - Listar todos os produtos (apenas ativos)
router.get('/', (req, res) => {
    const sql = `SELECT * FROM produtos WHERE ativo = 1`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar produtos:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar produtos.' });
        }
        res.json(rows);
    });
});

// 3. GET /produtos/:id - Obter detalhes de um produto específico por ID
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const sql = `SELECT * FROM produtos WHERE id = ? AND ativo = 1`;
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
router.put('/:id', upload.single('imagemProduto'), async (req, res) => {
    const { id } = req.params;
    const { nome, preco, peso, altura, largura, comprimento, estoque } = req.body;

    if (!nome || !preco || !estoque) {
        return res.status(400).json({ error: 'Nome, preço e estoque são campos obrigatórios para atualização.' });
    }

    let imagem = req.body.imagem || null;
    if (req.file) {
        try {
            // Apaga imagem antiga se estava no Supabase
            if (imagem && imagem.includes('supabase')) await deletarImagem(imagem);
            const ext = path.extname(req.file.originalname) || '.jpg';
            const nomeArquivo = `produto-${Date.now()}${ext}`;
            imagem = await uploadImagem(req.file.buffer, req.file.mimetype, nomeArquivo);
        } catch (err) {
            console.error('Erro no upload da imagem:', err.message);
            return res.status(500).json({ error: 'Erro ao fazer upload da imagem.' });
        }
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

// 5. DELETE /produtos/:id - Soft delete (marca como inativo)
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const sql = `UPDATE produtos SET ativo = 0 WHERE id = ? AND ativo = 1`;
    db.run(sql, [id], function(err) {
        if (err) {
            console.error('Erro ao desativar produto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao desativar o produto.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }
        res.json({ message: 'Produto removido com sucesso!' });
    });
});

module.exports = router; // Exporta o roteador