// revisar.js — agrupa os lançamentos sem categoria por "quem recebeu", pra você
// resolver em lote em vez de um por um.
//
// O extrato brasileiro vem assim:
//   "PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI E LIMA LTDA"  -> tem nome
//   "CARTAO DEBITO - PADARIADATIA - BR"                          -> tem nome
//   "PAGAMENTO PIX SICREDI"                                      -> NÃO tem nome
//
// Quando tem nome, a escolha vira **regra** e o app acerta sozinho para sempre.
// Quando não tem, aplicamos só naqueles lançamentos — criar regra em cima de
// "pagamento pix" carimbaria todo Pix futuro com a mesma categoria.

import { normalizar } from './model.js';

// Verbos do banco que aparecem antes do nome de quem recebeu.
const PREFIXOS = [
  'pagamento pix', 'recebimento pix', 'pagamento de boleto', 'pagamento boleto',
  'cartao debito', 'compra debito', 'pix enviado', 'pix recebido',
  'transferencia enviada', 'transferencia recebida', 'ted', 'doc',
];

// Sobras que NÃO são o nome de quem recebeu — é o banco/sistema falando de si.
// "PAGAMENTO PIX SICREDI" deixa "sicredi": virar regra com isso carimbaria todo
// Pix futuro como se fosse o mesmo destino.
const NAO_E_NOME = new Set([
  'sicredi', 'master', 'mastercard', 'visa', 'elo', 'br', 'ib', 'pf', 'pj',
  'internet pf', 'internet pj', 'ted/ib', 'debito ted/ib', 'doc/ted internet pf',
  'avulsa', 'atm', 'caixa ag', 'sobras',
]);

// Extrai "quem" da descrição. Devolve { chave, nomeado }.
// `nomeado: false` => é só o verbo do banco, sem contraparte: não vira regra.
export function chaveDescricao(descricao) {
  const original = normalizar(descricao);
  if (!original) return { chave: '(sem descrição)', nomeado: false };

  let s = original;
  for (const p of PREFIXOS) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  s = s.replace(/^[\s\-–]+/, '')      // sobrou o traço do "PIX - Fulano"
    .replace(/^\d{11,14}\s*/, '')      // CPF/CNPJ colado no nome
    .replace(/\s*-\s*br$/, '')         // "- BR" do cartão de débito
    .replace(/\s*-\s*$/, '')
    .replace(/\d{6,}/g, '')            // ids longos no meio
    .replace(/\s+/g, ' ')
    .trim();

  // Nada sobrou, ou o que sobrou é o próprio banco => sem contraparte.
  if (s.length < 3 || NAO_E_NOME.has(s)) {
    return { chave: original.slice(0, 40), nomeado: false };
  }
  return { chave: s.slice(0, 40), nomeado: true };
}

// Grupos a revisar, do maior valor pro menor (resolver o topo já resolve a maior parte).
// Só entra o que está sem categoria útil e não é transferência entre contas próprias.
export function gruposParaRevisar(estado, { categoriaVazia = 'Outros' } = {}) {
  const mapa = new Map();
  for (const t of estado.transacoes || []) {
    if (t.tipo === 'transferencia') continue;
    if (t.categoria && t.categoria !== categoriaVazia) continue;

    const { chave, nomeado } = chaveDescricao(t.descricao);
    const id = `${t.tipo}|${chave}`;
    if (!mapa.has(id)) {
      mapa.set(id, {
        chave, nomeado, tipo: t.tipo, n: 0, total: 0, ids: [], exemplo: t.descricao,
      });
    }
    const g = mapa.get(id);
    g.n += 1;
    g.total += Number(t.valor) || 0;
    g.ids.push(t.id);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

// Quantos lançamentos ainda faltam revisar (pro contador da aba).
export function totalARevisar(estado) {
  return gruposParaRevisar(estado).reduce((acc, g) => acc + g.n, 0);
}
