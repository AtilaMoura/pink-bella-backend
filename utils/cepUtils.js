const axios = require('axios'); // Precisamos do axios para fazer requisições HTTP

/**
 * Consulta detalhes de um endereço a partir de um CEP usando a API do ViaCEP.
 * @param {string} cep - O CEP a ser consultado (pode ter caracteres, a função vai limpar).
 * @returns {Promise<object|null>} - Retorna um objeto com logradouro, bairro, cidade, estado e cep, ou null se não encontrar.
 */
async function lookupAddressByCep(cep) {
    // Remove qualquer coisa que não seja número do CEP
    const cleanedCep = cep.replace(/\D/g, '');

    // Verifica se o CEP tem 8 dígitos após a limpeza
    if (cleanedCep.length !== 8) {
        console.log(`CEP inválido detectado: ${cep}`);
        return null; // Retorna nulo se o CEP não for válido
    }

    try {
        // Faz a requisição para a API do ViaCEP
        const response = await axios.get(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        const dadosEndereco = response.data;

        // O ViaCEP retorna { "erro": true } se o CEP não for encontrado
        if (dadosEndereco.erro) {
            console.log(`CEP não encontrado pelo ViaCEP: ${cleanedCep}`);
            return null;
        }

        // Retorna um objeto com as informações principais do endereço
        return {
            cep: dadosEndereco.cep,
            logradouro: dadosEndereco.logradouro,
            bairro: dadosEndereco.bairro,
            cidade: dadosEndereco.localidade,
            estado: dadosEndereco.uf
        };

    } catch (error) {
        // Em caso de qualquer erro na requisição (rede, servidor do ViaCEP, etc.)
        console.error(`Erro ao consultar ViaCEP para o CEP ${cleanedCep}:`, error.message);
        return null;
    }
}

// Exporta a função para que outras partes do seu código possam usá-la
module.exports = {
    lookupAddressByCep
};