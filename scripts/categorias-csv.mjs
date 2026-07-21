// categorias-csv.mjs — o formato da "tabela nome→categoria" que o autor preenche
// em lote (num editor de planilha) em vez de clicar um a um na tela Revisar.
//
// Colunas: destino;qtd;total;tipo;exemplo;categoria;classificacao
//  - destino: a "chave" do agrupamento (quem recebeu, extraída do extrato)
//  - qtd/total/tipo/exemplo: contexto pra decidir (só leitura; a importação ignora)
//  - categoria/classificacao: o que o autor preenche
//
// Separador ';' e UTF-8 com BOM: é o que o Excel/LibreOffice PT-BR abre sem quebrar
// acento (a mesma lição do .ps1). Campos com ';', '"' ou quebra de linha são
// aspeados, e a aspa vira "" — CSV padrão.

export const CABECALHO = ['destino', 'qtd', 'total', 'tipo', 'exemplo', 'categoria', 'classificacao'];
export const BOM = '﻿';

function escapar(v) {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// linhas: array de objetos com as chaves de CABECALHO. Devolve o texto CSV (com BOM).
export function paraCSV(linhas) {
  const monta = (arr) => arr.map(escapar).join(';');
  const corpo = linhas.map((l) => monta(CABECALHO.map((c) => l[c])));
  return BOM + [monta(CABECALHO), ...corpo].join('\r\n') + '\r\n';
}

// Divide o texto em linhas de campos, respeitando aspas (um campo aspeado pode
// conter ';' e quebras de linha).
function parseCampos(texto) {
  const linhas = [];
  let campos = [];
  let campo = '';
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 1; } else dentroAspas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ';') {
      campos.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      campos.push(campo); linhas.push(campos); campos = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || campos.length) { campos.push(campo); linhas.push(campos); }
  return linhas;
}

// Lê o CSV preenchido de volta para objetos. Ignora BOM e linhas vazias.
export function lerCSV(texto) {
  const linhas = parseCampos(String(texto).replace(new RegExp(`^${BOM}`), ''));
  if (!linhas.length) return [];
  const cabecalho = linhas[0].map((h) => h.trim());
  return linhas.slice(1)
    .filter((cols) => cols.some((c) => (c || '').trim() !== ''))
    .map((cols) => {
      const obj = {};
      cabecalho.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim(); });
      return obj;
    });
}
