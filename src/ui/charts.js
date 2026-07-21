// charts.js — gráficos em SVG puro, montados no DOM. Sem biblioteca: a CSP do
// Electron bloqueia CDN, e o app tem que funcionar offline.
//
// Cores: usa --c-in/--c-out do tema (entradas x saídas) e --c-cat (magnitude).
// O par entra/sai fica no piso 8–12 de separação p/ daltonismo (verde×vermelho é
// o pior caso de deuteranopia) — legal só COM codificação secundária: posição
// (barras agrupadas), legenda e rótulos. Não troque sem rerodar
// scripts/validate_palette.js. As cores vêm de style (var() em atributo de
// apresentação não resolve de forma confiável).

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesCurto = (mesISO) => {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return nomes[Number(String(mesISO).slice(5, 7)) - 1] || '';
};

// Escala "bonita" pro topo do eixo: 6k em vez de 5.837,19 — mas colada no dado.
// Os degraus são finos de propósito: com [1,2,5,10] um máximo de 5,4k viraria
// topo 10k e as barras usariam metade da altura à toa.
function topoEscala(max) {
  if (max <= 0) return 100;
  const pot = 10 ** Math.floor(Math.log10(max));
  const passo = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((p) => p * pot >= max) || 10;
  return passo * pot;
}

// 0 / 3k / 6k — e 1,5k quando a escala for fina.
function rotuloEixo(v) {
  if (v === 0) return '0';
  if (v < 1000) return String(Math.round(v));
  const k = v / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')}k`;
}

// ---- Evolução: entradas x saídas por mês (barras agrupadas) ----
// Duas séries -> legenda obrigatória (identidade nunca só pela cor) + tooltip.
export function graficoEvolucao(serie, { altura = 190 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';

  // legenda
  const leg = document.createElement('div');
  leg.className = 'chart-legend';
  for (const [rotulo, cor] of [['Entradas', 'var(--c-in)'], ['Saídas', 'var(--c-out)']]) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('i');
    dot.style.background = cor;
    item.append(dot, document.createTextNode(rotulo));
    leg.append(item);
  }
  wrap.append(leg);

  const L = 46; const R = 8; const T = 10; const B = 22; // margens
  const W = 520; const H = altura;
  const plotW = W - L - R;
  const plotH = H - T - B;

  const max = Math.max(...serie.flatMap((p) => [p.entradas, p.saidas]), 0);
  const topo = topoEscala(max);
  const y = (v) => T + plotH - (v / topo) * plotH;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img',
    'aria-label': 'Entradas e saídas por mês',
  });

  // grade recessiva + rótulos do eixo
  for (let i = 0; i <= 2; i += 1) {
    const v = (topo / 2) * i;
    svg.append(s('line', {
      x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid',
    }));
    svg.append(s('text', {
      x: L - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end',
    }, rotuloEixo(v)));
  }

  const passo = plotW / serie.length;
  const larguraBarra = Math.min(18, (passo - 8) / 2);

  serie.forEach((p, i) => {
    const centro = L + passo * i + passo / 2;
    // 2px de respiro entre as duas barras do mesmo mês
    const pares = [
      { v: p.entradas, x: centro - larguraBarra - 1, cor: 'var(--c-in)', nome: 'Entradas' },
      { v: p.saidas, x: centro + 1, cor: 'var(--c-out)', nome: 'Saídas' },
    ];
    for (const b of pares) {
      const alt = Math.max(0, T + plotH - y(b.v));
      const rect = s('rect', {
        x: b.x, y: b.v > 0 ? y(b.v) : T + plotH, width: larguraBarra,
        height: b.v > 0 ? alt : 0, rx: 4, class: 'bar-mark',
      });
      rect.style.fill = b.cor;
      rect.append(s('title', {}, `${b.nome} · ${mesCurto(p.mes)} · ${brl(b.v)}`));
      svg.append(rect);
    }
    svg.append(s('text', {
      x: centro, y: H - 6, class: 'axis', 'text-anchor': 'middle',
    }, mesCurto(p.mes)));
  });

  // linha de base
  svg.append(s('line', {
    x1: L, x2: W - R, y1: T + plotH, y2: T + plotH, class: 'baseline',
  }));

  wrap.append(svg);
  return wrap;
}

// ---- Gastos por categoria: barras horizontais, uma cor só ----
// Série única = magnitude ordenada. Sem legenda (o título já nomeia), com o
// valor escrito na ponta — nada de decorar cor por categoria.
export function graficoCategorias(itens, { max = 6 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-cats';

  const lista = itens.slice(0, max);
  const teto = lista.reduce((a, x) => Math.max(a, x.valor), 0) || 1;

  for (const it of lista) {
    const linha = document.createElement('div');
    linha.className = 'catrow';

    const nome = document.createElement('div');
    nome.className = 'catrow-nome';
    nome.textContent = it.categoria;
    nome.title = it.categoria;

    const trilho = document.createElement('div');
    trilho.className = 'bar';
    const barra = document.createElement('i');
    barra.style.width = `${Math.max(2, (it.valor / teto) * 100)}%`;
    barra.title = `${it.categoria}: ${brl(it.valor)}`;
    trilho.append(barra);

    const valor = document.createElement('div');
    valor.className = 'catrow-valor num';
    valor.textContent = brl(it.valor);

    linha.append(nome, trilho, valor);
    wrap.append(linha);
  }
  return wrap;
}

// ---- Sparkline: mini série (área + linha + ponta destacada) ----
// Cor via style (não atributo) pra resolver var() e reagir ao tema. Estica na
// largura (preserveAspectRatio=none) — por isso a viewBox é larga, pra ponta não
// virar elipse.
export function sparkline(vals, { stroke = 'var(--brand)', fill = 'transparent', w = 220, h = 30, pad = 3 } = {}) {
  const nums = (vals || []).map((v) => Number(v) || 0);
  if (!nums.length) return s('svg', { viewBox: `0 0 ${w} ${h}`, class: 'spark' });
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = (max - min) || 1;
  const n = Math.max(1, nums.length - 1);
  const X = (i) => pad + (i * (w - 2 * pad)) / n;
  const Y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const pts = nums.map((v, i) => [X(i), Y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `M${X(0).toFixed(1)} ${h - pad} ${pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} L${X(nums.length - 1).toFixed(1)} ${h - pad} Z`;

  const svg = s('svg', {
    viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, preserveAspectRatio: 'none', class: 'spark',
  });
  const pArea = s('path', { d: area }); pArea.style.fill = fill;
  const pLine = s('path', {
    d: line, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke',
  });
  pLine.style.stroke = stroke; pLine.style.strokeWidth = '2';
  const last = pts[pts.length - 1];
  const dot = s('circle', { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 3 }); dot.style.fill = stroke;
  svg.append(pArea, pLine, dot);
  return svg;
}

// ---- Medidor de saúde: anel SVG (0–100). Cor via CSS (.hero .gauge). ----
export function gaugeSaude(score) {
  const R = 46;
  const circ = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const svg = s('svg', { viewBox: '0 0 104 104', class: 'gauge', 'aria-hidden': 'true' });
  svg.append(s('circle', { cx: 52, cy: 52, r: R, class: 'track' }));
  const val = s('circle', {
    cx: 52, cy: 52, r: R, class: 'val',
    'stroke-dasharray': `${((pct / 100) * circ).toFixed(1)} ${circ.toFixed(1)}`,
  });
  svg.append(val);
  return svg;
}
