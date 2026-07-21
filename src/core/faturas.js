// faturas.js — em que fatura (mês) cai uma compra no cartão.
// Regra herdada da planilha: compra ATÉ o dia de fechamento entra na fatura
// que vence no mês seguinte; DEPOIS do fechamento, pula um mês a mais.

import { mesDe, somaMeses } from './model.js';

// Retorna o "YYYY-MM" da 1ª fatura de uma compra feita em dataISO com o cartão.
export function mesPrimeiraFatura(dataISO, cartao) {
  const fechamento = Number(cartao?.fechamento) || 1;
  const dia = Number(String(dataISO).slice(8, 10)) || 1;
  const mesCompra = mesDe(dataISO);
  // compra até o fechamento -> fatura do mês seguinte; depois -> +2 meses.
  const offset = dia <= fechamento ? 1 : 2;
  return somaMeses(mesCompra, offset);
}
