import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoInicial, somaMeses, mesDe, rotuloMes,
  mesPrimeiraFatura, parcelasDaTransacao, todasParcelas,
  resumoMes, dinheiroEmConta, scoreSaude,
  resumoAno, anosComMovimento,
  adicionarCartao, adicionarTransacao, carregar,
  definirPlanejamento, removerPlanejamento, repetirPlanejamento, planejamentoDoMes,
  registrarReserva, removerReserva, definirMetaReserva,
  resumoReserva, reservaAcumulada, gastoMedioMensal,
  definirMetas, rendaMensal, resumoMetas, mesesParaAlvo,
} from '../src/core/index.js';

test('somaMeses vira o ano corretamente', () => {
  assert.equal(somaMeses('2026-11', 3), '2027-02');
  assert.equal(somaMeses('2026-01', 0), '2026-01');
  assert.equal(somaMeses('2026-12', 1), '2027-01');
});

test('mesDe e rotuloMes', () => {
  assert.equal(mesDe('2026-02-16'), '2026-02');
  assert.equal(rotuloMes('2026-02'), 'Fevereiro 2026');
});

test('mesPrimeiraFatura respeita o fechamento', () => {
  const cartao = { fechamento: 25, vencimento: 10 };
  // dia 16 <= 25 -> fatura do mês seguinte
  assert.equal(mesPrimeiraFatura('2026-02-16', cartao), '2026-03');
  // dia 26 > 25 -> pula um mês
  assert.equal(mesPrimeiraFatura('2026-02-26', cartao), '2026-04');
});

test('parcelas somam exatamente o valor da compra (resíduo na última)', () => {
  const cartao = { id: 'c1', fechamento: 25, vencimento: 10 };
  const tx = {
    id: 't1', tipo: 'cartao', data: '2026-02-16',
    categoria: 'Notebook', valor: 100, cartaoId: 'c1', parcelas: 3,
  };
  const ps = parcelasDaTransacao(tx, cartao);
  assert.equal(ps.length, 3);
  const soma = ps.reduce((a, p) => a + Math.round(p.valor * 100), 0);
  assert.equal(soma, 10000); // R$ 100,00 em centavos
  // meses consecutivos a partir da 1ª fatura
  assert.deepEqual(ps.map((p) => p.mesFatura), ['2026-03', '2026-04', '2026-05']);
  // 100/3 = 33,33 + 33,33 + 33,34
  assert.equal(ps[2].valor, 33.34);
});

test('resumoMes: entradas, saídas diretas e fatura', () => {
  let e = estadoInicial();
  e = adicionarCartao(e, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartaoId = e.cartoes[0].id;
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-02-06', categoria: 'Salário', valor: 3000, classificacao: 'Essencial' });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 200, forma: 'Pix', classificacao: 'Essencial' });
  e = adicionarTransacao(e, { tipo: 'cartao', data: '2026-02-16', categoria: 'Fone', valor: 300, cartaoId, parcelas: 3, classificacao: 'Não essencial' });

  const fev = resumoMes(e, '2026-02');
  assert.equal(fev.entradas, 3000);
  assert.equal(fev.saidasDiretas, 200);
  assert.equal(fev.faturas, 0); // fatura do fone só cai em março
  assert.equal(fev.saldoMes, 2800);

  const mar = resumoMes(e, '2026-03');
  assert.equal(mar.faturas, 100); // 1ª parcela de 300/3
  assert.equal(todasParcelas(e).length, 3);
});

test('resumoAno soma o ano e a parcela cai no ano da fatura', () => {
  let e = estadoInicial();
  e = adicionarCartao(e, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartaoId = e.cartoes[0].id;
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-03-05', categoria: 'Salário', valor: 5000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-04-10', categoria: 'Mercado', valor: 1200, forma: 'Pix' });
  // compra em dez/2026 em 2x: 1ª fatura jan/2027, 2ª fev/2027 -> cai no ano seguinte
  e = adicionarTransacao(e, { tipo: 'cartao', data: '2026-12-26', categoria: 'Fone', valor: 400, cartaoId, parcelas: 2 });

  const r2026 = resumoAno(e, '2026');
  assert.equal(r2026.entradas, 5000);
  assert.equal(r2026.saidas, 1200); // as parcelas do fone NÃO estão em 2026
  assert.equal(r2026.reservaAno, 3800);

  const r2027 = resumoAno(e, '2027');
  assert.equal(r2027.entradas, 0);
  assert.equal(r2027.saidas, 400); // as 2 parcelas do fone caem em jan+fev/2027
  assert.equal(r2027.reservaAno, -400);

  assert.deepEqual(anosComMovimento(e), ['2026', '2027']);
});

