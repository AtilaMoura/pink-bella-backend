const express = require('express');
const router = express.Router();
const db = require('../database');
const { 
    cadastrarClienteComEndereco, 
    buscarClientePorId,
    listarTodosClientes,
    atualizarClienteComEndereco,
    desativarCliente 
 } = require('../services/clienteService');

// Endpoint: http://localhost:3000/clientes
router.post('/', async (req, res) => {
  try {
    const resultado = await cadastrarClienteComEndereco(db, req.body);
    res.status(201).json({
      message: 'Cliente e endereço cadastrados com sucesso!',
      cliente: resultado,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST para cadastrar VÁRIOS clientes (recebe lista)
router.post('/lista', async (req, res) => {
  const clientes = req.body;

  console.log(req.body.clientes)

  if (!Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ error: 'Envie uma lista válida de clientes.' });
  }

  const resultados = [];

  for (const cliente of clientes) {
    try {
      const resultado = await cadastrarClienteComEndereco(db, cliente);
      resultados.push({ cliente: cliente.nome, sucesso: true, dados: resultado });
    } catch (error) {
      resultados.push({ cliente: cliente.nome, sucesso: false, erro: error.message });
    }
  }

  res.json({ resultados });
});

// Endpoint: http://localhost:3000/clientes/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const cliente = await buscarClientePorId(id);

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.json(cliente);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error.message);
    res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
});

// Endpoint: http://localhost:3000/clientes
router.get('/', async (req, res) => {
  try {
    const clientes = await listarTodosClientes();
    res.json(clientes);
  } catch (error) {
    console.error('Erro ao listar clientes:', error.message);
    res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
});

// Endpoint: http://localhost:3000/clientes/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await atualizarClienteComEndereco(id, req.body);
    res.json(resultado);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: http://localhost:3000/clientes/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await desativarCliente(id);
    res.status(200).json({ message: 'Cliente desativado ou ativado com sucesso.' });
  } catch (error) {
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Erro ao desativar cliente:', error.message);
      res.status(500).json({ error: 'Erro ao desativar cliente.' });
    }
  }
});

module.exports = router;