// utils/formatadores.js

function formatarClienteComEndereco(cliente) {
  return {
    id: cliente.cliente_id,
    nome: cliente.nome,
    email: cliente.email,
    telefone: cliente.telefone,
    cpf: cliente.cpf,
    data_cadastro: cliente.data_cadastro,
    ativo: cliente.ativo,
    endereco: cliente.endereco_id ? {
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
      is_principal: Boolean(cliente.is_principal)
    } : null
  };
}

async function getFormattedCompraDetails(db, compraId) {
        // 1. Buscar detalhes da compra, cliente e endereço de entrega
        const compra = await new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    c.id AS compra_id,
                    c.data_compra,
                    c.valor_total,
                    c.status_compra,
                    c.valor_frete,
                    c.transportadora,
                    c.servico_frete,
                    c.prazo_frete_dias,
                    c.codigo_rastreio,
                    c.codigo_etiqueta,
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
                WHERE c.id = ?`,
                [compraId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                }
            );
        });

        if (!compra) {
            return null; // Retorna null se a compra não for encontrada
        }

        // 2. Buscar os itens_compra associados a esta compra
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
                [compraId],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });

        // 3. Formatar a resposta final
        const compraFormatada = {
            id: compra.compra_id,
            data_compra: compra.data_compra,
            valor_total: compra.valor_total,
            status_compra: compra.status_compra,
            codigo_rastreio: compra.codigo_rastreio,
            codigo_etiqueta: compra.codigo_etiqueta,
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
            endereco: {
                id: compra.endereco_id,
                cep: compra.endereco_cep,
                logradouro: compra.endereco_logradouro,
                numero: compra.endereco_numero,
                complemento: compra.endereco_complemento,
                bairro: compra.endereco_bairro,
                cidade: compra.cidade,
                estado: compra.estado,
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

        return compraFormatada;
    }

module.exports = {
  formatarClienteComEndereco,
  getFormattedCompraDetails
  
};
