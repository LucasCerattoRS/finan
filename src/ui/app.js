// app.js — controlador da UI (vanilla). Lê do core, desenha, salva.
//
// Telas: Início (números + gráficos), Lançar (entrada rápida + lista do mês),
// Importar (extrato do banco), Cartões (cadastro + faturas + parcelas), Config.
import * as C from '../core/index.js';
import {
  carregarEstado, salvarEstado, localDados, exportarBackup, importarBackup,
  falhaDeLeitura, liberarGravacao,
} from './storage.js';
import {
  graficoEvolucao, graficoCategorias, sparkline, gaugeSaude,
} from './charts.js';

let estado = C.estadoInicial();
let mesAtual = new Date().toISOString().slice(0, 7);
let tabAtual = 'dashboard';
let candidatos = null; // pré-visualização da importação (não persistida)
let revisarSoNomeados = true; // ver revisar.js: só o que o extrato nomeia pode virar regra

const $ = (sel) => document.querySelector(sel);
const fmt = C.formatarBRL;
const hoje = () => new Date().toISOString().slice(0, 10);

// ---------- helpers de DOM ----------
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}
function opts(select, lista, sel) {
  for (const v of lista) select.append(el('option', { value: v, ...(v === sel ? { selected: '' } : {}) }, v));
  return select;
}
function field(label, input) {
  return el('label', { class: 'field' }, [el('span', {}, label), input]);
}
function toast(msg, ms = 1800) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
const nomeCartao = (id) => (estado.cartoes.find((c) => c.id === id) || {}).nome || '—';
const rotuloTipo = (t) => ({ entrada: 'Entrada', saida: 'Saída', cartao: 'Cartão', transferencia: 'Transf.' }[t] || t);

const AVISO_LEITURA = 'Seus dados salvos não puderam ser lidos. Nada será gravado até você importar um backup (Config → Importar backup). O arquivo original não foi tocado.';

async function persistir() {
  if (falhaDeLeitura()) { toast(AVISO_LEITURA, 10000); return; }
  await salvarEstado(estado);
  atualizarTopo();
  render();
}

// ---------- topo (meses + saldo) ----------
function listaMeses() {
  const set = new Set(C.mesesComMovimento(estado));
  const anoAtual = new Date().getFullYear();
  for (let m = 1; m <= 12; m += 1) set.add(`${anoAtual}-${String(m).padStart(2, '0')}`);
  set.add(mesAtual);
  return [...set].sort();
}
function atualizarBadge() {
  const n = C.totalARevisar(estado);
  const b = $('#badgeRevisar');
  b.textContent = n ? String(n) : '';
  b.style.display = n ? '' : 'none';
}

function atualizarTopo() {
  const sel = $('#mesSelect');
  sel.innerHTML = '';
  for (const m of listaMeses()) sel.append(el('option', { value: m, ...(m === mesAtual ? { selected: '' } : {}) }, C.rotuloMes(m)));
  atualizarBadge();
  const saldo = C.saldoAcumulado(estado, mesAtual);
  const pill = $('#saldoPill');
  pill.textContent = fmt(saldo);
  pill.style.color = saldo >= 0 ? 'var(--pos)' : 'var(--neg)';
}

function render() {
  const v = $('#view'); v.innerHTML = '';
  ({
    dashboard: renderDashboard,
    lancamentos: renderLancar,
    importar: renderImportar,
    revisar: renderRevisar,
    cartoes: renderCartoes,
    planejar: renderPlanejar,
    reservas: renderReservas,
    metas: renderMetas,
    config: renderConfig,
  }[tabAtual] || renderDashboard)(v);
}

// ---------- Início ----------
function renderDashboard(v) {
  const r = C.resumoMes(estado, mesAtual);
  const s = C.scoreSaude(estado, mesAtual);
  const emConta = C.saldoAcumulado(estado, mesAtual);
  const futuro = C.comprometidoFuturo(estado, mesAtual);
  const serie = C.serieMensal(estado, mesAtual, 6);

  // séries de 6 meses p/ os sparklines dos tiles
  const sEnt = serie.map((p) => p.entradas);
  const sSai = serie.map((p) => p.saidas);
  const sSal = serie.map((p) => p.entradas - p.saidas);
  const sConta = serie.map((p) => C.saldoAcumulado(estado, p.mes));
  const antes = (arr) => (arr.length > 1 ? arr[arr.length - 2] : null);

  v.append(el('div', { class: 'dash-head' }, [
    el('h2', {}, `Início — ${C.rotuloMes(mesAtual)}`),
    el('p', { class: 'sub' }, 'saldo acumulado até aqui'),
  ]));

  // HERO — o número que importa (em conta) + a saúde financeira
  v.append(heroInicio(emConta, sConta, antes(sConta), futuro, s));

  // KPIs com sparklines (ordem fixa: [0]=Entradas, [1]=Saídas — o e2e depende disso)
  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Entradas', fmt(r.entradas), 'pos', footDelta(r.entradas, antes(sEnt), true),
      sparkline(sEnt, { stroke: 'var(--c-in)', fill: 'var(--pos-soft)' })),
    kpi('Saídas', fmt(r.saidas), 'neg', footDelta(r.saidas, antes(sSai), false),
      sparkline(sSai, { stroke: 'var(--c-out)', fill: 'var(--neg-soft)' })),
    kpi('Saldo do mês', fmt(r.saldoMes), r.saldoMes >= 0 ? 'pos' : 'neg', footDelta(r.saldoMes, antes(sSal), true),
      sparkline(sSal, {
        stroke: r.saldoMes >= 0 ? 'var(--c-in)' : 'var(--c-out)',
        fill: r.saldoMes >= 0 ? 'var(--pos-soft)' : 'var(--neg-soft)',
      })),
    kpi('Comprometido futuro', fmt(futuro), 'warn', 'faturas a vencer'),
  ]));

  // gráficos: evolução (estou melhorando?) + para onde foi o dinheiro
  const grid = el('div', { class: 'subgrid' });
  const temMovimento = serie.some((p) => p.entradas || p.saidas);
  grid.append(el('div', { class: 'card' }, [
    el('h3', {}, 'Entradas × saídas (6 meses)'),
    temMovimento ? graficoEvolucao(serie) : el('div', { class: 'empty' }, 'Sem movimento ainda.'),
  ]));
  const gc = C.gastoPorCategoria(estado, mesAtual);
  grid.append(el('div', { class: 'card' }, [
    el('h3', {}, 'Para onde foi o dinheiro'),
    gc.length ? graficoCategorias(gc, { max: 6 }) : el('div', { class: 'empty' }, 'Sem gastos neste mês.'),
  ]));
  v.append(grid);

  // faturas do mês + visão anual (como na planilha)
  const grid2 = el('div', { class: 'subgrid' });
  const faturas = C.faturasDoMes(estado, mesAtual).filter((f) => f.total > 0);
  grid2.append(el('div', { class: 'card' }, [
    el('h3', {}, 'Faturas deste mês'),
    faturas.length
      ? el('div', {}, faturas.map((f) => linhaFatura(f, false)))
      : el('div', { class: 'empty' }, 'Nenhuma fatura fecha neste mês.'),
  ]));
  grid2.append(cardVisaoAnual());
  v.append(grid2);
}

