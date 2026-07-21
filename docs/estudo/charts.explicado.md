# `src/ui/charts.js` — explicado

> **O que é este arquivo:** os gráficos do app, **desenhados à mão em SVG**,
> sem nenhuma biblioteca de charts (Chart.js, D3, etc.). O próprio cabeçalho do
> arquivo explica o porquê: a CSP (Content Security Policy) do Electron bloqueia
> scripts de CDN, e o app precisa funcionar 100% offline — então "instalar uma
> lib" significaria vendorizar o pacote inteiro só pra desenhar quatro tipos de
> gráfico simples. Construir na mão com a API nativa de DOM/SVG saiu mais barato.
>
> **Papel na arquitetura:** funções puras de **apresentação** — recebem dados já
> prontos (vindos de [`calculos.js`](./calculos.explicado.md), por exemplo) e
> devolvem um elemento DOM pronto pra `app.js` inserir na tela. Não leem
> `estado` global, não têm efeito colateral além de criar elementos.

---

## Bloco 0 — o helper `s()`: um mini "hyperscript" para SVG

```js
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
```

**O que faz.** Uma função que cria **qualquer** elemento SVG (`svg`, `rect`,
`circle`, `line`, `text`, `path`...) a partir de três coisas: a tag, um objeto
de atributos, e filhos (texto ou outros elementos). Sem isso, cada elemento
precisaria de 3-4 linhas repetidas de `createElementNS` + `setAttribute` em
loop.

**Sintaxe:**
- `document.createElementNS(NS, tag)` — **por que não `createElement`?** SVG
  não é HTML: tags como `<rect>` ou `<circle>` só se comportam como elementos
  gráficos se criadas no **namespace XML do SVG**
  (`http://www.w3.org/2000/svg`). `createElement` puro criaria um elemento
  HTML desconhecido (efetivamente inerte); `createElementNS` é obrigatório
  aqui.
- `for (const [k, v] of Object.entries(attrs))` — itera pares chave/valor do
  objeto de atributos, `setAttribute(k, String(v))` pra cada um.
  `if (v !== null && v !== undefined)` pula atributos "ausentes" de propósito
  (permite passar `{ 'aria-label': condicao ? 'x' : null }` sem sujar o SVG com
  `aria-label="null"`).
- `[].concat(children)` — normaliza `children` pra sempre virar array, mesmo
  que quem chamou passe um item solto (não-array). `[].concat(x)` acha `x` e
  devolve `[x]`; `[].concat([a,b])` devolve `[a,b]` sem aninhar. Um truque
  clássico pra aceitar "um ou vários" sem precisar de dois caminhos de código.
- `c.nodeType ? c : document.createTextNode(String(c))` — aceita tanto nós DOM
  prontos quanto strings/números soltos como filho; `nodeType` só existe em
  nós DOM de verdade, então essa checagem distingue "já é elemento" de
  "preciso converter em texto".

**Conceito por trás — hyperscript.** Esse padrão (`tag, attrs, children →
elemento`) é o mesmo usado por bibliotecas como Snabbdom, Mithril ou o
`h()` do Vue/Preact — só que aqui, sem framework nenhum, numa função de 10
linhas focada apenas em SVG. Vale reconhecer o padrão: sempre que você vir uma
função `h`/`s`/`el` com essa assinatura em qualquer código, é a mesma ideia.

