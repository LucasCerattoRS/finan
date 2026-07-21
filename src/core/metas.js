// metas.js — calculadora de metas financeiras. A partir da RENDA MENSAL (soma dos
// componentes em config.metas.rendaComponentes) e do PATRIMÔNIO INVESTIDO (informado
// à mão — o Finan é offline e não puxa cotação de banco/corretora), calcula três alvos:
//
//   • Reserva de emergência — N meses de GASTO médio (reusa o motor da reserva).
//     Atual = a reserva já acumulada (o earmark de reserva.js). Fica líquida, sem render.
//   • Liberdade financeira — M meses de RENDA guardados como patrimônio.
//   • Viver de dividendos — patrimônio cuja renda passiva (yield a.a.) cobre a renda anual.
//
// Para cada meta: alvo, o que você já tem, quanto falta, o progresso e o prazo estimado
// (em quantos meses você chega, ao seu ritmo de aporte e — nas duas de investimento — com
// juros compostos à taxa anual informada). Puro: sem DOM, sem rede.

import { paraCentavos, paraReais } from './model.js';
import { gastoMedioMensal, reservaAcumulada } from './reserva.js';

// Renda mensal = soma dos componentes (salário, benefícios, bolsa...), em reais.
export function rendaMensal(estado) {
  const comps = estado.config?.metas?.rendaComponentes || [];
  const cent = comps.reduce((s, c) => s + paraCentavos(c.valor), 0);
  return paraReais(cent);
}

// Quantos meses, ao ritmo de `aporteMensal` e com juros compostos à `taxaAnual`, até o
// patrimônio `atual` alcançar o `alvo`. 0 se já alcançou; null se nunca chega (sem aporte
// e sem rendimento que faça o saldo crescer, ou levaria mais de 100 anos — na prática,
// "não chega"). Tudo em centavos por dentro, para não acumular erro de float.
export function mesesParaAlvo(atualReais, alvoReais, aporteMensalReais, taxaAnual = 0) {
  const alvo = paraCentavos(alvoReais);
  let saldo = paraCentavos(atualReais);
  const aporte = paraCentavos(aporteMensalReais);
  if (saldo >= alvo) return 0;
  const taxaMes = taxaAnual > 0 ? Math.pow(1 + taxaAnual, 1 / 12) - 1 : 0;
  for (let m = 1; m <= 1200; m += 1) {
    saldo = Math.round(saldo * (1 + taxaMes)) + aporte;
    if (saldo >= alvo) return m;
  }
  return null; // > 100 anos: sem aporte e sem saldo que renda, o alvo nunca é atingido.
}

// Resumo das três metas + a renda/aporte/patrimônio usados. A UI desenha a partir daqui.
export function resumoMetas(estado) {
  const cfg = estado.config || {};
  const m = cfg.metas || {};
  const renda = rendaMensal(estado);
  const rendaCent = paraCentavos(renda);
  const aporte = Math.max(0, Number(m.aporteMensal) || 0);
  const patrimonio = Math.max(0, Number(m.patrimonioInvestido) || 0);
  const taxaAnual = Math.max(0, Number(m.taxaAnual) || 0);

  // monta o bloco comum de uma meta (alvo/atual/faltam/progresso/prazo).
  const meta = (nome, alvoReais, atualReais, rende) => {
    const alvoCent = paraCentavos(alvoReais);
    const atualCent = paraCentavos(atualReais);
    return {
      nome,
      alvo: paraReais(alvoCent),
      atual: paraReais(atualCent),
      faltam: paraReais(Math.max(alvoCent - atualCent, 0)),
      progresso: alvoCent > 0 ? Math.max(0, Math.min(atualCent / alvoCent, 1)) : 0,
      // reserva fica líquida (não rende); as de investimento crescem à taxa informada.
      prazoMeses: mesesParaAlvo(atualReais, alvoReais, aporte, rende ? taxaAnual : 0),
    };
  };

  // Reserva de emergência: N meses de gasto médio; atual = reserva já acumulada.
  const reservaMetaMeses = Math.max(0, Number(cfg.reservaMetaMeses) || 0);
  const gastoMedio = gastoMedioMensal(estado);
  const reservaAlvo = paraReais(paraCentavos(gastoMedio) * reservaMetaMeses);

  // Liberdade financeira: M meses de renda; atual = patrimônio investido.
  const libMetaMeses = Math.max(0, Number(m.libFinanceiraMeses) || 0);
  const libAlvo = paraReais(rendaCent * libMetaMeses);

  // Viver de dividendos: patrimônio × yield ≥ renda anual -> alvo = renda anual / yield.
  const yieldAnual = Math.max(0, Number(m.dividendosYield) || 0);
  const divAlvo = yieldAnual > 0 ? paraReais(Math.round((rendaCent * 12) / yieldAnual)) : 0;

  return {
    renda,
    aporteMensal: aporte,
    patrimonioInvestido: patrimonio,
    taxaAnual,
    reserva: { metaMeses: reservaMetaMeses, gastoMedio, ...meta('Reserva de emergência', reservaAlvo, reservaAcumulada(estado), false) },
    liberdade: { metaMeses: libMetaMeses, ...meta('Liberdade financeira', libAlvo, patrimonio, true) },
    dividendos: { yield: yieldAnual, ...meta('Viver de dividendos', divAlvo, patrimonio, true) },
  };
}