// Hero: "Em conta" em destaque + medidor de saúde com os pilares.
function heroInicio(emConta, sConta, antConta, futuro, s) {
  const main = el('div', { class: 'hero-main' }, [
    el('div', { class: 'eyebrow' }, 'Em conta · até aqui'),
    el('div', { class: 'hero-figure' }, [
      el('div', { class: 'big' }, fmt(emConta)),
      heroDelta(emConta, antConta),
    ]),
    el('div', { class: 'hero-spark' }, sparkline(sConta, { stroke: 'var(--hero-line)', fill: 'rgba(127,240,223,.18)', h: 40 })),
    futuro > 0
      ? el('div', { class: 'hero-foot' }, [
        el('span', {}, '◔'),
        el('span', {}, [el('b', {}, fmt(futuro)), ' já comprometidos em faturas futuras']),
      ])
      : null,
  ]);
  const side = el('div', { class: 'hero-side' }, [
    el('div', { class: 'gauge-wrap' }, [
      gaugeSaude(s.score),
      el('div', { class: 'gauge-num' }, [el('b', {}, String(s.score)), el('span', {}, 'Saúde')]),
    ]),
    el('div', { class: 'hero-pillars' }, [
      el('div', { class: 'faixa' }, s.faixa),
      pilar('Saldo', s.pilares.saldo),
      pilar('Essencial', s.pilares.essencialidade),
      pilar('Futuro', s.pilares.comprometimentoFuturo),
    ]),
  ]);
  return el('div', { class: 'hero' }, [main, side]);
}
function heroDelta(atual, anterior) {
  if (anterior == null || !Number.isFinite(anterior) || atual - anterior === 0) return null;
  const d = atual - anterior;
  const up = d > 0;
  const pct = anterior !== 0 ? ` · ${up ? '+' : ''}${((d / Math.abs(anterior)) * 100).toFixed(1).replace('.', ',')}%` : '';
  return el('span', { class: `delta ${up ? 'up' : 'dn'}` }, [
    el('span', { class: 'ar' }, up ? '▲' : '▼'),
    el('span', {}, `${up ? '+' : '−'}${fmt(Math.abs(d))}${pct}`),
  ]);
}
function pilar(nome, val) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
  return el('div', { class: 'pillar' }, [
    el('span', {}, nome),
    el('span', {}, `${pct}%`),
    el('span', { class: 'ptrack' }, el('i', { style: `width:${pct}%` })),
  ]);
}
// Chip de variação vs. mês anterior. maiorMelhor decide a cor (gastar menos é bom).
function footDelta(atual, anterior, maiorMelhor) {
  if (anterior == null || !Number.isFinite(anterior) || anterior === 0) return 'vs. mês anterior';
  const d = atual - anterior;
  const pct = (d / Math.abs(anterior)) * 100;
  const favor = maiorMelhor ? d >= 0 : d <= 0;
  const seta = d > 0 ? '▲' : d < 0 ? '▼' : '•';
  const cls = d === 0 ? 'mut' : favor ? 'good' : 'bad';
  const txt = `${seta} ${d >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`;
  return [el('span', { class: `kdelta ${cls}` }, txt), el('span', {}, 'vs. mês anterior')];
}
function cardVisaoAnual() {
  const ano = mesAtual.slice(0, 4);
  const ra = C.resumoAno(estado, ano);
  const anos = C.anosComMovimento(estado);
  const card = el('div', { class: 'card' }, [
    el('h3', {}, `Visão anual — ${ano}`),
    el('div', { class: 'grid-kpi' }, [
      kpi('Entradas no ano', fmt(ra.entradas), 'pos'),
      kpi('Saídas no ano', fmt(ra.saidas), 'neg'),
      kpi('Reserva do ano', fmt(ra.reservaAno), ra.reservaAno >= 0 ? 'pos' : 'neg'),
    ]),
  ]);
  if (anos.length > 1) {
    card.append(el('table', { class: 'tab-anos' }, [
      el('tr', {}, [el('th', {}, 'Ano'), el('th', {}, 'Entradas'), el('th', {}, 'Saídas'), el('th', {}, 'Reserva')]),
      ...anos.map((a) => {
        const rr = C.resumoAno(estado, a);
        return el('tr', { class: a === ano ? 'ano-atual' : '' }, [
          el('td', {}, a),
          el('td', { class: 'pos' }, fmt(rr.entradas)),
          el('td', { class: 'neg' }, fmt(rr.saidas)),
          el('td', { class: rr.reservaAno >= 0 ? 'pos' : 'neg' }, fmt(rr.reservaAno)),
        ]);
      }),
    ]));
  }
  return card;
}

function kpi(label, value, cls = '', rodape = null, spark = null) {
  return el('div', { class: 'card kpi' }, [
    el('div', { class: 'label' }, label),
    el('div', { class: `value ${cls}` }, value),
    spark ? el('div', { class: 'tspark' }, spark) : null,
    rodape ? el('div', { class: 'kpi-foot' }, rodape) : null,
  ]);
}

// Barra de progresso de uma fatura (pago x total). Reusada no Início e em Cartões.
function linhaFatura(f, comBotao = true) {
  const pct = Math.round(f.progresso * 100);
  const barra = el('div', { class: 'bar bar-fatura' }, el('i', { style: `width:${pct}%` }));
  const linha = el('div', { class: 'fatura' }, [
    el('div', { class: 'fatura-topo' }, [
      el('strong', {}, f.cartao),
      el('span', { class: 'muted' }, `vence dia ${f.vencimento}`),
      el('span', { class: `tag ${f.quitada ? 'ess' : 'nao'}` }, f.quitada ? 'Quitada' : `${pct}% pago`),
    ]),
    barra,
    el('div', { class: 'fatura-nums muted' },
      `${fmt(f.pago)} de ${fmt(f.total)}${f.restante > 0 ? ` · faltam ${fmt(f.restante)}` : ''}${f.adiantado > 0 ? ` · ${fmt(f.adiantado)} adiantados` : ''}`),
  ]);
  if (comBotao && !f.quitada && f.total > 0) {
    const val = el('input', { type: 'number', step: '0.01', min: '0', placeholder: fmt(f.restante).replace('R$', '').trim() });
    const bt = el('button', { class: 'btn', onclick: async () => {
      const v = Number(val.value);
      if (!v || v <= 0) return toast('Informe quanto está pagando.');
      estado = C.registrarPagamentoFatura(estado, { cartaoId: f.cartaoId, mesFatura: f.mesFatura, valor: v });
      await persistir();
      toast('Pagamento registrado');
    } }, 'Registrar pagamento');
    linha.append(el('div', { class: 'form-row compacta' }, [field('Valor pago', val), el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), bt])]));
  }
  return linha;
}

// Uma fatura futura + o botão de adiantar. Adiantar = registrar que o dinheiro
// saiu ANTES do mês da fatura (é o que você faz no app do banco).
function linhaAdiantar(f) {
  const pct = Math.round(f.progresso * 100);
  const linha = el('div', { class: 'fatura' }, [
    el('div', { class: 'fatura-topo' }, [
      el('strong', {}, C.rotuloMes(f.mesFatura)),
      el('span', { class: 'muted' }, `${f.cartao} · vence dia ${f.vencimento}`),
      el('span', { class: 'tag warn' }, fmt(f.restante)),
      f.informada ? el('span', { class: 'muted', style: 'font-size:11px' }, 'valor do banco') : null,
    ]),
    el('div', { class: 'bar bar-fatura' }, el('i', { style: `width:${pct}%` })),
  ]);

  const val = el('input', { type: 'number', step: '0.01', min: '0', placeholder: fmt(f.restante).replace('R$', '').trim() });
  const data = el('input', { type: 'date', value: hoje() });
  const bt = el('button', { class: 'btn', onclick: async () => {
    const v = Number(val.value) || f.restante;
    if (!v || v <= 0) return toast('Informe o valor.');
    estado = C.registrarPagamentoFatura(estado, {
      cartaoId: f.cartaoId, mesFatura: f.mesFatura, valor: v, data: data.value || hoje(),
    });
    await persistir();
    toast(`Adiantado: ${fmt(v)} da fatura de ${C.rotuloMes(f.mesFatura)}`);
  } }, '⏩ Adiantar');

  linha.append(el('div', { class: 'form-row compacta' }, [
    field('Quanto', val), field('Quando saiu', data),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), bt]),
  ]));
  return linha;
}

