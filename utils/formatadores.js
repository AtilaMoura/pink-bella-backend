// utils/formatadores.js

function formatarClienteComEndereco(cliente) {
  return {
    id: cliente.cliente_id,
    nome: cliente.nome,
    email: cliente.email,
    telefone: cliente.telefone,
    cpf: cliente.cpf,
    data_cadastro: cliente.data_cadastro,
    endereco_principal: cliente.endereco_id ? {
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

module.exports = {
  formatarClienteComEndereco
};
