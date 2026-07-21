// parcelas.js — explode compras no cartão (tipo "cartao") em parcelas.
// Herdado da aba "Parcelas": N parcelas de valor/N, distribuídas nas faturas.
// A última parcela absorve o resíduo do arredondamento -> a soma fecha o total.

import { paraCentavos, paraReais, somaMeses } from './model.js';
import { mesPrimeiraFatura } from './faturas.js';

// Gera as parcelas de UMA transação de cartão.
// Retorna [] se não for compra de cartão. Cada parcela:
// { transacaoId, cartaoId, categoria, descricao, classificacao,
//   n, de, valor, dataCompra, mesFatura }
export function parcelasDaTransacao(tx, cartao) {
  if (!tx || tx.tipo !== 'cartao') return [];
  const n = Math.max(1, Math.floor(Number(tx.parcelas) || 1));
  const totalCent = paraCentavos(tx.valor);
  const baseCent = Math.floor(totalCent / n);
  const resto = totalCent - baseCent * n; // vai na última parcela
  const mes1 = cartao ? mesPrimeiraFatura(tx.data, cartao) : (tx.data || '').slice(0, 7);

  const out = [];
  for (let k = 1; k <= n; k += 1) {
    const cent = baseCent + (k === n ? resto : 0);
    out.push({
      transacaoId: tx.id,
      cartaoId: tx.cartaoId,
      categoria: tx.categoria,
      descricao: tx.descricao || '',
      classificacao: tx.classificacao || '',
      n: k,
      de: n,
      valor: paraReais(cent),
      dataCompra: tx.data,
      mesFatura: somaMeses(mes1, k - 1),
    });
  }
  return out;
}

// Todas as parcelas do estado (todas as compras de cartão explodidas).
export function todasParcelas(estado) {
  const porId = new Map((estado.cartoes || []).map((c) => [c.id, c]));
  const out = [];
  for (const tx of estado.transacoes || []) {
    if (tx.tipo !== 'cartao') continue;
    out.push(...parcelasDaTransacao(tx, porId.get(tx.cartaoId)));
  }
  return out;
}

// Parcelas que compõem a fatura de um cartão num mês ("YYYY-MM").
export function parcelasDaFatura(estado, cartaoId, mesFatura) {
  return todasParcelas(estado).filter(
    (p) => p.cartaoId === cartaoId && p.mesFatura === mesFatura,
  );
}
