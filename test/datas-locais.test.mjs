// "Hoje" é o dia do relógio de quem usa o app, não o de Greenwich. Com toISOString(),
// às 23:30 de 31/10 em São Paulo (02:30 UTC de 01/11) o app já achava que era novembro.
// Dados sintéticos; o fuso é fixado aqui para o teste não depender da máquina.
process.env.TZ = 'America/Sao_Paulo';

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/index.js';

const NOITE_DE_31_10 = new Date('2026-10-31T23:30:00-03:00');

test('dataLocalISO/mesLocalISO usam o fuso local, não UTC', () => {
  assert.equal(C.dataLocalISO(NOITE_DE_31_10), '2026-10-31');
  assert.equal(C.mesLocalISO(NOITE_DE_31_10), '2026-10');
});

test('pagamento de fatura sem data registrada à noite cai no dia certo', () => {
  mock.timers.enable({ apis: ['Date'], now: NOITE_DE_31_10 });
  try {
    const e = C.registrarPagamentoFatura(C.estadoInicial(), { cartaoId: 'c1', mesFatura: '2026-10', valor: 10 });
    assert.equal(e.pagamentosFatura[0].data, '2026-10-31');
  } finally {
    mock.timers.reset();
  }
});