test('dinheiroEmConta acumula todos os meses', () => {
  let e = estadoInicial();
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-01-05', categoria: 'Salário', valor: 1000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-05', categoria: 'Mercado', valor: 300, forma: 'Pix' });
  assert.equal(dinheiroEmConta(e), 700);
});

test('scoreSaude devolve 0..100 e faixa', () => {
  let e = estadoInicial();
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-02-06', categoria: 'Salário', valor: 3000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 500, classificacao: 'Essencial' });
  const s = scoreSaude(e, '2026-02');
  assert.ok(s.score >= 0 && s.score <= 100);
  assert.ok(typeof s.faixa === 'string');
});

test('carregar migra JSON cru e ignora lixo', () => {
  const e = carregar('{"transacoes":[{"id":"x","tipo":"entrada","data":"2026-02-01","valor":10}],"lixo":123}');
  assert.equal(e.schemaVersion, 1);
  assert.equal(e.transacoes.length, 1);
  assert.ok(Array.isArray(e.cartoes));
  assert.ok(Array.isArray(e.planejamentos)); // campo novo entra vazio em dados antigos
});

test('definirPlanejamento faz upsert e estimado<=0 apaga a meta', () => {
  let e = estadoInicial();
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Mercado', estimado: 800 });
  assert.equal(e.planejamentos.length, 1);
  assert.equal(e.planejamentos[0].estimado, 800);
  // redefinir a mesma categoria/mês substitui (não duplica)
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Mercado', estimado: 900 });
  assert.equal(e.planejamentos.length, 1);
  assert.equal(e.planejamentos[0].estimado, 900);
  // outra categoria coexiste
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Lazer', estimado: 200 });
  assert.equal(e.planejamentos.length, 2);
  // estimado 0 remove a meta
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Mercado', estimado: 0 });
  assert.equal(e.planejamentos.length, 1);
  assert.equal(e.planejamentos[0].categoria, 'Lazer');
  // remover explicitamente
  e = removerPlanejamento(e, '2026-07', 'Lazer');
  assert.equal(e.planejamentos.length, 0);
});

test('planejamentoDoMes compara estimado x real (parcelas incluídas)', () => {
  let e = estadoInicial();
  e = adicionarCartao(e, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartaoId = e.cartoes[0].id;
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 500, forma: 'Pix' });
  e = adicionarTransacao(e, { tipo: 'cartao', data: '2026-02-16', categoria: 'Fone', valor: 300, cartaoId, parcelas: 3 });
  e = definirPlanejamento(e, { mes: '2026-02', categoria: 'Mercado', estimado: 800 });

  const fev = planejamentoDoMes(e, '2026-02');
  const merc = fev.itens.find((i) => i.categoria === 'Mercado');
  assert.equal(merc.estimado, 800);
  assert.equal(merc.real, 500);        // só a saída direta; a fatura do Fone cai em março
  assert.equal(merc.diferenca, 300);   // ainda cabe 300
  assert.equal(merc.planejado, true);
  assert.equal(fev.totalEstimado, 800);
  assert.equal(fev.totalReal, 500);
  assert.equal(fev.diferenca, 300);

  // março: a 1ª parcela do Fone vira REAL sem meta (aparece, diferença negativa)
  const mar = planejamentoDoMes(e, '2026-03');
  const fone = mar.itens.find((i) => i.categoria === 'Fone');
  assert.equal(fone.real, 100);
  assert.equal(fone.planejado, false);
  assert.equal(fone.diferenca, -100);
});

test('repetirPlanejamento leva o orçamento para os outros meses sem duplicar', () => {
  let e = estadoInicial();
  e = definirPlanejamento(e, { mes: '2026-01', categoria: 'Mercado', estimado: 800 });
  e = definirPlanejamento(e, { mes: '2026-01', categoria: 'Lazer', estimado: 200 });
  e = repetirPlanejamento(e, '2026-01', ['2026-02', '2026-03']);
  assert.equal(planejamentoDoMes(e, '2026-02').totalEstimado, 1000);
  assert.equal(planejamentoDoMes(e, '2026-03').totalEstimado, 1000);
  assert.equal(planejamentoDoMes(e, '2026-01').totalEstimado, 1000); // origem intacta

  // repetir de novo com Mercado alterado substitui no destino, não soma em cima
  e = definirPlanejamento(e, { mes: '2026-01', categoria: 'Mercado', estimado: 900 });
  e = repetirPlanejamento(e, '2026-01', ['2026-02']);
  assert.equal(planejamentoDoMes(e, '2026-02').totalEstimado, 1100); // 900 + 200
  assert.equal(e.planejamentos.filter((p) => p.mes === '2026-02').length, 2);
});

