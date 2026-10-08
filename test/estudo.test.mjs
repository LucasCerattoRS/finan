// Os documentos de docs/estudo/*.explicado.md percorrem o código linha a linha. Este teste
// garante a promessa do README: nenhuma linha do fonte ficou de fora dos blocos de código
// e nenhuma linha de código foi inventada. Mudou o fonte sem mexer no .explicado.md? Falha aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');

// documento(s) -> arquivo-fonte. app.js é explicado em 7 partes.
const MAPA = {
  'src/ui/app.js': [1, 2, 3, 4, 5, 6, 7].map((n) => `app.parte${n}.explicado.md`),
  'src/ui/storage.js': ['storage.explicado.md'],
  'src/ui/charts.js': ['charts.explicado.md'],
  'src/ui/index.html': ['index.html.explicado.md'],
  'src/styles/app.css': ['app.css.explicado.md'],
  'electron/main.js': ['main.explicado.md'],
  'electron/preload.js': ['preload.explicado.md'],
  ...Object.fromEntries(['calculos', 'faturas', 'faturasPagas', 'importar', 'index', 'metas', 'model',
    'parcelas', 'planejamento', 'regras', 'reserva', 'revisar', 'score']
    .map((n) => [`src/core/${n}.js`, [`${n}.explicado.md`]])),
};

const linhasDeCodigo = (texto) => texto.split('\n').map((l) => l.trim()).filter(Boolean);

// Linhas dentro de blocos ``` ... ``` (qualquer linguagem).
function blocos(md) {
  const out = [];
  let dentro = false;
  for (const l of md.split('\n')) {
    if (/^\s*```/.test(l)) { dentro = !dentro; continue; }
    if (dentro) out.push(l);
  }
  return linhasDeCodigo(out.join('\n'));
}

test('todo arquivo-fonte do src/ e electron/ tem documento de estudo', () => {
  const docs = new Set(readdirSync(new URL('docs/estudo/', raiz)));
  for (const [fonte, mds] of Object.entries(MAPA)) {
    for (const md of mds) assert.ok(docs.has(md), `${fonte}: falta docs/estudo/${md}`);
  }
});

// Comentário é explicado em prosa nos documentos, não precisa aparecer em bloco de código.
const ehComentario = (l) => /^(\/\/|\/\*|\*|<!--)/.test(l);
// Espaços normalizados e sem comentário no fim da linha (os documentos às vezes reescrevem o comentário).
const espacos = (l) => l.replace(/\s+\/\/.*$/, '').replace(/\s+/g, ' ').trim();

for (const [fonte, mds] of Object.entries(MAPA)) {
  test(`${fonte}: o explicado cobre cada linha de código e não inventa nenhuma`, () => {
    // No CSS e no HTML, comentário de várias linhas sai inteiro antes da comparação.
    const bruto = fonte.endsWith('.css') ? ler(fonte).replace(/\/\*[\s\S]*?\*\//g, '')
      : fonte.endsWith('.html') ? ler(fonte).replace(/<!--[\s\S]*?-->/g, '') : ler(fonte);
    const doFonte = linhasDeCodigo(bruto).filter((l) => !ehComentario(l));
    const nosDocs = mds.flatMap((md) => blocos(ler(`docs/estudo/${md}`)));
    // Os documentos às vezes juntam linhas curtas numa só ou repetem um trecho para explicá-lo:
    // a comparação é por trecho de texto (espaços normalizados), não por linha idêntica.
    const textoDocs = nosDocs.map(espacos).join(' ');
    const textoFonte = linhasDeCodigo(ler(fonte)).map(espacos).join(' ');
    const faltando = [...new Set(doFonte.filter((l) => !textoDocs.includes(espacos(l))))];
    assert.deepEqual(faltando, [], `linhas de ${fonte} que nenhum bloco de código mostra`);
    // Trecho abreviado com "..." é recorte didático, não linha inventada.
    const inventadas = nosDocs.filter((l) => !ehComentario(l) && pareceCodigo(l, fonte) && !/\.\.\.|…/.test(l)
      && !textoFonte.includes(espacos(l)));
    assert.deepEqual(inventadas, [], `linhas nos blocos de ${mds.join(', ')} que não existem em ${fonte}`);
  });
}

function pareceCodigo(l, fonte) {
  if (fonte.endsWith('.css') || fonte.endsWith('.html')) return false;
  return /^(export |import |const |let |function |async function |return |if \(|} else|for \()/.test(l);
}
