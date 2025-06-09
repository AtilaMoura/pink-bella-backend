const express = require('express');
const router = express.Router();
const db = require('../database'); // ajuste o caminho conforme seu projeto
const melhorEnvioService = require('../services/melhorEnvioService'); // ajuste o caminho
require('dotenv').config();

router.post('/adicionar-ao-carrinho', async (req, res) => {
  const { purchaseIds } = req.body;

  if (!purchaseIds || !Array.isArray(purchaseIds) || purchaseIds.length === 0) {
    return res.status(400).json({ message: "É necessário fornecer IDs de compra válidos." });
  }

  try {
    // Para cada purchaseId você pode fazer o envio individualmente, ou tratar só o primeiro para enviar 1 pedido
    // Aqui vou usar apenas o primeiro ID, pois você pediu para gerar o JSON sem ser lista
    const purchaseId = purchaseIds[0];

    // Busca dados da compra, cliente, endereço e loja
    const purchaseDetailsQuery = `
      SELECT
        c.id AS compra_id,
        c.valor_total AS insurance_value,
        c.melhor_envio_service_id AS service_id,
        c.peso_pacote AS package_weight,
        c.altura_pacote AS package_height,
        c.largura_pacote AS package_width,
        c.comprimento_pacote AS package_length,
        cli.nome AS destinatario_name,
        cli.telefone AS destinatario_phone,
        cli.email AS destinatario_email,
        cli.cpf AS destinatario_document,
        end.logradouro AS destinatario_address,
        end.complemento AS destinatario_complement,
        end.numero AS destinatario_number,
        end.bairro AS destinatario_district,
        end.cidade AS destinatario_city,
        end.estado AS destinatario_state_abbr,
        end.cep AS destinatario_postal_code,
        'BR' AS destinatario_country_id
      FROM compras c
      JOIN clientes cli ON cli.id = c.cliente_id
      JOIN enderecos end ON end.id = c.endereco_entrega_id
      WHERE c.id = ?
    `;

    const purchase = await new Promise((resolve, reject) => {
      db.get(purchaseDetailsQuery, [purchaseId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!purchase) {
      return res.status(404).json({ message: `Compra ${purchaseId} não encontrada.` });
    }

    // Busca produtos da compra
    const productsInPurchaseQuery = `
      SELECT
        p.nome AS product_name,
        ic.quantidade AS quantity,
        ic.preco_unitario_no_momento_da_compra AS unitary_value,
        p.peso AS item_weight,
        p.altura AS item_height,
        p.largura AS item_width,
        p.comprimento AS item_length
      FROM itens_compra ic
      JOIN produtos p ON p.id = ic.produto_id
      WHERE ic.compra_id = ?
    `;

    const productsInPurchase = await new Promise((resolve, reject) => {
      db.all(productsInPurchaseQuery, [purchaseId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    let totalWeight = purchase.package_weight || 0;
    let packageHeight = purchase.package_height || 0;
    let packageWidth = purchase.package_width || 0;
    let packageLength = purchase.package_length || 0;

    const productsForMelhorEnvio = productsInPurchase.map(item => {
      if (!purchase.package_weight) {
        totalWeight += (item.item_weight || 0) * item.quantity;
        packageHeight = Math.max(packageHeight, (item.item_height || 0));
        packageWidth = Math.max(packageWidth, (item.item_width || 0));
        packageLength = Math.max(packageLength, (item.item_length || 0));
      }

      return {
        name: item.product_name,
        quantity: String(item.quantity),
        unitary_value: String(item.unitary_value)
      };
    });

    // Monta o objeto único (não array)
    const orderMelhorEnvio = {
      from: {
        name: "Pink Bella",
        phone: "+5511978445381",
        email: "utilefacil.123@gmail.com",
        document: "43740234881",
        address: "Rua Cândido Rodrigues",
        state_register: "SP",
        number: "21",
        district: "Jardim Vila Formosa",
        city: "São Paulo",
        country_id: "BR",
        postal_code: "03472090",
        state_abbr: "SP",
        complement: "bloco A Ap 4"
      },
      to: {
        name: purchase.destinatario_name,
        phone: "+55" + String(purchase.destinatario_phone),
        email: purchase.destinatario_email,
        document: purchase.destinatario_document.replace(/\D/g, ''),
        address: purchase.destinatario_address,
        complement: purchase.destinatario_complement,
        number: String(purchase.destinatario_number),
        district: purchase.destinatario_district,
        city: purchase.destinatario_city,
        country_id: "BR",
        postal_code: purchase.destinatario_postal_code.replace(/\D/g, ''),
        state_abbr: purchase.destinatario_state_abbr
      },
      service: purchase.service_id,
      volumes: [
        {
          height: packageHeight,
          width: packageWidth,
          length: packageLength,
          weight: totalWeight
        }
      ],
      options: {
        insurance_value: purchase.insurance_value,
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true,
        platform: "Pink Bella",
        tags: [
          {
            tag: `PinkBella-Compra-${purchase.compra_id}`,
            url: `https://sua-plataforma.com/pedidos/${purchase.compra_id}`
          }
        ],
        invoice: { key: null }
      },
      products: productsForMelhorEnvio
    };

    console.log("Payload FINAL para Melhor Envio:", JSON.stringify(orderMelhorEnvio, null, 2));

    // Chama o serviço passando o objeto único
    const result = await melhorEnvioService.adicionarEnviosAoCarrinho(orderMelhorEnvio);

    return res.status(200).json(result);

  } catch (error) {
    console.error("Erro ao adicionar envios ao carrinho:", error);
    if (error.response) {
      console.error("Erro da API Melhor Envio:", error.response.data);
      return res.status(error.response.status).json({
        message: "Erro na comunicação com a API do Melhor Envio.",
        details: error.response.data
      });
    }
    return res.status(500).json({
      message: "Erro interno do servidor ao processar o pedido.",
      error: error.message
    });
  }
});

module.exports = router;