// ---------- Lançar ----------
// Um formulário só, com o tipo como botão. Antes eram três blocos repetidos na
// mesma tela — a maior queixa de "complicado de postar conta".
function renderLancar(v) {
  v.append(el('h2', {}, `Lançar — ${C.rotuloMes(mesAtual)}`));

  const wrap = el('div', { class: 'card destaque' });
  let tipo = 'saida'; // o que mais se lança no dia a dia

  const seletor = el('div', { class: 'tipo-toggle' });
  const botoes = {};
  for (const [t, rotulo] of [['saida', '− Saída'], ['entrada', '+ Entrada'], ['cartao', '⊞ Cartão']]) {
    botoes[t] = el('button', {
      class: `tipo-btn ${t === tipo ? 'active' : ''}`,
      type: 'button',
      onclick: () => {
        tipo = t;
        Object.entries(botoes).forEach(([k, b]) => b.classList.toggle('active', k === tipo));
        wrap.classList.toggle('is-cartao', tipo === 'cartao');
        camposCartao.style.display = tipo === 'cartao' ? '' : 'none';
        campoForma.style.display = tipo === 'cartao' ? 'none' : '';
        valor.focus();
      },
    }, rotulo);
    seletor.append(botoes[t]);
  }
  wrap.append(seletor);

  const valor = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00', class: 'input-valor' });
  const descricao = el('input', { type: 'text', placeholder: 'no que foi?' });
  const categoria = opts(el('select'), estado.config.categorias);
  const data = el('input', { type: 'date', value: hoje() });
  const forma = opts(el('select'), estado.config.formasPagamento);
  const classificacao = opts(el('select'), ['', ...estado.config.classificacoes]);
  const cartaoSel = opts(el('select'), estado.cartoes.map((c) => c.nome));
  const parcelas = el('input', { type: 'number', min: '1', step: '1', value: '1' });

  // digitou a descrição -> as regras já sugerem a categoria (mesmo motor da importação)
  descricao.addEventListener('blur', () => {
    const sug = C.categorizar(descricao.value, estado.config.regras);
    if (!sug) return;
    if (estado.config.categorias.includes(sug.categoria)) categoria.value = sug.categoria;
    if (sug.classificacao) classificacao.value = sug.classificacao;
  });

  const campoForma = field('Forma', forma);
  const camposCartao = el('div', { class: 'campos-cartao', style: 'display:none' }, [
    field('Cartão', cartaoSel), field('Parcelas', parcelas),
  ]);

  const salvar = async () => {
    const val = Number(valor.value);
    if (!val || val <= 0) return toast('Informe um valor.');
    if (tipo === 'cartao' && !estado.cartoes.length) return toast('Cadastre um cartão primeiro.');
    const base = {
      tipo,
      data: data.value || hoje(),
      categoria: categoria.value,
      descricao: descricao.value.trim(),
      valor: val,
      classificacao: classificacao.value,
    };
    if (tipo === 'cartao') {
      const cartao = estado.cartoes.find((c) => c.nome === cartaoSel.value);
      base.cartaoId = cartao ? cartao.id : null;
      base.parcelas = Math.max(1, parseInt(parcelas.value, 10) || 1);
    } else {
      base.forma = forma.value;
    }
    estado = C.adicionarTransacao(estado, base);
    mesAtual = C.mesDe(base.data); // pula pro mês do lançamento, senão ele "some"
    await persistir();
    toast('Lançado!');
    // volta pronto pro próximo: só o valor limpo, resto mantido
    const campoValor = $('.input-valor');
    if (campoValor) campoValor.focus();
  };

  // Enter em qualquer campo salva — lançar não deveria exigir o mouse.
  for (const campo of [valor, descricao, data]) {
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  }

  wrap.append(el('div', { class: 'form-row' }, [
    field('Valor', valor),
    field('Descrição', descricao),
    field('Categoria', categoria),
    field('Data', data),
    campoForma,
    camposCartao,
    field('Classificação', classificacao),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: salvar }, 'Lançar (Enter)')]),
  ]));
  v.append(wrap);

  // lista do mês, tudo junto e ordenado — em vez de três tabelas separadas
  const noMes = (t) => C.mesDe(t.data) === mesAtual;
  const itens = estado.transacoes.filter(noMes).sort((a, b) => (a.data < b.data ? 1 : -1));

  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, `Lançamentos de ${C.rotuloMes(mesAtual)} (${itens.length})`));
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['Data', 'Tipo', 'Categoria', 'Descrição', 'Onde', 'Classif.', 'Valor', ''].map((c) => el('th', c === 'Valor' ? { class: 'num' } : {}, c)))));
  const tbody = el('tbody');
  if (!itens.length) tbody.append(el('tr', {}, el('td', { colspan: 8, class: 'empty' }, 'Nada lançado neste mês ainda.')));
  for (const t of itens) {
    const ehEntrada = t.tipo === 'entrada';
    const onde = t.tipo === 'cartao' ? `${nomeCartao(t.cartaoId)} ${t.parcelas > 1 ? `${t.parcelas}x` : ''}`.trim() : (t.forma || '');
    tbody.append(el('tr', {}, [
      el('td', {}, t.data.slice(8, 10) + '/' + t.data.slice(5, 7)),
      el('td', {}, el('span', { class: `pill-tipo ${t.tipo}` }, rotuloTipo(t.tipo))),
      el('td', {}, t.categoria),
      el('td', {}, t.descricao || ''),
      el('td', { class: 'muted' }, onde),
      el('td', {}, t.classificacao ? el('span', { class: `tag ${t.classificacao === 'Essencial' ? 'ess' : 'nao'}` }, t.classificacao) : ''),
      el('td', { class: 'num' }, el('span', { class: `amount ${t.tipo === 'transferencia' ? '' : (ehEntrada ? 'in' : 'out')}` }, fmt(t.valor))),
      el('td', {}, el('button', { class: 'btn danger', title: 'Remover', onclick: async () => {
        estado = C.removerTransacao(estado, t.id); await persistir(); toast('Removido');
      } }, '✕')),
    ]));
  }
  table.append(tbody);
  card.append(el('div', { class: 'table-wrap' }, table));
  v.append(card);
}

