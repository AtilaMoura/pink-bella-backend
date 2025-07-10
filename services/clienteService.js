
const { lookupAddressByCep } = require('../utils/cepUtils'); // Importa a função de consulta de CEP
const { formatarClienteComEndereco } = require('../utils/formatadores');
const db = require('../database');



// Função para cadastrar cliente + endereço (mesmo código encapsulado)
async function cadastrarClienteComEndereco(cliente) {
  const { nome, email, telefone, cpf, endereco } = cliente;

  // Validações básicas comentadas, pode ativar se quiser
  /*
  if (!nome || !email || !endereco?.cep || !endereco?.numero) {
    throw new Error('Nome, email, CEP e número do endereço são obrigatórios.');
  }
  if (!email.includes('@') || !email.includes('.')) {
    throw new Error('Formato de e-mail inválido.');
  }
  */

  const dadosEnderecoCompletos = await lookupAddressByCep(endereco.cep);

  if (!dadosEnderecoCompletos && !endereco.logradouro) {
    throw new Error('CEP não encontrado ou inválido e logradouro manual não informado.');
  }

  // Usa logradouro do lookup, ou do manual caso não tenha vindo do lookup
  const logradouroFinal = (dadosEnderecoCompletos && dadosEnderecoCompletos.logradouro)
    ? dadosEnderecoCompletos.logradouro
    : (endereco.logradouro || null);

  if (!logradouroFinal) {
    throw new Error('Logradouro obrigatório. Informe no endereço ou certifique-se que o CEP é válido.');
  }

  const enderecoCompletoParaDB = {
    cep: endereco.cep,
    logradouro: logradouroFinal,
    bairro: (dadosEnderecoCompletos && dadosEnderecoCompletos.bairro) || endereco.bairro || null,
    cidade: (dadosEnderecoCompletos && dadosEnderecoCompletos.cidade) || endereco.cidade || null,
    estado: (dadosEnderecoCompletos && dadosEnderecoCompletos.estado) || endereco.estado || null,
    numero: endereco.numero,
    complemento: endereco.complemento || null,
    referencia: endereco.referencia || null,
    tipo_endereco: endereco.tipo_endereco || 'Residencial',
    is_principal: endereco.is_principal !== undefined ? endereco.is_principal : true
  };

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION;', async (err) => {
        if (err) return reject(err);

        try {
          const clienteId = await new Promise((res, rej) => {
            db.run(
              `INSERT INTO clientes (nome, email, telefone, cpf, data_cadastro)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [nome, email, telefone || null, cpf || null],
              function (err) {
                if (err) {
                  if (err.message.includes('email')) return rej(new Error('Este e-mail já está cadastrado.'));
                  if (err.message.includes('cpf')) return rej(new Error('Este CPF já está cadastrado.'));
                  return rej(err);
                }
                res(this.lastID);
              }
            );
          });

          const enderecoId = await new Promise((res, rej) => {
            db.run(
              `INSERT INTO enderecos (
                cliente_id, cep, logradouro, numero, complemento,
                bairro, cidade, estado, referencia, tipo_endereco, is_principal
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                clienteId,
                enderecoCompletoParaDB.cep,
                enderecoCompletoParaDB.logradouro,
                enderecoCompletoParaDB.numero,
                enderecoCompletoParaDB.complemento,
                enderecoCompletoParaDB.bairro,
                enderecoCompletoParaDB.cidade,
                enderecoCompletoParaDB.estado,
                enderecoCompletoParaDB.referencia,
                enderecoCompletoParaDB.tipo_endereco,
                enderecoCompletoParaDB.is_principal ? 1 : 0
              ],
              function (err) {
                if (err) return rej(err);
                res(this.lastID);
              }
            );
          });

          await new Promise((res, rej) => {
            db.run(
              `UPDATE clientes SET endereco_principal_id = ? WHERE id = ?`,
              [enderecoId, clienteId],
              function (err) {
                if (err) return rej(err);
                if (this.changes === 0) return rej(new Error('Erro ao vincular endereço ao cliente.'));
                res();
              }
            );
          });

          db.run('COMMIT;', (err) => {
            if (err) return reject(err);
            resolve({ clienteId, enderecoId, nome, email, endereco: enderecoCompletoParaDB });
          });
        } catch (error) {
          db.run('ROLLBACK;', () => {
            reject(error);
          });
        }
      });
    });
  });
}

