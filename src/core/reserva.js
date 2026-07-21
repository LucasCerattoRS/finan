// reserva.js — reserva de emergência (a aba "Reservas PM" da planilha).
// Um aporte é um valor que você separa e que NÃO conta como gasto: é um earmark
// sobre o dinheiro que já está em conta, não uma transação. Por isso o
// "Disponível para gastar" = dinheiro em conta − reserva acumulada (nada é
// contado duas vezes). Valor negativo num movimento = resgate (usou a reserva).
// As mutações (registrar/remover/definir meta) ficam no index.js.

import { paraCentavos, paraReais } from './model.js';
import { resumoMes, mesesComMovimento, dinheiroEmConta } from './calculos.js';

// Reserva acumulada (soma de todos os aportes e resgates), em reais.
export function reservaAcumulada(estado) {
  const cent = (estado.reservas || []).reduce((s, r) => s + paraCentavos(r.valor), 0);
  return paraReais(cent);
}

// Gasto médio mensal — média das saídas dos últimos `n` meses com movimento
// (parcelas incluídas, como no resto do app). É a base da meta "X meses de gasto".
export function gastoMedioMensal(estado, n = 12) {
  const meses = mesesComMovimento(estado).slice(-n);
  if (!meses.length) return 0;
  const cent = meses.reduce((s, m) => s + paraCentavos(resumoMes(estado, m).saidas), 0);
  return paraReais(Math.round(cent / meses.length));
}

// Resumo da reserva para um ano ("YYYY"): total acumulado, o que entrou no ano
// (a "Reserva Anual" da planilha), o disponível para gastar e o progresso da meta
// (metaMeses × gasto médio mensal).
export function resumoReserva(estado, ano) {
  const alvo = String(ano);
  const reservas = estado.reservas || [];
  const totalCent = reservas.reduce((s, r) => s + paraCentavos(r.valor), 0);
  const noAnoCent = reservas
    .filter((r) => String(r.mes).slice(0, 4) === alvo)
    .reduce((s, r) => s + paraCentavos(r.valor), 0);

  const metaMeses = Math.max(0, Number(estado.config?.reservaMetaMeses) || 0);
  const gastoMedio = gastoMedioMensal(estado);
  const metaCent = paraCentavos(gastoMedio) * metaMeses;
  const disponivelCent = paraCentavos(dinheiroEmConta(estado)) - totalCent;

  return {
    ano: alvo,
    total: paraReais(totalCent),
    noAno: paraReais(noAnoCent),
    disponivel: paraReais(disponivelCent),
    metaMeses,
    gastoMedio,
    meta: paraReais(metaCent),
    progresso: metaCent > 0 ? Math.max(0, Math.min(totalCent / metaCent, 1)) : 0,
    faltam: paraReais(Math.max(metaCent - totalCent, 0)),
  };
}