// ---------- Importar extrato ----------
function renderImportar(v) {
  v.append(el('h2', {}, 'Importar extrato'));

  const intro = el('div', { class: 'card' }, [
    el('h3', {}, 'Traga os gastos do banco'),
    el('p', { class: 'muted' }, 'Baixe o extrato da conta ou a fatura do cartão no app do banco (.ofx ou .csv) e solte aqui. O Finan lê, sugere a categoria de cada lançamento e ignora o que já existe. Nada entra sem você confirmar — e nenhum dado sai daqui.'),
  ]);

  const arquivo = el('input', { type: 'file', accept: '.ofx,.csv,.txt', class: 'file' });
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files[0];
    if (!f) return;
    try {
      const texto = await f.text();
      const brutos = C.parseExtrato(texto, f.name);
      if (!brutos.length) {
        candidatos = null;
        toast('Não encontrei lançamentos nesse arquivo.');
      } else {
        candidatos = C.prepararImportacao(estado, brutos);
        toast(`${brutos.length} lançamentos lidos`);
      }
      render();
    } catch (err) {
      toast(`Erro ao ler: ${err.message}`);
    }
  });
  intro.append(el('div', { class: 'form-row' }, [field('Arquivo do banco', arquivo)]));
  v.append(intro);

  if (!candidatos) return;

  const res = C.resumoImportacao(candidatos);
  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, 'Revisar antes de importar'));
  card.append(el('div', { class: 'muted', style: 'margin-bottom:10px' },
    `${res.total} lançamentos · ${res.reconhecidos} categorizados automaticamente · ${res.duplicados} já existem (desmarcados)`));

  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['', 'Data', 'Descrição', 'Categoria', 'Classif.', 'Valor'].map((c) => el('th', c === 'Valor' ? { class: 'num' } : {}, c)))));
  const tbody = el('tbody');

  candidatos.forEach((c, i) => {
    const check = el('input', { type: 'checkbox', ...(c.importar ? { checked: '' } : {}) });
    check.addEventListener('change', () => { candidatos[i].importar = check.checked; atualizarBotao(); });

    const cat = opts(el('select'), [...new Set([...estado.config.categorias, c.categoria].filter(Boolean))], c.categoria);
    cat.addEventListener('change', () => { candidatos[i].categoria = cat.value; });

    const cls = opts(el('select'), ['', ...estado.config.classificacoes], c.classificacao);
    cls.addEventListener('change', () => { candidatos[i].classificacao = cls.value; });

    tbody.append(el('tr', { class: c.duplicado ? 'dup' : '' }, [
      el('td', {}, check),
      el('td', {}, c.data.slice(8, 10) + '/' + c.data.slice(5, 7)),
      el('td', {}, [
        el('div', {}, c.descricao || '—'),
        c.duplicado ? el('span', { class: 'tag nao' }, 'já existe') : (c.reconhecido ? null : el('span', { class: 'tag warn' }, 'sem regra')),
      ]),
      el('td', {}, cat),
      el('td', {}, cls),
      el('td', { class: 'num' }, el('span', { class: `amount ${c.tipo === 'entrada' ? 'in' : 'out'}` }, fmt(c.valor))),
    ]));
  });
  table.append(tbody);
  card.append(el('div', { class: 'table-wrap' }, table));

  const botao = el('button', { class: 'btn', onclick: async () => {
    const quantos = candidatos.filter((c) => c.importar).length;
    if (!quantos) return toast('Nada selecionado.');
    estado = C.importarTransacoes(estado, candidatos);
    candidatos = null;
    tabAtual = 'lancamentos';
    [...$('#tabs').children].forEach((b) => b.classList.toggle('active', b.dataset.tab === 'lancamentos'));
    await persistir();
    toast(`${quantos} lançamentos importados`);
  } }, 'Importar selecionados');
  function atualizarBotao() {
    const n = candidatos.filter((c) => c.importar).length;
    botao.textContent = `Importar ${n} selecionado${n === 1 ? '' : 's'}`;
    botao.disabled = n === 0;
  }
  atualizarBotao();

  card.append(el('div', { class: 'form-row' }, [
    botao,
    el('button', { class: 'btn ghost', onclick: () => { candidatos = null; render(); } }, 'Cancelar'),
  ]));
  v.append(card);
}

// ---------- Revisar (o que o banco não nomeou) ----------
// Resolve em LOTE: um grupo = todos os lançamentos pro mesmo destino. Quando o
// destino tem nome, a escolha vira regra e o app nunca mais pergunta.
function renderRevisar(v) {
  const todos = C.gruposParaRevisar(estado);
  const nomeados = todos.filter((g) => g.nomeado);
  const grupos = revisarSoNomeados ? nomeados : todos;
  const total = todos.reduce((a, g) => a + g.n, 0);
  const anonimos = todos.length - nomeados.length;

  v.append(el('h2', {}, 'Revisar sem categoria'));

  if (!todos.length) {
    v.append(el('div', { class: 'card' }, [
      el('h3', {}, 'Tudo categorizado 🎉'),
      el('p', { class: 'muted' }, 'Nenhum lançamento sem categoria. Quando você importar um extrato novo, o que sobrar aparece aqui.'),
    ]));
    return;
  }

  const filtro = el('div', { class: 'tipo-toggle' });
  for (const [val, rotulo] of [[true, `Dá pra ensinar (${nomeados.length})`], [false, `Todos (${todos.length})`]]) {
    filtro.append(el('button', {
      class: `tipo-btn ${revisarSoNomeados === val ? 'active' : ''}`,
      type: 'button',
      onclick: () => { revisarSoNomeados = val; render(); },
    }, rotulo));
  }

  v.append(el('div', { class: 'card' }, [
    el('p', { class: 'muted', style: 'margin:0 0 12px' }, `${total} lançamentos sem categoria. Comece de cima: os maiores valores resolvem a maior parte. Quando o extrato traz o nome de quem recebeu, sua escolha vira regra e o app nunca mais pergunta.`),
    anonimos ? el('p', { class: 'muted', style: 'margin:0 0 12px' }, `${anonimos} grupos ficam fora deste filtro porque o banco não registrou quem recebeu (Pix antigos, 2023–2025). Neles dá pra categorizar na mão, mas não vira regra — e jogar todos numa categoria só seria inventar. Em 2026 isso não acontece: todo lançamento tem nome.`) : null,
    filtro,
  ]));

  const card = el('div', { class: 'card' });
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['Destino (do extrato)', 'Qtd.', 'Total', 'Categoria', 'Classificação', ''].map((c) => el('th', c === 'Total' ? { class: 'num' } : {}, c)))));
  const tbody = el('tbody');

  for (const g of grupos.slice(0, 40)) {
    const cat = opts(el('select'), ['', ...estado.config.categorias]);
    const cls = opts(el('select'), ['', ...estado.config.classificacoes]);
    const aplicar = el('button', { class: 'btn', onclick: async () => {
      if (!cat.value) return toast('Escolha a categoria.');
      // só vira regra se o extrato nomeia quem recebeu (ver revisar.js)
      estado = C.categorizarLote(estado, g.ids, cat.value, cls.value, g.nomeado ? g.chave : null);
      await persistir();
      toast(g.nomeado ? `${g.n} lançamentos + regra criada` : `${g.n} lançamentos categorizados`);
    } }, `Aplicar (${g.n})`);

    tbody.append(el('tr', {}, [
      el('td', {}, [
        el('div', { style: 'font-weight:600' }, g.chave),
        el('div', { class: 'muted', style: 'font-size:11px' }, g.exemplo.slice(0, 58)),
        g.nomeado
          ? el('span', { class: 'tag ess' }, 'vira regra')
          : el('span', { class: 'tag warn', title: 'O extrato não diz quem recebeu — categorizar aqui não pode virar regra, senão carimbaria todo Pix futuro.' }, 'sem nome no extrato'),
      ]),
      el('td', {}, String(g.n)),
      el('td', { class: 'num' }, el('span', { class: `amount ${g.tipo === 'entrada' ? 'in' : 'out'}` }, fmt(g.total))),
      el('td', {}, cat),
      el('td', {}, cls),
      el('td', {}, aplicar),
    ]));
  }
  table.append(tbody);
  card.append(el('div', { class: 'table-wrap' }, table));
  if (grupos.length > 40) card.append(el('div', { class: 'muted' }, `Mostrando os 40 maiores de ${grupos.length}. Resolva estes e os próximos sobem.`));
  v.append(card);
}

