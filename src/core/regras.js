// regras.js — motor de categorização. Transforma a descrição crua do extrato
// ("IFD*IFOOD SAO PAULO", "PIX ENVIADO JOAO") na categoria e classificação certas.
//
// Uma regra é { padrao, categoria, classificacao }. `padrao` é texto simples:
// casa se aparecer em qualquer lugar da descrição, ignorando acento e caixa.
// A PRIMEIRA regra que casar vence — por isso a ordem importa (mais específica
// primeiro). As regras do usuário (estado.config.regras) vêm antes das padrão.

import { normalizar } from './model.js';

// Ponto de partida pensado pro extrato brasileiro. O usuário edita/adiciona
// as dele em Config; estas ficam como rede de segurança no fim da fila.
export const REGRAS_PADRAO = [
  { padrao: 'ifood', categoria: 'Alimentação', classificacao: 'Não essencial' },
  { padrao: 'rappi', categoria: 'Alimentação', classificacao: 'Não essencial' },
  { padrao: 'padaria', categoria: 'Padaria', classificacao: 'Essencial' },
  { padrao: 'panificadora', categoria: 'Padaria', classificacao: 'Essencial' },
  { padrao: 'supermercado', categoria: 'Mercado', classificacao: 'Essencial' },
  { padrao: 'mercado', categoria: 'Mercado', classificacao: 'Essencial' },
  { padrao: 'atacad', categoria: 'Mercado', classificacao: 'Essencial' },
  { padrao: 'farmacia', categoria: 'Farmácia', classificacao: 'Essencial' },
  { padrao: 'drogaria', categoria: 'Farmácia', classificacao: 'Essencial' },
  { padrao: 'posto', categoria: 'Gasolina', classificacao: 'Essencial' },
  { padrao: 'combustivel', categoria: 'Gasolina', classificacao: 'Essencial' },
  { padrao: 'uber', categoria: 'Transporte', classificacao: 'Não essencial' },
  { padrao: '99app', categoria: 'Transporte', classificacao: 'Não essencial' },
  { padrao: 'netflix', categoria: 'Assinaturas', classificacao: 'Não essencial' },
  { padrao: 'spotify', categoria: 'Assinaturas', classificacao: 'Não essencial' },
  { padrao: 'academia', categoria: 'Saúde', classificacao: 'Essencial' },
  { padrao: 'laboratorio', categoria: 'Saúde', classificacao: 'Essencial' },
  { padrao: 'amazon', categoria: 'Outros', classificacao: 'Não essencial' },

  // Padrões do extrato brasileiro (vistos nos extratos Sicredi/BTG)
  { padrao: 'transf conta salario', categoria: 'Salário', classificacao: 'Essencial' },
  { padrao: 'salario', categoria: 'Salário', classificacao: 'Essencial' },
  { padrao: 'pagto fatura', categoria: 'Fatura', classificacao: 'Essencial' },
  { padrao: 'pagamento de fatura', categoria: 'Fatura', classificacao: 'Essencial' },
  { padrao: 'fatura', categoria: 'Fatura', classificacao: 'Essencial' },
  { padrao: 'tarifa', categoria: 'Tarifas bancárias', classificacao: 'Essencial' },
  { padrao: 'cesta de servicos', categoria: 'Tarifas bancárias', classificacao: 'Essencial' },
  { padrao: 'saque', categoria: 'Saque', classificacao: '' },
  { padrao: 'detran', categoria: 'Impostos', classificacao: 'Essencial' },
  { padrao: 'darf', categoria: 'Impostos', classificacao: 'Essencial' },
  { padrao: 'seguro', categoria: 'Casa', classificacao: 'Essencial' },
];

// Aplica as regras (as do usuário primeiro) a uma descrição.
// Devolve { categoria, classificacao, padrao } ou null se nada casar.
export function categorizar(descricao, regrasUsuario = []) {
  const alvo = normalizar(descricao);
  if (!alvo) return null;
  for (const r of [...regrasUsuario, ...REGRAS_PADRAO]) {
    const p = normalizar(r.padrao);
    if (p && alvo.includes(p)) {
      return { categoria: r.categoria, classificacao: r.classificacao || '', padrao: r.padrao };
    }
  }
  return null;
}
