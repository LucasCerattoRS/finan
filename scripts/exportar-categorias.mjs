// exportar-categorias.mjs — gera a tabela nome→categoria dos lançamentos que ainda
// estão sem categoria E têm nome no extrato (só esses podem virar regra). O autor
// preenche as colunas "categoria" e "classificacao" num editor de planilha e depois
// roda `importar-categorias.mjs` — aplica tudo de uma vez e cria as regras.
//
//   node scripts/exportar-categorias.mjs [caminho/do/dados.json] [saida.csv]
//
// Sem argumentos: lê ./dados.json e escreve ./categorias-para-preencher.csv.
// Nada aqui vai pro git — é sua planilha de trabalho, com dados reais.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, gruposParaRevisar } from '../src/core/index.js';
import { paraCSV } from './categorias-csv.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrada = process.argv[2] || path.join(RAIZ, 'dados.json');
const saida = process.argv[3] || path.join(RAIZ, 'categorias-para-preencher.csv');

if (!fs.existsSync(entrada)) {
  console.error(`Não achei o dados.json em: ${entrada}`);
  console.error('Passe o caminho (ex.: o do pendrive): node scripts/exportar-categorias.mjs /caminho/dados.json');
  process.exit(1);
}

const estado = carregar(fs.readFileSync(entrada, 'utf8'));
// Só os grupos NOMEADOS: os anônimos ("PIX SICREDI") não podem virar regra, então
// não adianta pedir categoria pra eles aqui (viraria carimbo em todo Pix futuro).
const grupos = gruposParaRevisar(estado).filter((g) => g.nomeado);

if (!grupos.length) {
  console.log('Nada a exportar: não há lançamentos sem categoria com nome no extrato. 🎉');
  process.exit(0);
}

const linhas = grupos.map((g) => ({
  destino: g.chave,
  qtd: g.n,
  total: (Number(g.total) || 0).toFixed(2),
  tipo: g.tipo,
  exemplo: (g.exemplo || '').slice(0, 60),
  categoria: '',
  classificacao: '',
}));

fs.writeFileSync(saida, paraCSV(linhas), 'utf8');
const totalLanc = grupos.reduce((a, g) => a + g.n, 0);
console.log(`Exportei ${grupos.length} destinos (${totalLanc} lançamentos) para:`);
console.log(`  ${saida}`);
console.log('Preencha as colunas "categoria" e "classificacao" e rode:');
console.log(`  node scripts/importar-categorias.mjs "${entrada}" "${saida}"`);