// ---------- Cartões (cadastro + faturas + parcelas) ----------
function renderCartoes(v) {
  v.append(el('h2', {}, 'Cartões'));

  // 1) faturas do mês, com pagamento
  const faturas = C.faturasDoMes(estado, mesAtual).filter((f) => f.total > 0);
  const cardFat = el('div', { class: 'card' });
  cardFat.append(el('h3', {}, `Faturas de ${C.rotuloMes(mesAtual)}`));
  if (faturas.length) faturas.forEach((f) => cardFat.append(linhaFatura(f, true)));
  else cardFat.append(el('div', { class: 'empty' }, 'Nenhuma fatura fecha neste mês.'));
  v.append(cardFat);

  // 2) próximas faturas — é aqui que se adianta
  const proximas = C.proximasFaturas(estado, C.somaMeses(mesAtual, 1), 12)
    .filter((f) => !f.quitada);
  const cardProx = el('div', { class: 'card' });
  cardProx.append(el('h3', {}, 'Próximas faturas'));
  if (proximas.length) {
    const futuro = proximas.reduce((a, f) => a + f.restante, 0);
    cardProx.append(el('p', { class: 'muted' }, `${fmt(futuro)} comprometidos daqui pra frente. Adiantar uma fatura registra que você já pagou — o valor sai do comprometido futuro. (O dinheiro saindo da conta aparece sozinho quando você importar o extrato; o app não lança gasto em dobro.)`));
    proximas.forEach((f) => cardProx.append(linhaAdiantar(f)));
  } else {
    cardProx.append(el('div', { class: 'empty' }, 'Nenhuma fatura em aberto daqui pra frente.'));
  }
  v.append(cardProx);

  // 3) cadastro
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, 'Meus cartões'));
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['Nome', 'Fechamento', 'Vencimento', ''].map((c) => el('th', {}, c)))));
  const tbody = el('tbody');
  if (!estado.cartoes.length) tbody.append(el('tr', {}, el('td', { colspan: 4, class: 'empty' }, 'Nenhum cartão cadastrado.')));
  for (const c of estado.cartoes) {
    tbody.append(el('tr', {}, [
      el('td', {}, c.nome), el('td', {}, `dia ${c.fechamento}`), el('td', {}, `dia ${c.vencimento}`),
      el('td', {}, el('button', { class: 'btn danger', onclick: async () => {
        estado = C.removerCartao(estado, c.id); await persistir(); toast('Cartão removido');
      } }, '✕')),
    ]));
  }
  table.append(tbody);
  wrap.append(el('div', { class: 'table-wrap' }, table));

  const nome = el('input', { type: 'text', placeholder: 'Ex.: Sicredi' });
  const fech = el('input', { type: 'number', min: '1', max: '31', value: '25' });
  const venc = el('input', { type: 'number', min: '1', max: '31', value: '10' });
  const add = el('button', { class: 'btn', onclick: async () => {
    if (!nome.value.trim()) return toast('Dê um nome ao cartão.');
    estado = C.adicionarCartao(estado, {
      nome: nome.value.trim(),
      fechamento: Number(fech.value) || 1,
      vencimento: Number(venc.value) || 1,
    });
    await persistir(); toast('Cartão adicionado');
  } }, '+ Adicionar cartão');
  wrap.append(el('div', { class: 'form-row' }, [
    field('Nome', nome), field('Fechamento (dia)', fech), field('Vencimento (dia)', venc),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add]),
  ]));
  v.append(wrap);

  // 4) parcelas (era uma aba solta; é detalhe de cartão)
  const todas = C.todasParcelas(estado).sort((a, b) => (a.mesFatura < b.mesFatura ? -1 : 1));
  const cardParc = el('div', { class: 'card' });
  cardParc.append(el('h3', {}, `Parcelas em aberto (${todas.length})`));
  const t2 = el('table');
  t2.append(el('thead', {}, el('tr', {}, ['Fatura', 'Cartão', 'Descrição', 'Parcela', 'Valor'].map((c) => el('th', c === 'Valor' ? { class: 'num' } : {}, c)))));
  const tb2 = el('tbody');
  if (!todas.length) tb2.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Nenhuma parcela — lance uma compra no cartão.')));
  for (const p of todas) {
    tb2.append(el('tr', { class: p.mesFatura === mesAtual ? 'destaque-linha' : '' }, [
      el('td', {}, C.rotuloMes(p.mesFatura)),
      el('td', {}, nomeCartao(p.cartaoId)),
      el('td', {}, p.descricao || p.categoria),
      el('td', {}, `${p.n}/${p.de}`),
      el('td', { class: 'num' }, fmt(p.valor)),
    ]));
  }
  t2.append(tb2);
  cardParc.append(el('div', { class: 'table-wrap' }, t2));
  v.append(cardParc);
}

