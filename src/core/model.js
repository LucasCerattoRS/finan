// model.js — schema, estado inicial, migração e helpers puros.
// Sem DOM, sem Node: roda igual no navegador, no Electron e nos testes.

export const SCHEMA_VERSION = 1;

export const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Categorias/listas iniciais (herdadas da planilha FinanWise 2026).
export const CONFIG_PADRAO = {
  moeda: 'BRL',
  categorias: [
    'Salário', 'Vale Alimentação', 'Investimento', 'Saque Investimento',
    'Venda', 'Mercado', 'Alimentação', 'Padaria', 'Farmácia', 'Saúde',
    'Psicanálise', 'Transporte', 'Gasolina', 'Assinaturas', 'Lazer',
    'Educação', 'Vestuário', 'Casa', 'Fatura', 'Tarifas bancárias',
    'Saque', 'Impostos', 'Transferência entre contas', 'Outros',
  ],
  formasPagamento: [
    'Pix', 'Dinheiro', 'Transferência bancária', 'Débito', 'Boleto', 'Cartão',
  ],
  classificacoes: ['Essencial', 'Não essencial'],
  // meta da reserva de emergência, em meses de gasto médio (a "Reserva PM" da planilha)
  reservaMetaMeses: 6,
  // calculadora de metas (ver metas.js). Valores em branco/zero de propósito: os números
  // reais (renda, patrimônio) o usuário preenche na tela — não entram no git.
  metas: {
    // componentes da renda mensal (salário, benefícios, bolsa...); a soma é a renda.
    rendaComponentes: [{ nome: 'Salário', valor: 0 }],
    patrimonioInvestido: 0, // quanto já está investido (informado à mão — app é offline)
    aporteMensal: 0,        // quanto se guarda/investe por mês (ritmo rumo às metas)
    taxaAnual: 0.10,        // rendimento anual esperado dos investimentos (projeção de prazo)
    libFinanceiraMeses: 6,  // "liberdade financeira" = ter N meses de renda guardados
    dividendosYield: 0.10,  // "viver de dividendos" = renda passiva ≥ renda, a este yield a.a.
  },
  regras: [], // regras de categorização do usuário (ver regras.js)
  // Textos que identificam VOCÊ no extrato (CPF, nome). Um Pix seu para você
  // mesmo (BTG -> Sicredi) não é ganho nem gasto: vira tipo "transferencia" e
  // fica fora dos totais, senão os dois lados incham.
  contasProprias: [],
  // Descrições de PAGAMENTO DE FATURA do cartão no extrato. Isso NÃO é gasto novo:
  // a parcela já conta como saída no mês da fatura (calculos.js). Se o pagamento do
  // extrato contasse também, o mesmo dinheiro sairia duas vezes. Na importação vira
  // "transferencia" (fora dos totais). Casa por trecho, sem acento/caixa; editável.
  padroesFaturaPagamento: ['pagamento de fatura', 'pagamento fatura', 'pagto fatura'],
};

// Estado vazio (começar do zero: só estrutura + categorias, sem transações).
export function estadoInicial() {
  return {
    schemaVersion: SCHEMA_VERSION,
    config: structuredCloneSafe(CONFIG_PADRAO),
    cartoes: [],
    transacoes: [],
    pagamentosFatura: [],
    // faturas informadas pelo banco (quando você não lançou as compras uma a uma):
    // { id, cartaoId, mes: "2026-08", total, fonte: "banco" }
    faturas: [],
    // orçamento por mês/categoria (a aba "Planejamento PM" da planilha):
    // { id, mes: "2026-07", categoria: "Mercado", estimado: 800.00 }
    planejamentos: [],
    // reserva de emergência (a aba "Reservas PM"): movimentos de guardar/resgatar.
    // { id, mes: "2026-07", valor: 500.00 (>0 aporta, <0 resgata), obs, criadoEm }
    reservas: [],
  };
}

// ---- IDs -------------------------------------------------------------
let _contador = 0;
export function novoId(prefixo = 'id') {
  _contador += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefixo}_${Date.now().toString(36)}${_contador.toString(36)}${rnd}`;
}

// ---- Dinheiro (evita erro de float somando em centavos) --------------
export function paraCentavos(reais) {
  return Math.round(Number(reais) * 100);
}
export function paraReais(centavos) {
  return centavos / 100;
}
export function somaCentavos(valores) {
  return valores.reduce((acc, v) => acc + paraCentavos(v), 0);
}
export function formatarBRL(reais) {
  const n = Number(reais) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---- Texto -----------------------------------------------------------
// Tira acento, caixa e espaço extra. Usado para comparar descrição de extrato
// com regra de categorização ("Farmácia" casa com "FARMACIA SAO JOAO").
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ---- Datas -----------------------------------------------------------
// mesDe("2026-02-16") -> "2026-02"
export function mesDe(dataISO) {
  return String(dataISO).slice(0, 7);
}
// rotuloMes("2026-02") -> "Fevereiro 2026"
export function rotuloMes(mesISO) {
  const [ano, mes] = String(mesISO).split('-').map(Number);
  return `${MESES_PT[(mes || 1) - 1]} ${ano || ''}`.trim();
}
// somaMeses("2026-11", 3) -> "2027-02"
export function somaMeses(mesISO, n) {
  let [ano, mes] = String(mesISO).split('-').map(Number);
  const total = (ano * 12 + (mes - 1)) + n;
  const nAno = Math.floor(total / 12);
  const nMes = (total % 12) + 1;
  return `${nAno}-${String(nMes).padStart(2, '0')}`;
}

// ---- Migração --------------------------------------------------------
// Recebe qualquer JSON carregado e devolve um estado no schema atual.
export function migrar(dados) {
  const base = estadoInicial();
  if (!dados || typeof dados !== 'object') return base;
  const out = {
    // Preserva campos DESCONHECIDOS do arquivo. Sem isso, uma versão antiga do app
    // (o .exe do pendrive costuma ficar pra trás da máquina que buildou por último)
    // lê o dados.json novo, não reconhece os blocos que ainda não existiam nela e os
    // descarta em silêncio na primeira gravação. Aconteceria com planejamentos/reservas
    // se o build de 14/07/2026 abrisse este arquivo. Campo novo sobrevive a build velho.
    ...dados,
    schemaVersion: SCHEMA_VERSION,
    config: { ...base.config, ...(dados.config || {}) },
    cartoes: Array.isArray(dados.cartoes) ? dados.cartoes : [],
    transacoes: Array.isArray(dados.transacoes) ? dados.transacoes : [],
    pagamentosFatura: Array.isArray(dados.pagamentosFatura) ? dados.pagamentosFatura : [],
    faturas: Array.isArray(dados.faturas) ? dados.faturas : [],
    planejamentos: Array.isArray(dados.planejamentos) ? dados.planejamentos : [],
    reservas: Array.isArray(dados.reservas) ? dados.reservas : [],
  };
  // Futuras migrações por versão entram aqui (if dados.schemaVersion < N ...).
  return out;
}

function structuredCloneSafe(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}
