// Dados corrompidos no armazenamento: o app abre vazio, mas não pode gravar por cima.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
};

const storage = await import('../src/ui/storage.js');
const LS = 'finanwise:dados';

test('JSON corrompido: abre vazio, bloqueia o save e não toca no dado original', async () => {
  guardado.set(LS, '{"transacoes": [ quebrado');
  const estado = await storage.carregarEstado();
  assert.deepEqual(estado.transacoes, [], "abre vazio");
  assert.match(storage.falhaDeLeitura(), /JSON|Unexpected|Expected/i);
  await assert.rejects(storage.salvarEstado(estado), /Gravação bloqueada/);
  assert.equal(guardado.get(LS), '{"transacoes": [ quebrado', 'o dado original continua lá');
});

test('liberarGravacao (importar backup) volta a permitir o save', async () => {
  storage.liberarGravacao();
  assert.equal(storage.falhaDeLeitura(), null);
  const { estadoInicial } = await import('../src/core/index.js');
  await storage.salvarEstado(estadoInicial());
  assert.doesNotThrow(() => JSON.parse(guardado.get(LS)));
});

test('dado válido: nenhuma trava', async () => {
  const { estadoInicial } = await import('../src/core/index.js');
  guardado.set(LS, JSON.stringify(estadoInicial()));
  await storage.carregarEstado();
  assert.equal(storage.falhaDeLeitura(), null);
});

test('JSON válido mas que não é um objeto de dados também bloqueia o save', async () => {
  for (const lixo of ['[]', 'null', '123', '"texto"']) {
    storage.liberarGravacao();
    guardado.set(LS, lixo);
    const estado = await storage.carregarEstado();
    assert.deepEqual(estado.transacoes, [], `abre vazio com ${lixo}`);
    assert.ok(storage.falhaDeLeitura(), `trava com ${lixo}`);
    await assert.rejects(storage.salvarEstado(estado), /Gravação bloqueada/);
    assert.equal(guardado.get(LS), lixo, 'o dado original continua lá');
  }
  storage.liberarGravacao();
});
