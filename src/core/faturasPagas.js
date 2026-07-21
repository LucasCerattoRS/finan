// faturasPagas.js — quanto cada fatura custa, quanto já foi pago, o que falta,
// e o adiantamento (pagar uma fatura antes do mês dela).
//
// Duas origens para o valor de uma fatura:
//  1) CALCULADA — a soma das parcelas das compras que você lançou no app.
//  2) INFORMADA  — o total que o banco mostra (`estado.faturas`). É o que temos
//     quando as compras não foram lançadas uma a uma, só a fatura. A informada
//     manda, porque é o número do banco.
//
// Dinheiro (a regra que evita contar duas vezes):
//  - PARCELA conta como saída no mês da fatura (é quando sai da conta).
//  - FATURA INFORMADA **não** conta como saída: ela é um compromisso. O dinheiro
//    saindo aparece no extrato do banco, e é de lá que vem a saída.
//  - PAGAMENTO nunca é saída — é acompanhamento (senão o mesmo dinheiro contaria
//    duas vezes). Adiantar só antecipa o registro, não cria gasto novo.

import { paraCentavos, paraReais, mesDe } from './model.js';
import { parcelasDaFatura, todasParcelas } from './parcelas.js';

// A fatura que o banco informou para esse cartão/mês (se houver).
export function faturaInformada(estado, cartaoId, mesFatura) {
  return (estado.faturas || []).find(
    (f) => f.cartaoId === cartaoId && f.mes === mesFatura,
  ) || null;
}

// Valor total da fatura: o informado pelo banco vence; senão, soma as parcelas.
export function totalFatura(estado, cartaoId, mesFatura) {
  const info = faturaInformada(estado, cartaoId, mesFatura);
  // informado só vence quando > 0: um "informado 0" (print vazio, banco não somou a
  // fatura) não pode apagar as parcelas reais — cai de volta na soma delas.
  if (info && Number.isFinite(Number(info.total)) && Number(info.total) > 0) return Number(info.total);
  const cents = parcelasDaFatura(estado, cartaoId, mesFatura)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  return paraReais(cents);
}

// Quanto já foi pago dessa fatura (inclui o que foi adiantado).
export function totalPago(estado, cartaoId, mesFatura) {
  const cents = (estado.pagamentosFatura || [])
    .filter((p) => p.cartaoId === cartaoId && p.mesFatura === mesFatura)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  return paraReais(cents);
}

// Um pagamento é ADIANTAMENTO quando o dinheiro saiu antes do mês da fatura.
export function ehAdiantamento(pagamento) {
  if (!pagamento?.data) return false;
  return mesDe(pagamento.data) < pagamento.mesFatura;
}

// Situação da fatura: total, pago, restante, progresso 0..1.
export function resumoFatura(estado, cartaoId, mesFatura) {
  const total = totalFatura(estado, cartaoId, mesFatura);
  const pago = totalPago(estado, cartaoId, mesFatura);
  const totalCent = paraCentavos(total);
  const pagoCent = paraCentavos(pago);
  const adiantado = (estado.pagamentosFatura || [])
    .filter((p) => p.cartaoId === cartaoId && p.mesFatura === mesFatura && ehAdiantamento(p))
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);

  return {
    cartaoId,
    mesFatura,
    total,
    pago,
    adiantado: paraReais(adiantado),
    restante: paraReais(Math.max(0, totalCent - pagoCent)),
    progresso: totalCent > 0 ? Math.min(1, pagoCent / totalCent) : 0,
    quitada: totalCent > 0 && pagoCent >= totalCent,
    informada: !!faturaInformada(estado, cartaoId, mesFatura),
  };
}

// Todas as faturas de um mês, um item por cartão (o "Resumo de cartões" da planilha).
export function faturasDoMes(estado, mes) {
  return (estado.cartoes || []).map((c) => ({
    ...resumoFatura(estado, c.id, mes),
    cartao: c.nome,
    vencimento: c.vencimento,
  }));
}

// As faturas de `mes` em diante — as que dá pra adiantar. Um mês entra na lista
// se o banco informou uma fatura nele OU se alguma parcela sua cai nele.
export function proximasFaturas(estado, mes, quantas = 8) {
  const meses = new Set();
  for (const f of estado.faturas || []) if (f.mes >= mes) meses.add(f.mes);
  for (const p of todasParcelas(estado)) if (p.mesFatura >= mes) meses.add(p.mesFatura);

  const lista = [];
  for (const m of [...meses].sort().slice(0, quantas)) {
    for (const c of estado.cartoes || []) {
      const r = resumoFatura(estado, c.id, m);
      if (r.total > 0) lista.push({ ...r, cartao: c.nome, vencimento: c.vencimento });
    }
  }
  return lista;
}
