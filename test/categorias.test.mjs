import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paraCSV, lerCSV, CABECALHO, BOM } from '../scripts/categorias-csv.mjs';

test('CSV: cabeçalho, BOM e separador ;', () => {
  const texto = paraCSV([{ destino: 'padaria da tia', qtd: 3, total: '45.00', tipo: 'saida', exemplo: 'CARTAO DEBITO PADARIADATIA', categoria: '', classificacao: '' }]);
  assert.ok(texto.startsWith(BOM), 'começa com BOM (Excel PT-BR)');
  assert.ok(texto.includes(CABECALHO.join(';')), 'tem o cabeçalho');
  assert.ok(texto.includes('padaria da tia;3;45.00;saida'), 'linha com ; como separador');
});

test('CSV: escapa ; aspas e quebra de linha, e o round-trip preserva', () => {
  const original = [
    { destino: 'loja; com ponto e vírgula', qtd: 1, total: '10.00', tipo: 'saida', exemplo: 'diz "olá"\nsegunda linha', categoria: 'Outros', classificacao: 'Não essencial' },
    { destino: 'fulano', qtd: 2, total: '20.00', tipo: 'entrada', exemplo: 'PIX FULANO', categoria: '', classificacao: '' },
  ];
  const lido = lerCSV(paraCSV(original));
  assert.equal(lido.length, 2);
  assert.equal(lido[0].destino, 'loja; com ponto e vírgula');
  assert.equal(lido[0].exemplo, 'diz "olá"\nsegunda linha');
  assert.equal(lido[0].categoria, 'Outros');
  assert.equal(lido[1].destino, 'fulano');
  assert.equal(lido[1].categoria, ''); // em branco continua em branco
});

test('CSV: lerCSV ignora linhas vazias e BOM na entrada', () => {
  const texto = `${BOM}destino;qtd;total;tipo;exemplo;categoria;classificacao\r\nfulano;1;5.00;saida;PIX;Mercado;\r\n\r\n`;
  const lido = lerCSV(texto);
  assert.equal(lido.length, 1);
  assert.equal(lido[0].categoria, 'Mercado');
});