async function buscarClientePorId(id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
        c.id AS cliente_id,
        c.nome,
        c.email,
        c.telefone,
        c.cpf,
        c.data_cadastro,
        c.ativo,
        e.id AS endereco_id,
        e.cep,
        e.logradouro,
        e.numero,
        e.complemento,
        e.bairro,
        e.cidade,
        e.estado,
        e.referencia,
        e.tipo_endereco,
        e.is_principal
      FROM clientes c
      LEFT JOIN enderecos e ON c.endereco_principal_id = e.id
      WHERE c.id = ?`,
      [id],
      (err, row) => {
        if (err) return reject(err);

        const clienteFormatado = formatarClienteComEndereco(row);
        resolve(clienteFormatado);
      }
    );
  });
}

async function listarTodosClientes() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT
          c.id AS cliente_id,
          c.nome,
          c.email,
          c.telefone,
          c.cpf,
          c.data_cadastro,
          c.ativo,
          e.id AS endereco_id,
          e.cep,
          e.logradouro,
          e.numero,
          e.complemento,
          e.bairro,
          e.cidade,
          e.estado,
          e.referencia,
          e.tipo_endereco,
          e.is_principal
      FROM clientes c
      LEFT JOIN enderecos e ON c.endereco_principal_id = e.id
      ORDER BY c.nome ASC`,
      [],
      (err, rows) => {
        if (err) return reject(err);

        const clientesFormatados = rows.map(formatarClienteComEndereco);
        resolve(clientesFormatados);
      }
    );
  });
}

