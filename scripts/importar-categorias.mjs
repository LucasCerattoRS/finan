// importar-categorias.mjs — lê a tabela preenchida e aplica as categorias em lote,
// criando uma regra para cada destino (assim o app acerta esses nomes para sempre).
// Grava o dados.json com backup atômico (tmp + rename), igual ao Electron.
//
//   node scripts/importar-categorias.mjs [dados.json] [tabela.csv]
//
// Só age nas linhas com "categoria" preenchida. O que ficou em branco é ignorado —
// dá pra preencher aos poucos e rodar de novo. Reaproveita o MESMO agrupamento da
// tela Revisar, então os ids estão sempre atualizados.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, gruposParaRevisar, categorizarLote } from '../src/core/index.js';
import { lerCSV } from './categorias-csv.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arqDados = process.argv[2] || path.join(RAIZ, 'dados.json');
const arqCSV = process.argv[3] || path.join(RAIZ, 'categorias-para-preencher.csv');

for (const [rotulo, p] of [['dados.json', arqDados], ['tabela CSV', arqCSV]]) {
  if (!fs.existsSync(p)) { console.error(`Não achei ${rotulo} em: ${p}`); process.exit(1); }
}

let estado = carregar(fs.readFileSync(arqDados, 'utf8'));
const preenchidas = lerCSV(fs.readFileSync(arqCSV, 'utf8')).filter((l) => l.categoria);

if (!preenchidas.length) {
  console.log('Nenhuma linha com "categoria" preenchida na tabela — nada a fazer.');
  process.exit(0);
}

// Mapa destino->grupo do estado ATUAL (ids frescos).
const porDestino = new Map(gruposParaRevisar(estado).map((g) => [g.chave, g]));

let destinos = 0; let lancamentos = 0; let regras = 0;
const semGrupo = [];
for (const linha of preenchidas) {
  const g = porDestino.get(linha.destino);
  if (!g) { semGrupo.push(linha.destino); continue; }
  // grupo nomeado => a escolha vira regra (chave); senão só aplica nos ids.
  estado = categorizarLote(estado, g.ids, linha.categoria, linha.classificacao || '', g.nomeado ? g.chave : null);
  destinos += 1;
  lancamentos += g.ids.length;
  if (g.nomeado) regras += 1;
}

// Grava com backup atômico (não corrompe se cair no meio).
const tmp = `${arqDados}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(estado, null, 2), 'utf8');
if (fs.existsSync(arqDados)) {
  try { fs.copyFileSync(arqDados, `${arqDados}.backup`); } catch { /* ignore */ }
}
fs.renameSync(tmp, arqDados);

console.log(`Aplicado: ${destinos} destinos, ${lancamentos} lançamentos categorizados, ${regras} regras criadas.`);
console.log(`dados.json gravado (backup em ${path.basename(arqDados)}.backup).`);
if (semGrupo.length) {
  console.log(`\n${semGrupo.length} destino(s) da tabela não bateram com nenhum grupo (já categorizados ou nome mudou):`);
  semGrupo.slice(0, 10).forEach((d) => console.log(`  - ${d}`));
}
