// score.js — Score de saúde financeira (0–100), como na planilha (74 = "Saudável").
// Composto por 3 pilares, cada um 0..1, ponderados:
//   - saldo (40%): saldo do mês positivo em relação às entradas.
//   - essencialidade (35%): quanto das saídas é Essencial.
//   - comprometimento futuro (25%): quanto das entradas do mês já está
//     comprometido com parcelas futuras (quanto menor, melhor).

import { resumoMes, essencialVsNao } from './calculos.js';
import { todasParcelas } from './parcelas.js';
import { paraCentavos } from './model.js';

export function faixaScore(score) {
  if (score >= 80) return 'Excelente';
  if (score >= 65) return 'Saudável';
  if (score >= 45) return 'Atenção';
  return 'Crítico';
}

export function scoreSaude(estado, mes) {
  const r = resumoMes(estado, mes);
  const entradasCent = paraCentavos(r.entradas);

  // Pilar 1: saldo. saldoMes/entradas, saturado em [0,1].
  let pSaldo;
  if (entradasCent <= 0) {
    pSaldo = r.saldoMes >= 0 ? 0.5 : 0;
  } else {
    pSaldo = clamp(paraCentavos(r.saldoMes) / entradasCent, 0, 1);
  }

  // Pilar 2: essencialidade das saídas.
  const { essencial, naoEssencial } = essencialVsNao(estado, mes);
  const totalCls = paraCentavos(essencial) + paraCentavos(naoEssencial);
  const pEssencial = totalCls > 0 ? paraCentavos(essencial) / totalCls : 0.7;

  // Pilar 3: comprometimento futuro (parcelas que vencem depois deste mês).
  const futurasCent = todasParcelas(estado)
    .filter((p) => p.mesFatura > mes)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  let pFuturo;
  if (entradasCent <= 0) {
    pFuturo = futurasCent > 0 ? 0.3 : 0.7;
  } else {
    pFuturo = clamp(1 - futurasCent / entradasCent, 0, 1);
  }

  const score = Math.round((pSaldo * 0.40 + pEssencial * 0.35 + pFuturo * 0.25) * 100);
  return {
    score,
    faixa: faixaScore(score),
    pilares: {
      saldo: Math.round(pSaldo * 100),
      essencialidade: Math.round(pEssencial * 100),
      comprometimentoFuturo: Math.round(pFuturo * 100),
    },
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