async function atualizarClienteComEndereco(id, dadosAtualizacao) {
  const { nome, email, telefone, cpf, endereco } = dadosAtualizacao;

  console.log(endereco);

  if (!nome && !email && !telefone && !cpf && !endereco) {
    throw new Error('Nenhum dado para atualizar fornecido.');
  }
  if (email && (!email.includes('@') || !email.includes('.'))) {
    throw new Error('Formato de e-mail inválido.');
  }
  if (endereco && (!endereco.cep || !endereco.numero)) {
    throw new Error('CEP e número do endereço são obrigatórios para atualizar o endereço.');
  }

  let dadosEnderecoCompletos = null;
  if (endereco?.cep) {
    dadosEnderecoCompletos = await lookupAddressByCep(endereco.cep);
    if (!dadosEnderecoCompletos && !endereco.logradouro) {
      throw new Error('CEP do endereço para atualização não encontrado ou inválido e logradouro manual não informado.');
    }
  }

  // Define logradouro final
  const logradouroFinal = (dadosEnderecoCompletos && dadosEnderecoCompletos.logradouro)
    ? dadosEnderecoCompletos.logradouro
    : (endereco?.logradouro || null);

  if (endereco && !logradouroFinal) {
    throw new Error('Logradouro obrigatório. Informe no endereço ou certifique-se que o CEP é válido.');
  }

  // Prepara endereço completo para atualização
  const enderecoCompletoParaDB = endereco
    ? {
        cep: endereco.cep,
        logradouro: logradouroFinal,
        bairro: (dadosEnderecoCompletos && dadosEnderecoCompletos.bairro) || endereco.bairro || null,
        cidade: (dadosEnderecoCompletos && dadosEnderecoCompletos.cidade) || endereco.cidade || null,
        estado: (dadosEnderecoCompletos && dadosEnderecoCompletos.estado) || endereco.estado || null,
        numero: endereco.numero,
        complemento: endereco.complemento || null,
        referencia: endereco.referencia || null,
        tipo_endereco: endereco.tipo_endereco || 'Residencial',
        is_principal: endereco.is_principal !== undefined ? endereco.is_principal : true
      }
    : null;

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION;', async function (err) {
        if (err) return reject(new Error('Erro ao iniciar transação.'));

        try {
          const updates = [];
          const params = [];

          if (nome) { updates.push('nome = ?'); params.push(nome); }
          if (email) { updates.push('email = ?'); params.push(email); }
          if (telefone !== undefined) { updates.push('telefone = ?'); params.push(telefone || null); }
          if (cpf !== undefined) { updates.push('cpf = ?'); params.push(cpf || null); }

          if (updates.length > 0) {
            await new Promise((resolve, reject) => {
              db.run(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`, [...params, id], function (err) {
                if (err) {
                  if (err.message.includes('email')) return reject(new Error('Este e-mail já está cadastrado.'));
                  if (err.message.includes('cpf')) return reject(new Error('Este CPF já está cadastrado.'));
                  return reject(err);
                }
                resolve();
              });
            });
          }

          if (enderecoCompletoParaDB) {
            const clienteExistente = await new Promise((resolve, reject) => {
              db.get('SELECT endereco_principal_id FROM clientes WHERE id = ?', [id], (err, row) => {
                if (err) return reject(err);
                if (!row) return reject(new Error('Cliente não encontrado para atualização.'));
                resolve(row);
              });
            });

            if (!clienteExistente.endereco_principal_id) {
              const novoEnderecoId = await new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO enderecos (
                    cliente_id, cep, logradouro, numero, complemento,
                    bairro, cidade, estado, referencia, tipo_endereco, is_principal
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    id,
                    enderecoCompletoParaDB.cep,
                    enderecoCompletoParaDB.logradouro,
                    enderecoCompletoParaDB.numero,
                    enderecoCompletoParaDB.complemento,
                    enderecoCompletoParaDB.bairro,
                    enderecoCompletoParaDB.cidade,
                    enderecoCompletoParaDB.estado,
                    enderecoCompletoParaDB.referencia,
                    enderecoCompletoParaDB.tipo_endereco,
                    enderecoCompletoParaDB.is_principal ? 1 : 0
                  ],
                  function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                  }
                );
              });

              await new Promise((resolve, reject) => {
                db.run(`UPDATE clientes SET endereco_principal_id = ? WHERE id = ?`, [novoEnderecoId, id], function (err) {
                  if (err) return reject(err);
                  resolve();
                });
              });

            } else {
              await new Promise((resolve, reject) => {
                db.run(
                  `UPDATE enderecos SET
                    cep = ?, logradouro = ?, numero = ?, complemento = ?,
                    bairro = ?, cidade = ?, estado = ?, referencia = ?, tipo_endereco = ?, is_principal = ?
                  WHERE id = ? AND cliente_id = ?`,
                  [
                    enderecoCompletoParaDB.cep,
                    enderecoCompletoParaDB.logradouro,
                    enderecoCompletoParaDB.numero,
                    enderecoCompletoParaDB.complemento,
                    enderecoCompletoParaDB.bairro,
                    enderecoCompletoParaDB.cidade,
                    enderecoCompletoParaDB.estado,
                    enderecoCompletoParaDB.referencia,
                    enderecoCompletoParaDB.tipo_endereco,
                    enderecoCompletoParaDB.is_principal ? 1 : 0,
                    clienteExistente.endereco_principal_id,
                    id
                  ],
                  function (err) {
                    if (err) return reject(err);
                    if (this.changes === 0) {
                      return reject(new Error('Falha ao atualizar o endereço. Nenhuma linha afetada.'));
                    }
                    resolve();
                  }
                );
              });
            }
          }

          db.run('COMMIT;', err => {
            if (err) return reject(new Error('Erro ao finalizar a transação.'));
            resolve({ message: 'Cliente e/ou endereço atualizados com sucesso!' });
          });

        } catch (e) {
          db.run('ROLLBACK;', () => reject(e));
        }
      });
    });
  });
}


function desativarCliente(id) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION;', async function (err) {
        if (err) return reject(new Error('Erro ao iniciar a transação.'));

        try {
          const cliente = await new Promise((res, rej) => {
            db.get('SELECT id, ativo FROM clientes WHERE id = ?', [id], (err, row) => {
              if (err) return rej(err);
              res(row);
            });
          });

          if (!cliente) {
            db.run('ROLLBACK;');
            return reject({ status: 404, message: 'Cliente não encontrado.' });
          }

          if (cliente.ativo === 0) {
            await new Promise((res, rej) => {
            db.run('UPDATE clientes SET ativo = 1 WHERE id = ?', [id], function (err) {
              if (err) return rej(err);
              if (this.changes === 0) return rej(new Error('Nenhuma linha afetada.'));
              res();
            });
          });
          } else{
            await new Promise((res, rej) => {
            db.run('UPDATE clientes SET ativo = 0 WHERE id = ?', [id], function (err) {
              if (err) return rej(err);
              if (this.changes === 0) return rej(new Error('Nenhuma linha afetada.'));
              res();
            });
          });
          }

          

          db.run('COMMIT;', function (err) {
            if (err) return reject(new Error('Erro ao fazer commit.'));
            resolve();
          });

        } catch (error) {
          db.run('ROLLBACK;');
          if (error.status) return reject(error);
          reject(new Error(error.message || 'Erro interno.'));
        }
      });
    });
  });
}

module.exports = {
    cadastrarClienteComEndereco,
    buscarClientePorId,
    listarTodosClientes,
    atualizarClienteComEndereco,
    desativarCliente
}