test('reserva: aportes e resgates acumulam (resgate é valor negativo)', () => {
  let e = estadoInicial();
  e = registrarReserva(e, { mes: '2026-01', valor: 500 });
  e = registrarReserva(e, { mes: '2026-02', valor: 300, obs: 'sobrou do mês' });
  assert.equal(reservaAcumulada(e), 800);
  // resgate: valor negativo tira da reserva (usou o dinheiro guardado)
  e = registrarReserva(e, { mes: '2026-03', valor: -200 });
  assert.equal(reservaAcumulada(e), 600);
  assert.equal(e.reservas.length, 3);
  assert.equal(e.reservas[1].obs, 'sobrou do mês');
  assert.ok(e.reservas[0].id && e.reservas[0].criadoEm); // carimba id e data
  // remover um movimento pelo id
  const idJan = e.reservas[0].id;
  e = removerReserva(e, idJan);
  assert.equal(reservaAcumulada(e), 100); // 300 - 200
  assert.equal(e.reservas.length, 2);
});

test('resumoReserva: disponível = conta − reserva; meta = meses × gasto médio', () => {
  let e = estadoInicial();
  // dois meses com gasto (média 1500) — base da meta "X meses de gasto"
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-01-05', categoria: 'Salário', valor: 5000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-01-10', categoria: 'Mercado', valor: 1000, forma: 'Pix' });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 2000, forma: 'Pix' });
  assert.equal(gastoMedioMensal(e), 1500);

  e = registrarReserva(e, { mes: '2026-01', valor: 500 });
  e = registrarReserva(e, { mes: '2026-06', valor: 300 });
  e = registrarReserva(e, { mes: '2027-01', valor: 1000 }); // aporte de outro ano

  const r = resumoReserva(e, '2026');
  assert.equal(r.total, 1800);      // 500 + 300 + 1000 (acumulado, todos os anos)
  assert.equal(r.noAno, 800);       // só 2026: 500 + 300 (a "Reserva Anual" da planilha)
  // reserva é earmark, não transação: NÃO muda o dinheiro em conta (5000 − 3000 = 2000)
  assert.equal(r.disponivel, 200);  // 2000 − 1800
  assert.equal(r.metaMeses, 6);     // default do CONFIG_PADRAO
  assert.equal(r.gastoMedio, 1500);
  assert.equal(r.meta, 9000);       // 6 × 1500
  assert.equal(r.faltam, 7200);     // 9000 − 1800

  // mudar a meta recalcula; negativa vira 0 (= sem meta, sem progresso)
  e = definirMetaReserva(e, 3);
  assert.equal(e.config.reservaMetaMeses, 3);
  assert.equal(resumoReserva(e, '2026').meta, 4500);
  e = definirMetaReserva(e, -5);
  assert.equal(e.config.reservaMetaMeses, 0);
  const semMeta = resumoReserva(e, '2026');
  assert.equal(semMeta.meta, 0);
  assert.equal(semMeta.progresso, 0);
  assert.equal(semMeta.faltam, 0);
});

test('rendaMensal soma os componentes; definirMetas faz merge raso', () => {
  let e = estadoInicial();
  assert.equal(rendaMensal(e), 0); // default neutro (sem dado real no repo)
  e = definirMetas(e, { rendaComponentes: [
    { nome: 'Salário', valor: 3250 },
    { nome: 'Vale alimentação', valor: 250 },
    { nome: 'Mensalidade curso', valor: 400 },
  ] });
  assert.equal(rendaMensal(e), 3900);
  // merge raso: mexer no patrimônio não apaga rendaComponentes
  e = definirMetas(e, { patrimonioInvestido: 2000 });
  assert.equal(rendaMensal(e), 3900);
  assert.equal(e.config.metas.patrimonioInvestido, 2000);
});

