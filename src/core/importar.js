// importar.js — lê extrato de banco/fatura e devolve lançamentos prontos pra revisão.
//
// Aceita OFX (o "Extrato .ofx" que Nubank, Inter, Sicredi e cia exportam) e CSV.
// Não escreve nada: devolve candidatos com categoria sugerida e marca os que já
// existem no estado, pra UI mostrar e o usuário confirmar. Nada entra sem revisão.
//
// Convenção de sinal: no OFX, TRNAMT negativo = saída, positivo = entrada.

import { normalizar, mesDe } from './model.js';
import { categorizar } from './regras.js';

// ---- OFX -------------------------------------------------------------
// OFX 1.x é SGML (tags sem fechar) e 2.x é XML. Em vez de um parser completo,
// varremos os blocos <STMTTRN>…</STMTTRN>, que existem nos dois.
export function parseOFX(texto) {
  const out = [];
  const blocos = String(texto).match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const b of blocos) {
    const tag = (nome) => {
      const m = b.match(new RegExp(`<${nome}>\\s*([^<\r\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const valor = Number(tag('TRNAMT').replace(',', '.'));
    const dataISO = ofxData(tag('DTPOSTED'));
    if (!dataISO || !Number.isFinite(valor) || valor === 0) continue;
    const descricao = (tag('MEMO') || tag('NAME') || '').trim();
    out.push({
      data: dataISO,
      valor: Math.abs(valor),
      descricao,
      tipo: valor < 0 ? 'saida' : 'entrada',
      fitid: tag('FITID'),
    });
  }
  return out;
}

// "20260216120000[-3:BRT]" ou "20260216" -> "2026-02-16"
function ofxData(bruto) {
  const m = String(bruto).match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// ---- CSV -------------------------------------------------------------
// Tolerante de propósito: cada banco exporta um cabeçalho diferente. Achamos as
// colunas pelo nome (data / valor / descrição) em vez de exigir uma ordem fixa.
export function parseCSV(texto) {
  const linhas = String(texto).split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];

  const sep = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], sep).map(normalizar);

  const acha = (...nomes) => cabecalho.findIndex((c) => nomes.some((n) => c.includes(n)));
  const iData = acha('data', 'date');
  const iValor = acha('valor', 'amount', 'quantia');
  const iDesc = acha('descricao', 'title', 'historico', 'estabelecimento', 'lancamento', 'memo');
  // id único do banco, quando vier (Sicredi manda "Identificador"): é dedupe melhor
  // que o hash data+valor+descrição, que confundiria dois Pix iguais no mesmo dia.
  const iId = acha('identificador', 'fitid', 'id da transacao');
  if (iData < 0 || iValor < 0) return [];

  const out = [];
  for (const linha of linhas.slice(1)) {
    const cols = dividirLinha(linha, sep);
    const dataISO = csvData(cols[iData]);
    const valor = csvValor(cols[iValor]);
    if (!dataISO || !valor) continue;
    out.push({
      data: dataISO,
      valor: Math.abs(valor),
      descricao: (iDesc >= 0 ? cols[iDesc] : '').trim(),
      tipo: valor < 0 ? 'saida' : 'entrada',
      fitid: (iId >= 0 ? cols[iId] : '').trim(),
    });
  }
  return out;
}

function detectarSeparador(linha) {
  const cands = [';', ',', '\t'];
  return cands.reduce((a, b) => ((linha.split(b).length > linha.split(a).length) ? b : a), ',');
}

// Divide respeitando aspas ("R$ 1.234,56" com vírgula dentro não quebra a coluna).
function dividirLinha(linha, sep) {
  const out = [];
  let atual = '';
  let dentroAspas = false;
  for (const ch of String(linha)) {
    if (ch === '"') dentroAspas = !dentroAspas;
    else if (ch === sep && !dentroAspas) { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

// Aceita "2026-02-16", "16/02/2026" e "16-02-2026".
function csvData(bruto) {
  const s = String(bruto || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

// Aceita "1.234,56" (BR), "1234.56" (US), "R$ -50,00" e "(50,00)" = negativo.
function csvValor(bruto) {
  let s = String(bruto || '').trim();
  if (!s) return 0;
  const negativo = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[^\d.,]/g, '');
  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, '').replace(',', '.'); // BR
  else s = s.replace(/,/g, ''); // US
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return 0;
  return negativo ? -Math.abs(n) : n;
}

// ---- Entrada única ---------------------------------------------------
export function parseExtrato(texto, nomeArquivo = '') {
  const ehOFX = /\.ofx$/i.test(nomeArquivo) || /<STMTTRN>/i.test(texto);
  return ehOFX ? parseOFX(texto) : parseCSV(texto);
}

// Chave de duplicata: mesma data + mesmo valor + mesma descrição normalizada.
// (o FITID do OFX é melhor, mas nem todo banco manda — então guardamos os dois)
function chave(tx) {
  return `${tx.data}|${Number(tx.valor).toFixed(2)}|${normalizar(tx.descricao)}`;
}

// Prepara os candidatos para a tela de revisão: sugere categoria por regra e
// marca o que já parece estar lançado (pra não duplicar quando reimportar).
export function prepararImportacao(estado, brutos) {
  const jaExistem = new Set((estado.transacoes || []).map(chave));
  const jaImportados = new Set(
    (estado.transacoes || []).filter((t) => t.fitid).map((t) => t.fitid),
  );
  const regras = estado.config?.regras || [];
  const proprias = (estado.config?.contasProprias || []).map(normalizar).filter(Boolean);
  const ehPropria = (desc) => {
    const d = normalizar(desc);
    return proprias.some((p) => d.includes(p));
  };
  // Pagamento de fatura do cartão vindo do extrato: acompanhamento, nunca saída — a
  // parcela já conta no mês da fatura (calculos.js), então contar o pagamento aqui
  // também sairia em dobro. Vira "transferencia" (fora dos totais), igual ao Pix seu.
  const padroesFatura = (estado.config?.padroesFaturaPagamento || []).map(normalizar).filter(Boolean);
  const ehPagamentoFatura = (desc) => {
    const d = normalizar(desc);
    return padroesFatura.some((p) => d.includes(p));
  };

  return brutos.map((b) => {
    // duplicado vem desmarcado por padrão (não reimporta o mesmo lançamento)
    const duplicado = jaExistem.has(chave(b)) || (!!b.fitid && jaImportados.has(b.fitid));
    const base = { ...b, duplicado, importar: !duplicado, mes: mesDe(b.data) };

    // dinheiro seu indo pra você mesmo: registra, mas fora de entradas/saídas
    if (ehPropria(b.descricao)) {
      return {
        ...base, tipo: 'transferencia', categoria: 'Transferência entre contas',
        classificacao: '', reconhecido: true,
      };
    }
    // pagamento de fatura do cartão: idem — fora dos totais, senão conta o gasto 2x
    if (ehPagamentoFatura(b.descricao)) {
      return {
        ...base, tipo: 'transferencia', categoria: 'Fatura',
        classificacao: '', reconhecido: true,
      };
    }
    const sugestao = categorizar(b.descricao, regras);
    return {
      ...base,
      categoria: sugestao?.categoria || '',
      classificacao: sugestao?.classificacao || '',
      reconhecido: !!sugestao,
    };
  });
}

// Resumo pra cabeçalho da tela ("42 lançamentos · 31 categorizados · 4 já existem").
export function resumoImportacao(candidatos) {
  return {
    total: candidatos.length,
    reconhecidos: candidatos.filter((c) => c.reconhecido).length,
    duplicados: candidatos.filter((c) => c.duplicado).length,
    aImportar: candidatos.filter((c) => c.importar).length,
    entradas: candidatos.filter((c) => c.tipo === 'entrada').length,
    saidas: candidatos.filter((c) => c.tipo === 'saida').length,
  };
}