// ---------- Planejar (orçamento do mês: estimado x real) ----------
// Era a aba "Planejamento PM": você diz quanto pretende gastar por categoria e o
// app mostra ao lado quanto REALMENTE saiu (parcelas do cartão incluídas).
// "Repetir" leva o orçamento deste mês para os outros meses do ano.
function renderPlanejar(v) {
  const p = C.planejamentoDoMes(estado, mesAtual);
  v.append(el('h2', {}, `Planejar — ${C.rotuloMes(mesAtual)}`));

  // resumo: orçado x gasto x quanto ainda cabe
  const estourou = p.totalEstimado > 0 && p.totalReal > p.totalEstimado;
  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Orçado', fmt(p.totalEstimado)),
    kpi('Gasto até agora', fmt(p.totalReal), estourou ? 'neg' : ''),
    kpi(p.diferenca >= 0 ? 'Ainda cabe' : 'Acima do orçado', fmt(Math.abs(p.diferenca)),
      p.diferenca >= 0 ? 'pos' : 'neg'),
  ]));

  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, 'Orçamento por categoria'));
  card.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'Digite quanto pretende gastar em cada categoria. O "Real" soma o que já saiu no mês (parcelas do cartão incluídas). Deixe em branco (ou 0) para tirar a meta.'));

  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, [
    el('th', {}, 'Categoria'),
    el('th', { class: 'num' }, 'Estimado'),
    el('th', { class: 'num' }, 'Real'),
    el('th', { class: 'num' }, 'Diferença'),
    el('th', {}, ''),
  ])));
  const tbody = el('tbody');

  const linhaCategoria = (item) => {
    const inp = el('input', {
      type: 'number', step: '0.01', min: '0', class: 'num-input', placeholder: '0,00',
      ...(item.estimado ? { value: item.estimado.toFixed(2) } : {}),
    });
    const salvar = async () => {
      const val = Number(inp.value) || 0;
      if (val === (item.estimado || 0)) return; // nada mudou: não regrava nem re-renderiza
      estado = C.definirPlanejamento(estado, { mes: mesAtual, categoria: item.categoria, estimado: val });
      await persistir();
      toast(val > 0 ? `${item.categoria}: meta ${fmt(val)}` : `Meta de ${item.categoria} removida`);
    };
    inp.addEventListener('blur', salvar);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });

    const pct = item.estimado > 0
      ? Math.min(item.real / item.estimado, 1) * 100
      : (item.real > 0 ? 100 : 0);
    const acima = item.estimado > 0 ? item.real > item.estimado : item.real > 0;
    const barra = el('div', { class: `bar bar-orc ${acima ? 'over' : ''}` }, el('i', { style: `width:${pct}%` }));

    const difCell = item.estimado > 0
      ? el('span', { class: `amount ${item.diferenca >= 0 ? 'in' : 'out'}` },
        item.diferenca >= 0 ? `resta ${fmt(item.diferenca)}` : `−${fmt(-item.diferenca)}`)
      : (item.real > 0 ? el('span', { class: 'tag warn' }, 'sem meta') : el('span', { class: 'muted' }, '—'));

    return el('tr', {}, [
      el('td', {}, [el('div', {}, item.categoria), el('div', { style: 'margin-top:6px' }, barra)]),
      el('td', { class: 'num' }, inp),
      el('td', { class: 'num' }, item.real > 0 ? el('span', { class: 'amount out' }, fmt(item.real)) : el('span', { class: 'muted' }, fmt(0))),
      el('td', { class: 'num' }, difCell),
      el('td', {}, item.estimado > 0
        ? el('button', { class: 'btn danger', title: 'Tirar meta', onclick: async () => {
          estado = C.removerPlanejamento(estado, mesAtual, item.categoria);
          await persistir(); toast('Meta removida');
        } }, '✕')
        : ''),
    ]);
  };

  if (!p.itens.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Nenhuma meta e nenhum gasto neste mês ainda. Defina uma meta abaixo.')));
  } else {
    for (const item of p.itens) tbody.append(linhaCategoria(item));
    tbody.append(el('tr', { class: 'total-row' }, [
      el('td', {}, el('strong', {}, 'Total')),
      el('td', { class: 'num' }, el('strong', {}, fmt(p.totalEstimado))),
      el('td', { class: 'num' }, el('strong', {}, fmt(p.totalReal))),
      el('td', { class: 'num' }, el('strong', { class: `amount ${p.diferenca >= 0 ? 'in' : 'out'}` }, fmt(p.diferenca))),
      el('td', {}, ''),
    ]));
  }
  table.append(tbody);
  card.append(el('div', { class: 'table-wrap' }, table));

  // definir meta para uma categoria que ainda não está na tabela
  const naTabela = new Set(p.itens.map((i) => i.categoria));
  const disponiveis = estado.config.categorias.filter((c) => !naTabela.has(c));
  const catSel = opts(el('select'), disponiveis.length ? disponiveis : estado.config.categorias);
  const valNova = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00' });
  const addBtn = el('button', { class: 'btn', onclick: async () => {
    const val = Number(valNova.value) || 0;
    if (val <= 0) return toast('Informe o valor da meta.');
    estado = C.definirPlanejamento(estado, { mes: mesAtual, categoria: catSel.value, estimado: val });
    await persistir(); toast(`${catSel.value}: meta ${fmt(val)}`);
  } }, '+ Definir meta');
  card.append(el('div', { class: 'form-row' }, [
    field('Categoria', catSel), field('Estimado', valNova),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), addBtn]),
  ]));
  v.append(card);

  // repetir o orçamento deste mês para os outros meses do mesmo ano
  if (p.itens.some((i) => i.planejado)) {
    const ano = mesAtual.slice(0, 4);
    const outros = [];
    for (let m = 1; m <= 12; m += 1) {
      const mm = `${ano}-${String(m).padStart(2, '0')}`;
      if (mm !== mesAtual) outros.push(mm);
    }
    const rep = el('div', { class: 'card' });
    rep.append(el('h3', {}, 'Repetir orçamento'));
    rep.append(el('p', { class: 'muted' }, `Copia as metas de ${C.rotuloMes(mesAtual)} para os outros meses de ${ano} (substitui as metas das mesmas categorias nesses meses; não mexe nas outras).`));
    rep.append(el('button', { class: 'btn ghost', onclick: async () => {
      estado = C.repetirPlanejamento(estado, mesAtual, outros);
      await persistir(); toast(`Orçamento repetido para ${ano}`);
    } }, `↻ Repetir para os demais meses de ${ano}`));
    v.append(rep);
  }
}

// ---------- Reservas (reserva de emergência: a aba "Reservas PM") ----------
// Guardar dinheiro é um EARMARK sobre o que já está em conta, não um gasto: por
// isso "Disponível para gastar" = dinheiro em conta − reserva acumulada. Valor
// negativo é resgate (usou a reserva). A meta é em meses de gasto médio.
function renderReservas(v) {
  const ano = mesAtual.slice(0, 4);
  const r = C.resumoReserva(estado, ano);
  v.append(el('h2', {}, `Reserva de emergência — ${ano}`));

  // acumulado x disponível para gastar x meta
  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Reserva acumulada', fmt(r.total), r.total >= 0 ? 'pos' : 'neg',
      r.noAno !== r.total ? `${fmt(r.noAno)} guardados em ${ano}` : null),
    kpi('Disponível para gastar', fmt(r.disponivel), r.disponivel >= 0 ? '' : 'neg',
      'dinheiro em conta − reserva'),
    kpi(r.metaMeses ? `Meta (${r.metaMeses} meses)` : 'Meta', r.metaMeses ? fmt(r.meta) : '—',
      '', r.metaMeses ? `gasto médio ${fmt(r.gastoMedio)}/mês` : 'defina abaixo'),
  ]));

  // progresso rumo à meta (chegar a 100% é bom: barra sempre verde)
  if (r.metaMeses > 0) {
    const pct = Math.round(r.progresso * 100);
    const card = el('div', { class: 'card' });
    card.append(el('h3', {}, 'Progresso da meta'));
    card.append(el('div', { class: 'bar bar-orc', style: 'max-width:none' }, el('i', { style: `width:${pct}%` })));
    card.append(el('p', { class: 'muted', style: 'margin:8px 0 0' },
      r.faltam > 0
        ? `${pct}% — faltam ${fmt(r.faltam)} para ${r.metaMeses} ${r.metaMeses === 1 ? 'mês' : 'meses'} de gasto.`
        : `Meta atingida: você tem ${r.metaMeses}+ meses de gasto guardados. 🎉`));
    v.append(card);
  }

  // guardar ou resgatar no mês selecionado no topo
  const form = el('div', { class: 'card' });
  form.append(el('h3', {}, 'Guardar ou resgatar'));
  const tipoSel = opts(el('select'), ['Guardar', 'Resgatar']);
  const valInp = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00' });
  const obsInp = el('input', { type: 'text', placeholder: 'observação (opcional)' });
  const registrar = async () => {
    const val = Number(valInp.value) || 0;
    if (val <= 0) { toast('Informe um valor maior que zero.'); return; }
    const sinal = tipoSel.value === 'Resgatar' ? -1 : 1;
    estado = C.registrarReserva(estado, { mes: mesAtual, valor: sinal * val, obs: obsInp.value.trim() });
    await persistir();
    toast(sinal > 0 ? `Guardado ${fmt(val)}` : `Resgatado ${fmt(val)}`);
  };
  valInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') registrar(); });
  form.append(el('div', { class: 'form-row' }, [
    field('Ação', tipoSel), field('Valor', valInp), field('Observação', obsInp),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: registrar }, '+ Registrar')]),
  ]));
  form.append(el('p', { class: 'muted', style: 'margin:8px 0 0' },
    `O movimento entra em ${C.rotuloMes(mesAtual)}. Guardar não conta como gasto — é dinheiro separado, que sai do "disponível".`));
  v.append(form);

  // histórico de movimentos (mais recentes primeiro)
  const movs = [...(estado.reservas || [])].sort((a, b) => (
    (b.mes || '').localeCompare(a.mes || '') || (b.criadoEm || '').localeCompare(a.criadoEm || '')
  ));
  const lista = el('div', { class: 'card' });
  lista.append(el('h3', {}, 'Movimentos'));
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, [
    el('th', {}, 'Mês'), el('th', {}, 'Ação'),
    el('th', { class: 'num' }, 'Valor'), el('th', {}, 'Observação'), el('th', {}, ''),
  ])));
  const tbody = el('tbody');
  if (!movs.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Nenhum movimento ainda. Guarde seu primeiro aporte acima.')));
  } else {
    for (const m of movs) {
      const aporte = m.valor >= 0;
      tbody.append(el('tr', {}, [
        el('td', {}, C.rotuloMes(m.mes)),
        el('td', {}, el('span', { class: `amount ${aporte ? 'in' : 'out'}` }, aporte ? 'Guardou' : 'Resgatou')),
        el('td', { class: 'num' }, el('span', { class: `amount ${aporte ? 'in' : 'out'}` }, `${aporte ? '' : '−'}${fmt(Math.abs(m.valor))}`)),
        el('td', {}, m.obs ? m.obs : el('span', { class: 'muted' }, '—')),
        el('td', {}, el('button', { class: 'btn danger', title: 'Remover', onclick: async () => {
          estado = C.removerReserva(estado, m.id);
          await persistir(); toast('Movimento removido');
        } }, '✕')),
      ]));
    }
    tbody.append(el('tr', { class: 'total-row' }, [
      el('td', {}, el('strong', {}, 'Acumulado')), el('td', {}, ''),
      el('td', { class: 'num' }, el('strong', {}, fmt(r.total))), el('td', {}, ''), el('td', {}, ''),
    ]));
  }
  table.append(tbody);
  lista.append(el('div', { class: 'table-wrap' }, table));
  v.append(lista);

  // meta em meses de gasto médio (6 é a recomendação clássica)
  const metaCard = el('div', { class: 'card' });
  metaCard.append(el('h3', {}, 'Meta da reserva'));
  metaCard.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'Quantos meses de gasto você quer ter guardados. A recomendação clássica é 6 meses. O valor-alvo é essa quantidade × seu gasto médio mensal.'));
  const metaInp = el('input', { type: 'number', step: '1', min: '0', value: String(r.metaMeses) });
  metaCard.append(el('div', { class: 'form-row' }, [
    field('Meses de gasto', metaInp),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: async () => {
      const meses = Math.max(0, Math.round(Number(metaInp.value) || 0));
      estado = C.definirMetaReserva(estado, meses);
      await persistir(); toast(meses > 0 ? `Meta: ${meses} ${meses === 1 ? 'mês' : 'meses'}` : 'Meta removida');
    } }, 'Salvar meta')]),
  ]));
  v.append(metaCard);
}

