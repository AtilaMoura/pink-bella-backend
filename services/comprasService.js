// services/comprasService.js

const db = require('../database'); // Assumindo que seu arquivo de banco de dados está um nível acima
const melhorEnvioService = require('../services/melhorEnvioService');
/**
 * Busca e formata os detalhes completos de TODAS as compras.
 * Realiza JOINs para incluir informações de clientes, endereços e itens de compra.
 * @returns {Promise<Array<object>>} Uma Promise que resolve para um array de objetos de compras formatadas.
 */
async function getAllComprasFormatted() {

    // 1. Buscar todas as compras com JOINs para cliente e endereço
    const comprasRaw = await new Promise((resolve, reject) => {
        db.all(
            `SELECT
                c.id AS compra_id,
                c.data_compra,
                c.valor_total,
                c.valor_produtos,
                c.status_compra,
                c.valor_frete,
                c.transportadora,
                c.servico_frete,
                c.prazo_frete_dias,
                c.codigo_rastreio,
                c.codigo_etiqueta,
                c.melhor_envio_service_id,
                c.codigo_etiqueta,
                c.url_melhor_envio,
                c.peso_pacote,
                c.altura_pacote,
                c.largura_pacote,
                c.comprimento_pacote,
                cl.id AS cliente_id,
                cl.nome AS cliente_nome,
                cl.email AS cliente_email,
                cl.telefone AS cliente_telefone,
                e.id AS endereco_id,
                e.cep AS endereco_cep,
                e.logradouro AS endereco_logradouro,
                e.numero AS endereco_numero,
                e.complemento AS endereco_complemento,
                e.bairro AS endereco_bairro,
                e.cidade AS endereco_cidade,
                e.estado AS endereco_estado,
                e.referencia AS endereco_referencia
            FROM compras c
            JOIN clientes cl ON c.cliente_id = cl.id
            JOIN enderecos e ON c.endereco_entrega_id = e.id
            ORDER BY c.data_compra DESC`, // Ordena pelas compras mais recentes primeiro
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            }
        );
    });

    if (comprasRaw.length === 0) {
        return []; // Retorna um array vazio se não houver compras
    }

    // 2. Para cada compra encontrada, buscar seus itens separadamente
    // Usamos Promise.all para executar todas as buscas de itens em paralelo, otimizando o desempenho.
    const todasComprasFormatadas = await Promise.all(comprasRaw.map(async (compra) => {
        const itensCompra = await new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    ic.id AS item_id,
                    ic.quantidade,
                    ic.preco_unitario_no_momento_da_compra,
                    p.id AS produto_id,
                    p.nome AS produto_nome,
                    p.preco AS produto_preco_atual,
                    p.imagem AS produto_imagem
                FROM itens_compra ic
                JOIN produtos p ON ic.produto_id = p.id
                WHERE ic.compra_id = ?`,
                [compra.compra_id],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });

        // Formatar o objeto da compra para a saída desejada
        return {
            id: compra.compra_id,
            data_compra: compra.data_compra,
            valor_total: compra.valor_total,
            valor_produtos: compra.valor_produtos,
            status_compra: compra.status_compra,
            codigo_rastreio: compra.codigo_rastreio,
            codigo_etiqueta: compra.codigo_etiqueta,
            url_melhor_envio: compra.url_melhor_envio,
            melhor_envio_service_id: compra.melhor_envio_service_id,
            codigo_etiqueta: compra.codigo_etiqueta,
            pacote: {
                peso: compra.peso_pacote,
                altura: compra.altura_pacote,
                largura: compra.largura_pacote,
                comprimento: compra.comprimento_pacote
            },
            frete: {
                valor: compra.valor_frete,
                transportadora: compra.transportadora,
                servico: compra.servico_frete,
                prazo_dias_uteis: compra.prazo_frete_dias
            },
            cliente: {
                id: compra.cliente_id,
                nome: compra.cliente_nome,
                email: compra.cliente_email,
                telefone: compra.cliente_telefone
            },
            endereco_entrega: {
                id: compra.endereco_id,
                cep: compra.endereco_cep,
                logradouro: compra.endereco_logradouro,
                numero: compra.endereco_numero,
                complemento: compra.endereco_complemento,
                bairro: compra.endereco_bairro,
                cidade: compra.endereco_cidade,
                estado: compra.endereco_estado,
                referencia: compra.endereco_referencia
            },
            itens: itensCompra.map(item => ({
                id: item.item_id,
                produto: {
                    id: item.produto_id,
                    nome: item.produto_nome,
                    preco_atual_catalogo: item.produto_preco_atual,
                    imagem: item.produto_imagem
                },
                quantidade: item.quantidade,
                preco_unitario_na_compra: item.preco_unitario_no_momento_da_compra,
                subtotal_item: item.quantidade * item.preco_unitario_no_momento_da_compra
            }))
        };
    }));

    return todasComprasFormatadas;
}

async function atualizarStatusCompra(compraId, status) {
  try {
    await new Promise((resolve, reject) => {
      db.run('UPDATE compras SET status_compra = ? WHERE id = ?', [status, compraId], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } catch (error) {
    console.error('Erro ao atualizar status da compra:', error.message);
    throw error;
  }
}


async function atualizarStatusPorCodigoEtiqueta(labelIds, novoStatus) {
  if (!Array.isArray(labelIds) || labelIds.length === 0) {
    throw new Error('Lista de etiquetas inválida.');
  }

  for (const labelId of labelIds) {
    const compra = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM compras WHERE codigo_etiqueta = ?', [labelId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (compra && compra.id) {
      await atualizarStatusCompra(compra.id, novoStatus);
    } else {
      console.warn(`⚠️ Compra não encontrada para etiqueta: ${labelId}`);
    }
  }
}

async function buscarComprasComEtiquetaPendente() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT id, codigo_etiqueta
      FROM compras
      WHERE status_compra IN ('Etiqueta Gerada', 'Pagar Etiqueta', 'Pago', 'Etiqueta PDF Gerada', 'Postado', 'Aguardando Etiqueta', 'Processado')
        AND codigo_etiqueta IS NOT NULL
    `, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function editarCompra(id, novosDados) {
  return new Promise((resolve, reject) => {
    const campos = Object.keys(novosDados)
      .map(campo => `${campo} = ?`)
      .join(', ');

    const valores = Object.values(novosDados);

    const sql = `UPDATE compras SET ${campos} WHERE id = ?`;

    db.run(sql, [...valores, id], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id, alteradas: this.changes });
      }
    });
  });
}

module.exports = {
    getAllComprasFormatted,
    atualizarStatusCompra,
    atualizarStatusPorCodigoEtiqueta,
    buscarComprasComEtiquetaPendente,
    editarCompra

};