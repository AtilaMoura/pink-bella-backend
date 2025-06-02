// Exemplo em um novo arquivo: pink-bella/backend/routes/addressRoutes.js

const express = require('express');
const router = express.Router();
const axios = require('axios'); // Para fazer requisições HTTP para o ViaCEP

// GET /endereco/:cep - Retorna detalhes do endereço para um CEP
// Endpoint: http://localhost:3000/endereco/01001000
router.get('/:cep', async (req, res) => {
    const cep = req.params.cep.replace(/\D/g, ''); // Remove caracteres não numéricos

    if (cep.length !== 8) {
        return res.status(400).json({ error: 'CEP inválido. Deve conter 8 dígitos.' });
    }

    try {
        const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
        const dadosEndereco = response.data;

        if (dadosEndereco.erro) {
            return res.status(404).json({ error: 'CEP não encontrado.' });
        }

        // Retorna apenas as informações que você precisa, incluindo o nome da rua
        res.json({
            cep: dadosEndereco.cep,
            logradouro: dadosEndereco.logradouro, // Nome da rua
            bairro: dadosEndereco.bairro,
            cidade: dadosEndereco.localidade,
            estado: dadosEndereco.uf
        });

    } catch (error) {
        console.error('Erro ao consultar ViaCEP:', error.message);
        res.status(500).json({ error: 'Erro ao buscar dados do endereço.' });
    }
});

module.exports = router;