// ---------- Metas (calculadora: reserva, liberdade financeira, viver de dividendos) ----------
// A partir da renda mensal (componentes) e do patrimônio investido (informado à mão — o app
// é offline e não puxa cotação), mostra o alvo de cada meta, quanto falta e o prazo ao seu
// ritmo de aporte. Toda edição persiste e re-renderiza (persistir()), então não guardo estado
// local: cada tela lê o config atual.
function prazoLegivel(meses) {
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  if (anos && m) return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${m} ${m === 1 ? 'mês' : 'meses'}`;
  if (anos) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${m} ${m === 1 ? 'mês' : 'meses'}`;
}

function cardMeta(titulo, d, base) {
  const pct = Math.round(d.progresso * 100);
  let prazo = '';
  if (d.faltam <= 0) prazo = ' — meta atingida 🎉';
  else if (d.prazoMeses == null) prazo = ' — defina um aporte mensal para estimar o prazo';
  else prazo = ` — no seu ritmo, ~${prazoLegivel(d.prazoMeses)}`;
  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, titulo));
  card.append(el('div', { class: 'grid-kpi' }, [
    kpi('Alvo', fmt(d.alvo)),
    kpi('Você tem', fmt(d.atual), d.atual > 0 ? 'pos' : ''),
    kpi('Faltam', fmt(d.faltam), d.faltam > 0 ? 'neg' : 'pos'),
  ]));
  card.append(el('div', { class: 'bar bar-orc', style: 'max-width:none' }, el('i', { style: `width:${pct}%` })));
  card.append(el('p', { class: 'muted', style: 'margin:8px 0 0' }, `${base}. ${pct}%${prazo}.`));
  return card;
}

function renderMetas(v) {
  const m = C.resumoMetas(estado);
  v.append(el('h2', {}, 'Metas financeiras'));
  v.append(el('p', { class: 'muted', style: 'margin:-4px 0 16px' },
    'Quanto falta para a reserva, para a liberdade financeira e para viver de dividendos — a partir da sua renda e do que você já tem investido.'));

  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Renda mensal', fmt(m.renda), 'pos', 'soma dos componentes abaixo'),
    kpi('Patrimônio investido', fmt(m.patrimonioInvestido), '', 'informado à mão'),
    kpi('Aporte mensal', fmt(m.aporteMensal), '', 'quanto você guarda/investe por mês'),
  ]));

  // as três metas
  v.append(cardMeta('🛟 Reserva de emergência', m.reserva,
    m.reserva.metaMeses
      ? `${m.reserva.metaMeses} ${m.reserva.metaMeses === 1 ? 'mês' : 'meses'} de gasto médio (${fmt(m.reserva.gastoMedio)}/mês)`
      : 'defina a meta em meses na aba Reservas'));
  v.append(cardMeta('🕊️ Liberdade financeira', m.liberdade,
    `${m.liberdade.metaMeses} ${m.liberdade.metaMeses === 1 ? 'mês' : 'meses'} de renda guardados`));
  v.append(cardMeta('💸 Viver de dividendos', m.dividendos,
    `renda passiva ≥ sua renda, rendendo ${(m.dividendos.yield * 100).toLocaleString('pt-BR')}% a.a.`));

  // editor da renda (componentes)
  const comps = (estado.config?.metas?.rendaComponentes || []).map((c) => ({ ...c }));
  const rcard = el('div', { class: 'card' });
  rcard.append(el('h3', {}, 'Sua renda mensal'));
  rcard.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'Some tudo que entra por mês (salário, benefícios, bolsa). É a base da liberdade financeira e do "viver de dividendos".'));
  comps.forEach((c, i) => {
    const nomeInp = el('input', { type: 'text', value: c.nome, placeholder: 'nome' });
    const valInp = el('input', { type: 'number', step: '0.01', min: '0', value: String(c.valor), class: 'renda-val' });
    const salvar = async () => {
      const novos = comps.map((x, j) => (j === i
        ? { nome: nomeInp.value.trim() || 'Renda', valor: Number(valInp.value) || 0 }
        : x));
      estado = C.definirMetas(estado, { rendaComponentes: novos });
      await persistir();
    };
    nomeInp.addEventListener('blur', salvar);
    valInp.addEventListener('blur', salvar);
    valInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
    rcard.append(el('div', { class: 'form-row' }, [
      field('Componente', nomeInp),
      field('Valor (R$/mês)', valInp),
      el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', {
        class: 'btn danger', title: 'Remover',
        onclick: async () => {
          estado = C.definirMetas(estado, { rendaComponentes: comps.filter((_, j) => j !== i) });
          await persistir(); toast('Componente removido');
        },
      }, '✕')]),
    ]));
  });
  rcard.append(el('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:4px' }, [
    el('button', {
      class: 'btn ghost',
      onclick: async () => {
        estado = C.definirMetas(estado, { rendaComponentes: [...comps, { nome: 'Novo', valor: 0 }] });
        await persistir();
      },
    }, '+ Adicionar componente'),
    el('span', { class: 'muted' }, `Total: ${fmt(m.renda)}`),
  ]));
  v.append(rcard);

  // editor das premissas (patrimônio, aporte, taxa, meses de liberdade, yield)
  const meta = estado.config?.metas || {};
  const patInp = el('input', { type: 'number', step: '0.01', min: '0', value: String(m.patrimonioInvestido) });
  const apInp = el('input', { type: 'number', step: '0.01', min: '0', value: String(m.aporteMensal) });
  const taxaInp = el('input', { type: 'number', step: '0.1', min: '0', value: String(((Number(meta.taxaAnual) || 0) * 100)) });
  const libInp = el('input', { type: 'number', step: '1', min: '0', value: String(m.liberdade.metaMeses) });
  const yldInp = el('input', { type: 'number', step: '0.1', min: '0', value: String(((m.dividendos.yield || 0) * 100)) });
  const salvarPrem = async () => {
    estado = C.definirMetas(estado, {
      patrimonioInvestido: Number(patInp.value) || 0,
      aporteMensal: Number(apInp.value) || 0,
      taxaAnual: (Number(taxaInp.value) || 0) / 100,
      libFinanceiraMeses: Math.max(0, Math.round(Number(libInp.value) || 0)),
      dividendosYield: (Number(yldInp.value) || 0) / 100,
    });
    await persistir(); toast('Premissas salvas');
  };
  const pcard = el('div', { class: 'card' });
  pcard.append(el('h3', {}, 'Premissas'));
  pcard.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'O patrimônio é o que você já tem investido (o app não puxa cotação — você atualiza aqui). O rendimento anual projeta o prazo; o yield define quanto capital gera renda passiva igual à sua renda.'));
  pcard.append(el('div', { class: 'form-row' }, [
    field('Patrimônio investido (R$)', patInp),
    field('Aporte mensal (R$)', apInp),
    field('Rendimento anual (%)', taxaInp),
  ]));
  pcard.append(el('div', { class: 'form-row' }, [
    field('Liberdade: meses de renda', libInp),
    field('Dividendos: yield (% a.a.)', yldInp),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: salvarPrem }, 'Salvar premissas')]),
  ]));
  v.append(pcard);
}