**O cabeçalho do arquivo (linhas 1–9) — por que ele merece ser lido com atenção.** Não é só
"sem lib porque é offline": ele documenta uma **decisão de acessibilidade testada**. O par
entrada/saída usa `--c-in`/`--c-out` (verde/vermelho, a expectativa universal de "positivo/
negativo" em finanças) — mas verde×vermelho é justamente **o pior caso de contraste para
deuteranopia** (o tipo mais comum de daltonismo). A solução do projeto não é trocar as cores
(perderia a convenção), é **nunca depender só delas**: o contraste de luminosidade entre as
duas fica num piso de 8–12 (validado por `scripts/validate_palette.js`, que roda como parte do
processo de mudança de tema) e todo gráfico que usa esse par **sempre** soma uma segunda pista —
posição (barras lado a lado), legenda com texto, ou rótulo. Cor sozinha nunca é a única portadora
de significado neste arquivo. O cabeçalho também antecipa a razão técnica repetida nos blocos
5 e 6: cores **têm** que vir de `style` (propriedade CSS), não de atributo de apresentação SVG —
só assim `var(--c-in)` resolve de verdade e reage à troca de tema claro/escuro.

---

## Bloco 1 — formatação: `brl` e `mesCurto`

```js
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesCurto = (mesISO) => {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return nomes[Number(String(mesISO).slice(5, 7)) - 1] || '';
};
```

**O que faz.** `brl` formata um número como moeda brasileira usando a API
nativa `Intl` (via `toLocaleString`) — sem biblioteca de formatação. `mesCurto`
transforma `"2026-07"` em `"jul"` pra rótulos de eixo compactos.

**Sintaxe:** `nomes[Number(...) - 1]` — os meses no formato `"YYYY-MM"` vão de
`01` a `12`; o array é indexado de `0` a `11`, daí o `-1`. `|| ''` cobre a
entrada inválida (mês fora do range vira string vazia, não `undefined` no
rótulo).

---

## Bloco 2 — escalas "bonitas": `topoEscala` e `rotuloEixo`

```js
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
```

**O que faz.** `topoEscala` decide onde o eixo Y "termina" — não no valor
exato do maior dado, mas num número redondo **logo acima** dele (6.000 em vez
de 5.837,19). `rotuloEixo` escreve esse número de forma compacta (`"6k"` em vez
de `"6000"`).

**Como o algoritmo de `topoEscala` funciona, passo a passo (exemplo: max =
5.837):**
1. `Math.log10(5837) ≈ 3.77`; `Math.floor(...) = 3`; `pot = 10³ = 1000`. Isso
   isola a "casa decimal" do número (milhares).
2. Testa a lista de multiplicadores `[1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]`
   contra `pot`, procurando o **primeiro** que — multiplicado por `pot` — já
   cobre o `max`: `5 * 1000 = 5000` (não cobre 5837) → `6 * 1000 = 6000` (cobre!).
   `.find(...)` para no primeiro que serve.
3. Resultado: topo = **6000**, não 10000 nem 5837.

**Conceito por trás — por que não `[1, 2, 5, 10]` (a lista "clássica" de
escalas)?** Com degraus grandes, um máximo de 5.400 saltaria direto pro
próximo múltiplo "redondo" disponível — 10.000 — e as barras usariam só
**metade** da altura do gráfico à toa (5.400/10.000 = 54%). A lista mais fina
usada aqui (`1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10`) tem degraus menores, então
o topo fica **colado** no dado real sem cortar informação — o gráfico usa a
altura disponível de forma mais honesta. É uma versão específica do algoritmo
de "*nice numbers*" que qualquer biblioteca de gráficos (D3 incluída)
implementa por baixo dos panos para gerar eixos legíveis.

**`rotuloEixo`:** `k.toFixed(1).replace('.', ',')` — formata com 1 casa decimal
e troca o separador decimal de ponto (padrão de `toFixed`) por vírgula (padrão
brasileiro) — um `replace` simples em vez de reimplementar `toLocaleString`
para esse caso pontual.

---

## Bloco 3 — `graficoEvolucao`: barras agrupadas (entradas × saídas)

```js
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
  // (o resto do corpo — grade, barras, linha de base — está nos blocos de código
  // seguintes; é a mesma função, só fatiada em pedaços menores para comentar cada um)
```

**O que faz.** Monta um gráfico de barras agrupadas (duas barras lado a lado
por mês: entradas e saídas), com legenda, grade de fundo e rótulos de eixo —
tudo em SVG cru.

**Sintaxe — a matemática de coordenadas:**
- `L, R, T, B` (esquerda/direita/topo/baixo) são as **margens** — espaço
  reservado pros rótulos do eixo Y (`L=46`, mais largo, porque números como
  "6k" precisam de espaço) e pros rótulos do eixo X (`B=22`, os nomes dos
  meses).
- `plotW`/`plotH` — a área **útil** de desenho, já descontadas as margens.
- `y = (v) => T + plotH - (v / topo) * plotH` — a função que converte um
  **valor de dado** (reais) numa **coordenada de tela** (pixels do SVG). Repare
  na inversão: em SVG, `y=0` é o **topo**; em um gráfico, valores maiores
  devem ficar **mais acima na tela** (`y` menor). Por isso `plotH - (fração)`:
  quanto maior `v/topo`, mais se subtrai de `plotH`, menor o `y` final, mais
  alto na tela.

**Conceito por trás — por que legenda aqui, mas não no próximo gráfico
(`graficoCategorias`)?** Este gráfico tem **duas séries** (entradas e saídas)
codificadas só pela cor — identidade **nunca** deve depender só de cor (daltonismo,
impressão P&B), então a legenda com texto é obrigatória. O gráfico de
categorias (Bloco 4) tem **uma série só**, então o título já basta como
identidade e a legenda seria redundante. É a mesma regra por trás de qualquer
metodologia séria de visualização de dados: *legenda sempre que houver 2+
séries, nunca dispensável nesse caso; opcional/ausente quando há 1 só.*

```js
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
```

**Grade de fundo.** Só 3 linhas (`i = 0, 1, 2` → `v = 0, topo/2, topo`) — uma
grade "recessiva" (fina, cor neutra via `.grid` no CSS), o suficiente pra
âncora visual sem competir com os dados. `text-anchor: end` alinha o número
à direita, "colado" na margem esquerda do gráfico.

```js
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
```

**Fechando a função.** A linha de base (`baseline`) é só uma referência visual do "zero" do
gráfico — a mesma ideia da grade, mas em destaque (classe própria no CSS). `wrap.append(svg)`
encaixa o SVG dentro da `div.chart` (que já contém a legenda, montada lá no início da função);
`return wrap` devolve esse `div` pronto pra `app.js` inserir na tela.

**As barras.** `passo = plotW / serie.length` — a largura "fatiada" que cada
mês ocupa. `larguraBarra = Math.min(18, (passo - 8) / 2)` — a barra nunca passa
de 18px (não fica gorda demais com poucos meses), e encolhe proporcionalmente
se `serie` tiver muitos pontos (evita que barras vizinhas se sobreponham).

**`centro - larguraBarra - 1` / `centro + 1`** — as duas barras do mesmo mês
ficam encostadas no centro da fatia, com **2px de respiro** entre elas (o `-1`
de uma lado, `+1` do outro) — um detalhe deliberado de acabamento visual
(separação mínima entre marcas vizinhas), não acidente de arredondamento.

**`rx: 4`** — cantos arredondados na ponta da barra (não no retângulo
inteiro — como a base da barra está "grudada" na linha de base, só o topo
visualmente parece arredondado).

**`s('title', {}, texto)` dentro do `<rect>`** — um `<title>` SVG é a forma
**nativa** de tooltip: passe o mouse sobre a barra e o navegador mostra a
dica sozinho, **sem** precisar de nenhum JavaScript de hover/posicionamento.
Zero-custo de manutenção pra um tooltip funcional.

**Conceito por trás — o gráfico inteiro é "sem estado".** Note que
`graficoEvolucao` não guarda nada, não escuta nenhum evento próprio (fora o
`:hover` do CSS) — é uma função pura `dados → elemento DOM`. Se os dados
mudarem, `app.js` simplesmente chama a função de novo e troca o elemento
antigo pelo novo. Não existe "atualizar o gráfico existente" — existe "gerar
um gráfico novo e substituir o velho". A mesma filosofia de "derive, não
mute" do núcleo, agora na camada visual.

---

## Bloco 4 — `graficoCategorias`: barras horizontais, uma cor só

```js
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
```

**O que faz.** Um "ranking" de gastos por categoria: nome + barra proporcional
+ valor, as `max` maiores categorias (top 6 por padrão). Cada linha (`.catrow`) é montada com
**três `div`s filhos** — `nome`, `trilho` (que contém a barra `<i>` propriamente dita) e `valor`
— que o CSS organiza em três colunas (grid), o mesmo padrão de "montar peça por peça e anexar no
fim" (`linha.append(nome, trilho, valor)`) que você já viu na legenda do Bloco 3.

**`nome.title = it.categoria`.** Mais um tooltip HTML nativo — útil quando o nome da categoria é
longo e o CSS trunca (`text-overflow: ellipsis`, ver `app.css`): passar o mouse mostra o nome
inteiro sem precisar de JS de posicionamento.

**Sintaxe:**
- Isto **não usa SVG** — é HTML puro (`<div>`/`<i>`) com a largura da barra
  controlada por `style.width` em porcentagem. Pra uma barra horizontal simples
  (sem eixo, sem múltiplas séries), CSS puro é mais barato que montar
  coordenadas SVG.
- `Math.max(2, (it.valor / teto) * 100)` — a barra nunca fica **totalmente**
  invisível (mínimo 2% de largura), mesmo pra uma categoria com valor muito
  pequeno perto do teto — senão a linha existiria sem nenhuma pista visual.
- `barra.title = ...` — aqui o tooltip é o atributo **HTML** `title` (não o
  `<title>` SVG do bloco anterior); mesmo efeito (dica nativa do navegador),
  API diferente porque o elemento é HTML, não SVG.

**Conceito por trás.** Sem legenda (só uma cor, `--c-cat`, pro conjunto
inteiro) porque a **identidade** de cada linha já vem do **nome escrito ao
lado**, não da cor. Cor aqui carrega só *"isto é uma barra de magnitude"* —
não precisa distinguir categoria por matiz.

---

## Bloco 5 — `sparkline`: mini-gráfico de linha

```js
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
```

**O que faz.** Um gráfico de linha minúsculo (usado dentro de KPIs/cards) —
sem eixo, sem grade, só a forma da tendência.

**Sintaxe — construindo um "path" SVG manualmente:**
- `X(i)`/`Y(v)` — as mesmas funções de escala do Bloco 3, mas **normalizadas**
  pelo próprio intervalo dos dados (`min`/`max` da série), não por um
  `topoEscala` fixo — faz sentido aqui porque a sparkline não tem eixo visível
  pra comparar valor absoluto; só a **forma** da curva importa.
- `${i ? 'L' : 'M'}${x} ${y}` — sintaxe de **comandos de path SVG**: `M` (move
  to) posiciona a "caneta" sem desenhar, usado só no primeiro ponto; `L` (line
  to) desenha uma linha reta até o próximo ponto. O operador ternário troca
  entre os dois conforme o índice.
- `area` — o mesmo caminho da linha, mas **fechado** descendo até a base
  (`h - pad`) nas duas pontas e com `Z` (close path) no final — vira uma forma
  fechada preenchível (o "chão" sob a linha), não só um traço.

```js
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
```

**Montando o SVG final.** `preserveAspectRatio: 'none'` é o que permite o gráfico **esticar**
livremente pra caber na largura do card (sem isso, o navegador manteria a proporção do
`viewBox` e sobraria espaço vazio nas laterais). `pArea`/`pLine`/`dot` são os três elementos que
compõem o desenho: a área preenchida (fundo), a linha (traço) e o ponto final em destaque (a
"ponta" que chama atenção pro valor mais recente). Repare no idioma repetido `const x = s(...);
x.style.algo = valor` — cria o elemento com atributos estruturais (`d`, `cx`, `cy`, `r`) via `s()`
e só **depois** aplica cor via `style` (a mesma regra do cabeçalho do arquivo). `svg.append(pArea,
pLine, dot)` anexa os três **numa ordem que importa**: em SVG, quem vem depois é desenhado por
cima — a área fica atrás, a linha por cima dela, e o ponto por cima de tudo.

**`vector-effect: non-scaling-stroke`** — como o SVG usa
`preserveAspectRatio="none"` (estica pra caber na largura do card sem manter
proporção), um traço comum **esticaria/afinaria** junto com a distorção. Este
atributo trava a espessura do traço em pixels de tela reais, não em unidades
do `viewBox` — sem ele, a linha ficaria com espessura inconsistente conforme o
card mudasse de tamanho.

**Conceito por trás — cor via `style`, não via atributo.** O comentário do
arquivo já avisa: `stroke`/`fill` são passados por `style.stroke =`, não por
`setAttribute('stroke', ...)`. Atributos de apresentação SVG não resolvem
`var(--cor-custom)` de forma confiável em todo navegador; propriedades CSS via
`style` resolvem sempre, porque passam pelo mesmo mecanismo de cascata/tema que
o resto da página (inclusive reagindo à troca clara/escuro do tema).

---

## Bloco 6 — `gaugeSaude`: anel de progresso (0–100)

```js
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
```

**O que faz.** O anel circular usado no "hero" da tela inicial pra representar
o [score de saúde financeira](./score.explicado.md) (0 a 100) como um anel que
se preenche proporcionalmente.

**Conceito por trás — o truque do `stroke-dasharray` como medidor.** Um
círculo SVG normalmente tem um traço contínuo. `stroke-dasharray: "A B"` diz
"desenhe `A` unidades de traço, depois `B` unidades de espaço vazio, repetindo
ao longo do perímetro". Aqui, `B` é sempre a **circunferência inteira**
(`circ`), então o padrão nunca chega a repetir — e `A` é a fração do
perímetro proporcional ao score (`pct/100 * circ`). O resultado visual: um
arco que cobre exatamente `pct`% do círculo, o resto fica "vazio" (mostrando o
`.track` de fundo por baixo).

**Por que isso não é feito com SVG `<path>` de arco (`A` no `d=`)?**
Calcular o ponto final de um arco exige trigonometria (seno/cosseno do ângulo).
O truque de `dasharray` transforma um problema geométrico num problema de
**comprimento linear** — só multiplicação — mais simples de acertar e de
animar (basta fazer `stroke-dasharray` transicionar via CSS).

**`aria-hidden="true"`** — o anel é **decorativo**; o valor numérico de verdade
é escrito como texto em algum outro elemento ao lado (`.gauge-num`, no HTML
gerado por `app.js`) — é esse texto que leitores de tela devem anunciar, não o
SVG. Marcar o gráfico como oculto pra acessibilidade evita duplicar/confundir
a leitura.

**Nota sobre a rotação:** o CSS (`app.css`, `.hero .gauge`) aplica
`transform: rotate(-90deg)` no `<svg>` inteiro — por padrão, um círculo SVG
"começa" o traço às 3 horas (leste); girar -90° faz o preenchimento começar no
topo (12 horas), o ponto de partida que se espera visualmente de um medidor.

---

## Mapa mental

```
  dados prontos (calculos.js, score.js, ...)
        │
        ▼
  s(tag, attrs, children)  ── mini-hyperscript p/ SVG (namespace correto)
        │
        ├── graficoEvolucao()   → <div class="chart"> (legenda + SVG barras agrupadas)
        ├── graficoCategorias() → <div class="chart-cats"> (HTML puro, barras horizontais)
        ├── sparkline()         → <svg class="spark"> (path M/L + área fechada)
        └── gaugeSaude()        → <svg class="gauge"> (stroke-dasharray = anel de progresso)
                │
                ▼
        elemento DOM pronto ──► app.js insere em #view
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Hyperscript (`tag, attrs, children → elemento`)** | `s()` | função genérica de criação de elemento, sem framework |
| **Namespace SVG obrigatório** | `createElementNS` | `<rect>`/`<circle>` só "funcionam" nesse namespace |
| **"Nice numbers" no eixo** | `topoEscala` | topo do eixo redondo, mas colado no dado real |
| **Legenda ⟺ nº de séries** | `graficoEvolucao` vs. `graficoCategorias` | 2+ séries = legenda obrigatória; 1 série = título já basta |
| **`<title>`/`title=` como tooltip nativo** | barras e categorias | dica do navegador de graça, sem JS de hover |
| **Path SVG (`M`/`L`/`Z`)** | `sparkline` | comandos de caneta: mover, desenhar linha, fechar forma |
| **`vector-effect: non-scaling-stroke`** | `sparkline` | traço com espessura fixa mesmo com `viewBox` distorcido |
| **Cor via `style`, não atributo** | `sparkline`/gráficos | garante que `var(--token)` resolva de verdade |
| **`stroke-dasharray` como medidor circular** | `gaugeSaude` | vira geometria de arco em conta de comprimento linear |
| **Função pura `dados → elemento`** | o arquivo inteiro | sem estado próprio; re-render = gerar de novo e substituir |

**Próximo:** [`app.css`](./app.css.explicado.md) — o sistema de tema
(claro/escuro) e as classes (`.chart-svg`, `.gauge`, `.catrow`...) que dão vida
visual a tudo que este arquivo desenha.
