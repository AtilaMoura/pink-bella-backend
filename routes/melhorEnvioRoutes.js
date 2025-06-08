// routes/melhorEnvioRoutes.js

const express = require('express');
const router = express.Router();
const db = require('../database'); // Certifique-se que o caminho para o seu DB está correto
const melhorEnvioService = require('../services/melhorEnvioService'); // Certifique-se que o caminho está correto
require('dotenv').config(); // Carrega as variáveis de ambiente

// Suas constantes de variáveis de ambiente da loja (remetente)
// GARANTA QUE ESTAS VARIÁVEIS ESTÃO NO SEU ARQUIVO .ENV E COM VALORES VÁLIDOS!
const SEU_EMAIL_MELHOR_ENVIO = process.env.SEU_EMAIL_MELHOR_ENVIO;
const CEP_ORIGEM_LOJA = process.env.CEP_ORIGEM_LOJA;
const SEU_CPF_CNPJ_LOJA = process.env.SEU_CPF_CNPJ_LOJA; // CPF ou CNPJ do remetente
const SEU_ENDERECO_LOJA = process.env.SEU_ENDERECO_LOJA;
const SEU_NUMERO_LOJA = process.env.SEU_NUMERO_LOJA;
const SEU_COMPLEMENTO_LOJA = process.env.SEU_COMPLEMENTO_LOJA || null; // Pode ser opcional, por isso o `|| null`
const SEU_BAIRRO_LOJA = process.env.SEU_BAIRRO_LOJA;
const SEU_CIDADE_LOJA = process.env.SEU_CIDADE_LOJA;
const SEU_ESTADO_LOJA = process.env.SEU_ESTADO_LOJA;
const SEU_TELEFONE_LOJA = process.env.SEU_TELEFONE_LOJA;
const SEU_CNPJ_LOJA = process.env.SEU_CNPJ_LOJA || null; // CNPJ específico, se for PJ
const SEU_IE_LOJA = process.env.SEU_IE_LOJA || null;     // Inscrição Estadual, se for PJ

// --- Rota para adicionar ao carrinho do Melhor Envio ---
router.post('/adicionar-ao-carrinho', async (req, res) => {
    const { ids_compras } = req.body;

    if (!ids_compras || !Array.isArray(ids_compras)) {
        return res.status(400).json({ erro: 'ids_compras deve ser um array válido.' });
    }

    try {
        const dadosEnvio = [];

        for (const id of ids_compras) {
            const compra = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT
                        c.id AS compra_id, c.valor_total, c.valor_frete, c.peso_pacote, c.altura_pacote, c.largura_pacote, c.comprimento_pacote, c.melhor_envio_service_id,
                        cl.nome AS cliente_nome, cl.email AS cliente_email, cl.telefone AS cliente_telefone, cl.cpf AS cliente_cpf,
                        e.cep AS endereco_cep, e.logradouro AS endereco_logradouro, e.numero AS endereco_numero,
                        e.complemento AS endereco_complemento, e.bairro AS endereco_bairro,
                        e.cidade AS endereco_cidade, e.estado AS endereco_estado
                    FROM compras c
                    JOIN clientes cl ON c.cliente_id = cl.id
                    JOIN enderecos e ON c.endereco_entrega_id = e.id
                    WHERE c.id = ?
                `, [id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });

            if (compra) dadosEnvio.push(compra);
        }

        console.log('📦 Dados sendo enviados ao carrinho:', JSON.stringify(dadosEnvio, null, 2));
        const resposta = await melhorEnvioService.adicionarEnviosAoCarrinho(dadosEnvio);
        return res.status(200).json(resposta);

    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        return res.status(500).json({ erro: 'Erro interno ao adicionar ao carrinho.' });
    }
});

module.exports = router;