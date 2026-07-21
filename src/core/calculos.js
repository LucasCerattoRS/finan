// calculos.js — totais e saldos (o "Dashboard" da planilha).
// Convenção: quando chega o mês da fatura, as parcelas daquele mês contam
// como saída (é o que efetivamente sai da conta). Saídas diretas (pix,
// dinheiro, débito) contam no mês em que aconteceram.

import { paraCentavos, paraReais, mesDe, somaMeses } from './model.js';
import { todasParcelas } from './parcelas.js';
import { proximasFaturas } from './faturasPagas.js';

// Lista de todos os meses ("YYYY-MM") com algum movimento, em ordem.
export function mesesComMovimento(estado) {
  const set = new Set();
  for (const tx of estado.transacoes || []) {
    if (tx.tipo === 'entrada' || tx.tipo === 'saida') set.add(mesDe(tx.data));
  }
  for (const p of todasParcelas(estado)) set.add(p.mesFatura);
  return [...set].filter(Boolean).sort();
}

// Resumo de um mês ("YYYY-MM").
export function resumoMes(estado, mes) {
  const txs = estado.transacoes || [];
  const entradasCent = somaCent(txs.filter((t) => t.tipo === 'entrada' && mesDe(t.data) === mes), 'valor');
  const saidasDiretasCent = somaCent(txs.filter((t) => t.tipo === 'saida' && mesDe(t.data) === mes), 'valor');
  const faturasCent = somaCent(todasParcelas(estado).filter((p) => p.mesFatura === mes), 'valor');
  const saidasCent = saidasDiretasCent + faturasCent;
  return {
    mes,
    entradas: paraReais(entradasCent),
    saidasDiretas: paraReais(saidasDiretasCent),
    faturas: paraReais(faturasCent),
    saidas: paraReais(saidasCent),
    saldoMes: paraReais(entradasCent - saidasCent),
  };
}

// Saldo acumulado até um mês (inclusive). Se ateMes for omitido, soma tudo.
export function saldoAcumulado(estado, ateMes) {
  return mesesComMovimento(estado)
    .filter((m) => !ateMes || m <= ateMes)
    .reduce((acc, m) => acc + paraCentavos(resumoMes(estado, m).saldoMes), 0) / 100;
}

// "Dinheiro em conta" total (entradas - saídas de todos os meses).
export function dinheiroEmConta(estado) {
  return saldoAcumulado(estado);
}

// Dinheiro já comprometido com faturas que só vencem DEPOIS de `mes`.
// É o "Dinheiro comprometido" da planilha: não saiu da conta ainda, mas já está
// prometido. Desconta o que você já adiantou — pagar antes é justamente reduzir isto.
export function comprometidoFuturo(estado, mes) {
  const cents = proximasFaturas(estado, somaMeses(mes, 1), 36)
    .reduce((acc, f) => acc + paraCentavos(f.restante), 0);
  return paraReais(cents);
}

// Anos ("YYYY") com algum movimento, em ordem.
export function anosComMovimento(estado) {
  return [...new Set(mesesComMovimento(estado).map((m) => m.slice(0, 4)))]
    .filter(Boolean)
    .sort();
}

// Resumo de um ano ("YYYY") — a "Visão Anual" da planilha (Entrada, Saída e a
// Reserva do ano = o que sobrou). Reaproveita resumoMes, então parcelas/faturas
// contam no mês certo e nada é somado duas vezes.
export function resumoAno(estado, ano) {
  const alvo = String(ano);
  let entradasCent = 0; let saidasCent = 0;
  for (const m of mesesComMovimento(estado)) {
    if (m.slice(0, 4) !== alvo) continue;
    const r = resumoMes(estado, m);
    entradasCent += paraCentavos(r.entradas);
    saidasCent += paraCentavos(r.saidas);
  }
  return {
    ano: alvo,
    entradas: paraReais(entradasCent),
    saidas: paraReais(saidasCent),
    reservaAno: paraReais(entradasCent - saidasCent),
  };
}

// Série dos últimos N meses até `mes` (inclusive), para o gráfico de evolução.
// Sempre devolve N pontos — mês sem movimento entra zerado, senão o gráfico mente
// sobre o intervalo de tempo (buraco vira reta).
export function serieMensal(estado, mes, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = somaMeses(mes, -i);
    const r = resumoMes(estado, m);
    out.push({ mes: m, entradas: r.entradas, saidas: r.saidas, saldoMes: r.saldoMes });
  }
  return out;
}

// Gasto por categoria num mês (ou em tudo, se mes omitido). Considera saídas
// diretas e parcelas (pela categoria da compra). Retorna [{categoria, valor}] desc.
export function gastoPorCategoria(estado, mes) {
  const acc = new Map();
  const add = (cat, valor) => acc.set(cat || 'Sem categoria', (acc.get(cat || 'Sem categoria') || 0) + paraCentavos(valor));
  for (const t of estado.transacoes || []) {
    if (t.tipo === 'saida' && (!mes || mesDe(t.data) === mes)) add(t.categoria, t.valor);
  }
  for (const p of todasParcelas(estado)) {
    if (!mes || p.mesFatura === mes) add(p.categoria, p.valor);
  }
  return [...acc.entries()]
    .map(([categoria, cent]) => ({ categoria, valor: paraReais(cent) }))
    .sort((a, b) => b.valor - a.valor);
}

// Proporção Essencial vs Não essencial (em centavos) das saídas de um mês/tudo.
export function essencialVsNao(estado, mes) {
  let ess = 0; let nao = 0;
  const add = (cls, valor) => {
    if (cls === 'Essencial') ess += paraCentavos(valor);
    else if (cls === 'Não essencial') nao += paraCentavos(valor);
  };
  for (const t of estado.transacoes || []) {
    if (t.tipo === 'saida' && (!mes || mesDe(t.data) === mes)) add(t.classificacao, t.valor);
  }
  for (const p of todasParcelas(estado)) {
    if (!mes || p.mesFatura === mes) add(p.classificacao, p.valor);
  }
  return { essencial: paraReais(ess), naoEssencial: paraReais(nao) };
}

function somaCent(lista, campo) {
  return lista.reduce((acc, item) => acc + paraCentavos(item[campo]), 0);
}