test('mesesParaAlvo: já atingiu = 0; sem aporte nem juros = null; com aporte conta', () => {
  assert.equal(mesesParaAlvo(1000, 1000, 0, 0), 0);   // já no alvo
  assert.equal(mesesParaAlvo(1200, 1000, 0, 0), 0);   // passou do alvo
  assert.equal(mesesParaAlvo(0, 5000, 0, 0), null);   // parado: nunca chega
  assert.equal(mesesParaAlvo(0, 1000, 100, 0), 10);   // 10 aportes de 100, sem juros
  assert.equal(mesesParaAlvo(500, 1000, 100, 0), 5);  // já tinha 500
  // com juros compostos chega mais rápido que o linear (500 → 1000, 100/mês, 12% a.a.)
  assert.ok(mesesParaAlvo(500, 1000, 100, 0.12) <= 5);
});

test('resumoMetas: alvos de reserva (gasto), liberdade (renda) e dividendos (yield)', () => {
  let e = estadoInicial();
  // gasto médio de 1000/mês (base da reserva); reserva já com 600 guardados
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-01-10', categoria: 'Mercado', valor: 1000, forma: 'Pix' });
  e = registrarReserva(e, { mes: '2026-01', valor: 600 });
  // renda 3900/mês, patrimônio 2000, dividendos a 10% a.a., liberdade = 6 meses de renda
  e = definirMetas(e, {
    rendaComponentes: [{ nome: 'Salário', valor: 3900 }],
    patrimonioInvestido: 2000,
    aporteMensal: 500,
  });

  const m = resumoMetas(e);
  assert.equal(m.renda, 3900);

  // reserva: 6 × gasto médio (1000) = 6000; já tem 600 (o earmark), faltam 5400
  assert.equal(m.reserva.metaMeses, 6);
  assert.equal(m.reserva.gastoMedio, 1000);
  assert.equal(m.reserva.alvo, 6000);
  assert.equal(m.reserva.atual, 600);
  assert.equal(m.reserva.faltam, 5400);

  // liberdade: 6 meses de renda = 23400; atual = patrimônio 2000
  assert.equal(m.liberdade.metaMeses, 6);
  assert.equal(m.liberdade.alvo, 23400);
  assert.equal(m.liberdade.atual, 2000);
  assert.equal(m.liberdade.faltam, 21400);

  // dividendos: renda anual (46800) / 10% = 468000; atual = patrimônio 2000
  assert.equal(m.dividendos.yield, 0.10);
  assert.equal(m.dividendos.alvo, 468000);
  assert.equal(m.dividendos.atual, 2000);
  assert.equal(m.dividendos.faltam, 466000);
  assert.ok(m.dividendos.progresso > 0 && m.dividendos.progresso < 1);

  // yield 0 não divide por zero: alvo 0
  e = definirMetas(e, { dividendosYield: 0 });
  assert.equal(resumoMetas(e).dividendos.alvo, 0);
});

test('migrar preserva campos que a versão atual ainda não conhece (build velho não apaga dado novo)', () => {
  // Cenário real: o Finan.exe do pendrive fica pra trás da máquina que buildou por
  // último. Se ele reconstruísse o estado só com a lista de campos que conhece, os
  // blocos mais novos sumiriam na primeira gravação — sem erro nenhum.
  const doFuturo = {
    ...estadoInicial(),
    transacoes: [{ id: 'a', tipo: 'saida', valor: 10, data: '2026-07-01', descricao: 'x' }],
    investimentos: [{ id: 'i1', ticker: 'XPTO', cotas: 3 }], // bloco que ainda não existe
  };

  const e = carregar(JSON.stringify(doFuturo));

  assert.deepEqual(e.investimentos, doFuturo.investimentos, 'bloco desconhecido tem que sobreviver');
  assert.equal(e.transacoes.length, 1, 'o que já é conhecido continua funcionando');
  // e o round-trip (carregar → salvar → carregar) não pode perder nada
  assert.deepEqual(carregar(JSON.stringify(e)).investimentos, doFuturo.investimentos);
});

test('migrar continua saneando campo conhecido com lixo (o preserve não abriu buraco)', () => {
  const e = carregar(JSON.stringify({ transacoes: 'nao é array', faturas: null, config: { moeda: 'BRL' } }));
  assert.deepEqual(e.transacoes, []);
  assert.deepEqual(e.faturas, []);
  assert.equal(e.config.moeda, 'BRL');
  assert.equal(e.schemaVersion, estadoInicial().schemaVersion);
});
