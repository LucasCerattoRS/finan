// index.js — fachada do núcleo. UI e testes importam daqui.
export * from './model.js';
export * from './faturas.js';
export * from './parcelas.js';
export * from './calculos.js';
export * from './score.js';
export * from './regras.js';
export * from './importar.js';
export * from './faturasPagas.js';
export * from './revisar.js';
export * from './planejamento.js';
export * from './reserva.js';
export * from './metas.js';

import { migrar, estadoInicial, novoId } from './model.js';

// --- Operações de mutação (retornam novo estado; UI persiste depois) ---

export function adicionarTransacao(estado, dados) {
  const tx = { id: novoId('tx'), ...dados };
  return { ...estado, transacoes: [...estado.transacoes, tx] };
}

export function atualizarTransacao(estado, id, patch) {
  return {
    ...estado,
    transacoes: estado.transacoes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function removerTransacao(estado, id) {
  return { ...estado, transacoes: estado.transacoes.filter((t) => t.id !== id) };
}

export function adicionarCartao(estado, dados) {
  const c = { id: novoId('card'), ...dados };
  return { ...estado, cartoes: [...estado.cartoes, c] };
}

export function atualizarCartao(estado, id, patch) {
  return {
    ...estado,
    cartoes: estado.cartoes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function removerCartao(estado, id) {
  return { ...estado, cartoes: estado.cartoes.filter((c) => c.id !== id) };
}

// Registra um pagamento de fatura. `data` é QUANDO o dinheiro saiu — se for antes
// do mês da fatura, é um adiantamento (ver faturasPagas.ehAdiantamento).
export function registrarPagamentoFatura(estado, dados) {
  const p = {
    id: novoId('pag'),
    criadoEm: new Date().toISOString(),
    data: new Date().toISOString().slice(0, 10),
    ...dados,
  };
  return { ...estado, pagamentosFatura: [...estado.pagamentosFatura, p] };
}

// Guarda o total que o BANCO informa para a fatura de um cartão num mês.
// Substitui a de mesmo cartão+mês (reimportar o mesmo print não duplica).
export function definirFatura(estado, dados) {
  const faturas = (estado.faturas || []).filter(
    (f) => !(f.cartaoId === dados.cartaoId && f.mes === dados.mes),
  );
  return { ...estado, faturas: [...faturas, { id: novoId('fat'), fonte: 'banco', ...dados }] };
}

export function removerPagamentoFatura(estado, id) {
  return { ...estado, pagamentosFatura: estado.pagamentosFatura.filter((p) => p.id !== id) };
}

// ---- Planejamento (orçamento por mês/categoria) ----

// Define quanto se PRETENDE gastar numa categoria num mês. Upsert por (mês,
// categoria); estimado <= 0 apaga a meta (não guarda zero). Garante a categoria
// na config, como o categorizarLote faz.
export function definirPlanejamento(estado, { mes, categoria, estimado }) {
  const outros = (estado.planejamentos || []).filter(
    (p) => !(p.mes === mes && p.categoria === categoria),
  );
  const v = Number(estimado) || 0;
  if (v <= 0) return { ...estado, planejamentos: outros };
  let novo = {
    ...estado,
    planejamentos: [...outros, { id: novoId('plan'), mes, categoria, estimado: v }],
  };
  if (categoria && !novo.config.categorias.includes(categoria)) {
    novo = { ...novo, config: { ...novo.config, categorias: [...novo.config.categorias, categoria] } };
  }
  return novo;
}

export function removerPlanejamento(estado, mes, categoria) {
  return {
    ...estado,
    planejamentos: (estado.planejamentos || []).filter(
      (p) => !(p.mes === mes && p.categoria === categoria),
    ),
  };
}

// "Repetir para os demais meses": copia o orçamento de `mesOrigem` para cada mês
// em `mesesDestino`, substituindo no destino apenas as categorias que a origem
// tem (não apaga metas de outras categorias que já existam lá).
export function repetirPlanejamento(estado, mesOrigem, mesesDestino) {
  const origem = (estado.planejamentos || []).filter((p) => p.mes === mesOrigem);
  if (!origem.length) return estado;
  const destinos = new Set((mesesDestino || []).filter((m) => m && m !== mesOrigem));
  const catsOrigem = new Set(origem.map((p) => p.categoria));
  const planejamentos = (estado.planejamentos || []).filter(
    (p) => !(destinos.has(p.mes) && catsOrigem.has(p.categoria)),
  );
  for (const m of destinos) {
    for (const p of origem) {
      planejamentos.push({ id: novoId('plan'), mes: m, categoria: p.categoria, estimado: p.estimado });
    }
  }
  return { ...estado, planejamentos };
}

// ---- Reserva de emergência (aba "Reservas PM") ----

// Registra um movimento de reserva num mês: valor > 0 aporta, valor < 0 resgata.
export function registrarReserva(estado, dados) {
  const r = {
    id: novoId('res'),
    criadoEm: new Date().toISOString(),
    mes: dados.mes,
    valor: Number(dados.valor) || 0,
    obs: dados.obs || '',
  };
  return { ...estado, reservas: [...(estado.reservas || []), r] };
}

export function removerReserva(estado, id) {
  return { ...estado, reservas: (estado.reservas || []).filter((r) => r.id !== id) };
}

// Meta da reserva, em número de meses de gasto médio (0 = sem meta).
export function definirMetaReserva(estado, meses) {
  const m = Math.max(0, Number(meses) || 0);
  return { ...estado, config: { ...estado.config, reservaMetaMeses: m } };
}

// ---- Metas financeiras (calculadora: reserva, liberdade, dividendos) ----

// Atualiza campos da calculadora de metas (merge raso sobre config.metas). A UI passa
// só o que mudou: { rendaComponentes }, { patrimonioInvestido, aporteMensal, ... }.
export function definirMetas(estado, patch) {
  const metas = { ...(estado.config?.metas || {}), ...patch };
  return { ...estado, config: { ...estado.config, metas } };
}

export function importarTransacoes(estado, candidatos) {
  const novas = candidatos
    .filter((c) => c.importar)
    .map((c) => ({
      id: novoId('tx'),
      tipo: c.tipo,
      data: c.data,
      categoria: c.categoria || 'Outros',
      descricao: c.descricao || '',
      valor: c.valor,
      classificacao: c.classificacao || '',
      forma: c.forma || 'Importado',
      fitid: c.fitid || '',
    }));
  return { ...estado, transacoes: [...estado.transacoes, ...novas] };
}

// Aplica categoria/classificação a um lote de lançamentos de uma vez.
// Se `virarRegra` for true, também guarda a regra — o app passa a acertar sozinho.
export function categorizarLote(estado, ids, categoria, classificacao = '', virarRegra = null) {
  const alvo = new Set(ids);
  const transacoes = estado.transacoes.map((t) => (
    alvo.has(t.id) ? { ...t, categoria, classificacao: classificacao || t.classificacao } : t
  ));
  let novo = { ...estado, transacoes };
  if (virarRegra) novo = adicionarRegra(novo, { padrao: virarRegra, categoria, classificacao });
  if (categoria && !novo.config.categorias.includes(categoria)) {
    novo = { ...novo, config: { ...novo.config, categorias: [...novo.config.categorias, categoria] } };
  }
  return novo;
}

export function adicionarRegra(estado, regra) {
  const regras = [...(estado.config.regras || []), regra];
  return { ...estado, config: { ...estado.config, regras } };
}

export function removerRegra(estado, padrao) {
  const regras = (estado.config.regras || []).filter((r) => r.padrao !== padrao);
  return { ...estado, config: { ...estado.config, regras } };
}

// Carrega JSON cru (de arquivo/localStorage) para um estado válido e migrado.
export function carregar(json) {
  if (!json) return estadoInicial();
  const dados = typeof json === 'string' ? JSON.parse(json) : json;
  return migrar(dados);
}