// ---------- Config ----------
function renderConfig(v) {
  v.append(el('h2', {}, 'Configurações'));

  v.append(contasPropriasEditor());
  v.append(regrasEditor());
  v.append(chipsEditor('Categorias', 'categorias'));
  v.append(chipsEditor('Formas de pagamento', 'formasPagamento'));

  const backup = el('div', { class: 'card' });
  backup.append(el('h3', {}, 'Backup dos dados'));
  const info = el('div', { class: 'muted', style: 'margin-bottom:10px' }, 'Carregando local...');
  localDados().then((p) => { info.textContent = `Dados salvos em: ${p}`; });
  backup.append(info);
  backup.append(el('div', { class: 'form-row' }, [
    el('button', { class: 'btn', onclick: async () => { const nome = await exportarBackup(estado); if (nome) toast(`Exportado: ${nome}`); } }, '⭳ Exportar backup (.json)'),
    el('button', { class: 'btn ghost', onclick: async () => {
      const novo = await importarBackup();
      if (novo) { liberarGravacao(); estado = novo; await persistir(); toast('Backup importado!'); }
    } }, '⭱ Importar backup'),
  ]));
  v.append(backup);
}

// Um Pix seu para você mesmo (BTG -> Sicredi) não é ganho nem gasto. Estes textos
// (seu CPF, seu nome) marcam o lançamento como transferência, fora dos totais.
function contasPropriasEditor() {
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, 'Minhas contas (transferências entre elas)'));
  wrap.append(el('p', { class: 'muted' }, 'Se a descrição do extrato contiver um destes textos (seu CPF ou seu nome), o lançamento vira "Transferência" — registrado, mas fora de entradas e saídas. Sem isso, mandar dinheiro de um banco seu para outro apareceria como ganho E como gasto.'));

  const lista = estado.config.contasProprias || [];
  if (lista.length) {
    wrap.append(el('div', { class: 'chips' }, lista.map((item) => el('span', { class: 'chip' }, [
      item,
      el('button', { title: 'Remover', onclick: async () => {
        estado = { ...estado, config: { ...estado.config, contasProprias: lista.filter((x) => x !== item) } };
        await persistir();
      } }, '✕'),
    ]))));
  }
  const inp = el('input', { type: 'text', placeholder: 'seu CPF ou seu nome' });
  const add = el('button', { class: 'btn', onclick: async () => {
    const val = inp.value.trim();
    if (!val || lista.includes(val)) return;
    estado = { ...estado, config: { ...estado.config, contasProprias: [...lista, val] } };
    await persistir(); toast('Adicionado');
  } }, '+ Adicionar');
  wrap.append(el('div', { class: 'form-row' }, [field('CPF ou nome', inp), el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add])]));
  return wrap;
}

// Regras de categorização: o que faz a importação (e o campo Descrição) acertarem.
function regrasEditor() {
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, 'Regras de categorização'));
  wrap.append(el('p', { class: 'muted' }, 'Quando a descrição contiver o texto da regra, o Finan já preenche a categoria. Vale na importação do extrato e no campo Descrição ao lançar.'));

  const minhas = estado.config.regras || [];
  if (minhas.length) {
    wrap.append(el('div', { class: 'chips' }, minhas.map((r) => el('span', { class: 'chip' }, [
      `"${r.padrao}" → ${r.categoria}`,
      el('button', { title: 'Remover', onclick: async () => {
        estado = C.removerRegra(estado, r.padrao); await persistir();
      } }, '✕'),
    ]))));
  }

  const padrao = el('input', { type: 'text', placeholder: 'ex.: zaffari' });
  const cat = opts(el('select'), estado.config.categorias);
  const cls = opts(el('select'), ['', ...estado.config.classificacoes]);
  const add = el('button', { class: 'btn', onclick: async () => {
    const p = padrao.value.trim();
    if (!p) return toast('Escreva o texto que aparece no extrato.');
    estado = C.adicionarRegra(estado, { padrao: p, categoria: cat.value, classificacao: cls.value });
    await persistir(); toast('Regra criada');
  } }, '+ Criar regra');
  wrap.append(el('div', { class: 'form-row' }, [
    field('Se a descrição contiver', padrao), field('Categoria', cat), field('Classificação', cls),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add]),
  ]));
  wrap.append(el('div', { class: 'muted' }, `${C.REGRAS_PADRAO.length} regras já vêm prontas (iFood, posto, mercado, farmácia, Uber…).`));
  return wrap;
}

function chipsEditor(titulo, chave) {
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, titulo));
  const chips = el('div', { class: 'chips' }, estado.config[chave].map((item) => el('span', { class: 'chip' }, [
    item,
    el('button', { title: 'Remover', onclick: async () => {
      estado = { ...estado, config: { ...estado.config, [chave]: estado.config[chave].filter((x) => x !== item) } };
      await persistir();
    } }, '✕'),
  ])));
  wrap.append(chips);
  const inp = el('input', { type: 'text', placeholder: `nova ${titulo.toLowerCase()}` });
  const add = el('button', { class: 'btn', onclick: async () => {
    const val = inp.value.trim();
    if (!val || estado.config[chave].includes(val)) return;
    estado = { ...estado, config: { ...estado.config, [chave]: [...estado.config[chave], val] } };
    await persistir();
  } }, '+ Adicionar');
  wrap.append(el('div', { class: 'form-row' }, [field('Nova', inp), el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add])]));
  return wrap;
}

// ---------- init ----------
async function init() {
  estado = await carregarEstado();
  if (falhaDeLeitura()) toast(AVISO_LEITURA, 15000);
  const meses = C.mesesComMovimento(estado);
  if (meses.length) mesAtual = meses[meses.length - 1];

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tabAtual = b.dataset.tab;
    [...$('#tabs').children].forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('#mesSelect').addEventListener('change', (e) => { mesAtual = e.target.value; render(); });

  atualizarTopo();
  render();
}

init();
