# `src/ui/app.js` — Parte 2: Início (`renderDashboard` e companhia)

> **O que é esta parte:** as linhas 100–323 de `app.js` — a tela de abertura
> do app (`renderDashboard`) e todas as funções que só ela usa: o hero com o
> saldo em destaque e o medidor de saúde (`heroInicio`, `heroDelta`, `pilar`),
> o chip de variação dos KPIs (`footDelta`), o card de visão anual
> (`cardVisaoAnual`), a fábrica de card de KPI (`kpi`), e as duas linhas de
> fatura reaproveitadas em outras telas (`linhaFatura`, `linhaAdiantar`).
>
> **Papel na arquitetura:** é a tela que a maioria das sessões do app abre
> primeiro — "quanto eu tenho, como estou indo". Ela não introduz regra de
> negócio nova nenhuma: é **cem por cento composição** de números já
> calculados pelo núcleo (`resumoMes`, `scoreSaude`, `saldoAcumulado`,
> `comprometidoFuturo`, `serieMensal`, `gastoPorCategoria`, `resumoAno`,
> `anosComMovimento`, `faturasDoMes`) com os helpers de DOM da Parte 1 (`el`,
> `field`, `fmt`) e os desenhistas de `charts.js` (`sparkline`, `gaugeSaude`,
> `graficoEvolucao`, `graficoCategorias`).
>
> **Pré-requisitos:** [Parte 1](./app.parte1.explicado.md) (helpers `el`,
> `field`, `fmt`, `persistir`, e a variável `mesAtual`), [`calculos.explicado.md`](./calculos.explicado.md)
> (`resumoMes`, `saldoAcumulado`, `comprometidoFuturo`, `serieMensal`,
> `gastoPorCategoria`, `resumoAno`, `anosComMovimento` — praticamente todo o
> vocabulário numérico desta parte vem de lá), [`score.explicado.md`](./score.explicado.md)
> (`scoreSaude`, os três pilares e a `faixa`), [`faturasPagas.explicado.md`](./faturasPagas.explicado.md)
> (`faturasDoMes`, `registrarPagamentoFatura`) e [`charts.explicado.md`](./charts.explicado.md)
> (`sparkline`, `gaugeSaude`, `graficoEvolucao`, `graficoCategorias`).

---

## Bloco 1 — `renderDashboard`: as cinco leituras do núcleo

```js
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
```

**O que faz.** Cinco chamadas ao núcleo abrem a função, cada uma pedindo um
recorte diferente do mesmo `estado`/`mesAtual`: o resumo do mês (`r`), o score
de saúde (`s`), o saldo acumulado até aqui (`emConta`), o comprometido futuro
em faturas (`futuro`), e a série dos últimos 6 meses (`serie`). Depois, quatro
`.map` extraem **séries paralelas** de `serie` — só entradas, só saídas, saldo
do mês, saldo acumulado — cada uma destinada a virar o traço de um
`sparkline()` diferente mais abaixo. Por fim, o cabeçalho da tela (`<h2>` +
subtítulo) é anexado a `v`.

**Sintaxe — `.map((p) => p.entradas)`, extrair uma coluna de uma lista de
objetos.** `serie` é uma lista de objetos `{mes, entradas, saidas, saldoMes}`
(ver `serieMensal` em `calculos.explicado.md`); `.map` percorre e devolve só o
campo `entradas` de cada um, produzindo uma lista plana de números — o
formato que `sparkline()` espera para desenhar uma linha.

**Sintaxe — `antes`, uma função guardada numa constante local.** `const antes
= (arr) => (arr.length > 1 ? arr[arr.length - 2] : null)` declara uma
pequena função (não a executa ainda) que devolve o **penúltimo** item de um
array (`length - 2`), ou `null` se o array não tiver pelo menos dois itens.
`arr[arr.length - 2]` é a forma padrão de indexar "de trás para frente" em
JavaScript (que não tem índice negativo nativo em arrays, ao contrário de
Python). Repare que `antes` é declarada **uma vez** e reusada quatro vezes
logo abaixo (Bloco 2), sobre `sConta`, `sEnt`, `sSai` e `sSal` — evita repetir
a mesma expressão `arr[arr.length - 2]` com guarda de tamanho quatro vezes.

**Conceito por trás — "este mês vs. o mês anterior" é o fio condutor da
tela inteira.** Quase todo elemento visual desta tela (o hero, cada KPI)
mostra um número **e** uma comparação com o mês passado. `antes(arr)` é o
alicerce dessa comparação: pega o ponto anterior ao mais recente de qualquer
série de 6 meses. As funções que de fato desenham essa comparação
(`heroDelta`, `footDelta`) vêm nos Blocos 5 e 6.

---

## Bloco 2 — o hero e os KPIs

```js
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
```

**O que faz.** Anexa o hero (bloco visual grande do topo) e, logo abaixo,
uma grade de quatro cartões de KPI: Entradas, Saídas, Saldo do mês e
Comprometido futuro. Os três primeiros levam sparkline e chip de variação
(`footDelta`); o quarto (Comprometido futuro) leva só um rodapé de texto fixo
("faturas a vencer"), porque não faz sentido comparar "quanto está
comprometido" com o mês anterior da mesma forma — é uma métrica de estoque,
não de fluxo.

**Como faz.** Cada `kpi(...)` (Bloco 7) recebe: um rótulo, o valor já
formatado em reais (`fmt(...)`), uma classe CSS para cor (`'pos'`/`'neg'`/`'warn'`,
decidida por sinal quando aplicável), o rodapé de comparação (`footDelta`) e
o sparkline. Note o `r.saldoMes >= 0 ? 'pos' : 'neg'` repetido tanto na classe
quanto nas cores do sparkline: a mesma condição decide **três** aspectos
visuais (classe do valor, cor do traço, cor do preenchimento) — o saldo do mês
positivo é visualmente "verde" em todo lugar ao mesmo tempo, sem duplicar a
lógica de decisão, só reaplicando a mesma expressão.

**Armadilha real — a ordem dos KPIs é um contrato com os testes.** O
comentário do código avisa: *"ordem fixa: [0]=Entradas, [1]=Saídas — o e2e
depende disso."* Isso significa que `npm run test:e2e` (ver `CLAUDE.md`)
provavelmente localiza esses cards **por posição** no DOM, não por texto ou
id. Reordenar os `kpi(...)` abaixo por qualquer motivo estético quebraria
testes num arquivo completamente diferente — um acoplamento implícito que
não aparece lendo só este arquivo isoladamente. É o tipo de armadilha que só
um comentário no código consegue prevenir, porque nada na sintaxe força essa
ordem.

---

## Bloco 3 — os dois gráficos

```js
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
```

**O que faz.** Monta uma grade (`subgrid`) com dois cards: o gráfico de
evolução (entradas × saídas dos últimos 6 meses, via `graficoEvolucao`) e o
gráfico de categorias (para onde foi o dinheiro **deste** mês, via
`graficoCategorias`, limitado às 6 maiores categorias com `{ max: 6 }`).

**Sintaxe — `.some((p) => p.entradas || p.saidas)`.** `Array.some` devolve
`true` assim que **um** item satisfaz o predicado (para de percorrer ali —
diferente de `.every`, que exige todos). Aqui, verifica se existe **qualquer**
mês na série com entrada ou saída diferente de zero — se todos os 6 meses
estiverem zerados, `temMovimento` é `false`.

**Conceito por trás — estado vazio explícito, não gráfico vazio.** Em vez de
sempre chamar `graficoEvolucao(serie)` (o que desenharia um gráfico com uma
linha reta em zero, visualmente enganoso — "estou sempre em zero" é diferente
de "não tenho dado nenhum"), o código verifica `temMovimento` e mostra uma
mensagem textual (`'Sem movimento ainda.'`) quando não há nada para plotar.
O mesmo padrão se repete logo abaixo com `gc.length` para o gráfico de
categorias. É a mesma preocupação de honestidade visual que
`calculos.explicado.md` já discutiu a propósito de `serieMensal` ("não deixar
o gráfico mentir sobre o tempo") — aqui aplicada a **ausência total de
dado**, não a buracos no meio de uma série.

---

## Bloco 4 — faturas do mês e visão anual

```js
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
```

**O que faz.** Uma segunda grade com dois cards: a lista de faturas que
fecham neste mês (`C.faturasDoMes`, filtrando fora as que têm `total === 0` —
cartões sem nenhuma compra no mês não aparecem) e o card de visão anual
(`cardVisaoAnual`, Bloco 6).

**Como faz.** Cada fatura vira uma `linhaFatura(f, false)` — o segundo
argumento `false` é o parâmetro `comBotao` da função (Bloco 8): aqui, no
Início, a fatura é só **mostrada**, sem o formulário de "registrar
pagamento" embaixo. A mesma função, chamada com `true` (o padrão), reaparece
na tela Cartões com o botão ativo — é a reutilização que o comentário do
código já anuncia (ver Bloco 8).

**Sintaxe — `.filter((f) => f.total > 0)` antes de checar `.length`.** O
filtro remove faturas de cartões que existem no cadastro mas não tiveram
nenhuma compra no mês (`total` ficaria zero); só depois disso o código decide
se mostra a lista ou a mensagem de vazio. Sem o filtro, um cartão parado
apareceria como uma "fatura de R$ 0,00" na tela — tecnicamente correto, mas
inútil e visualmente ruidoso.

---

## Bloco 5 — `heroInicio`

```js
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
```

**O que faz.** Monta o bloco visual mais importante da tela: um lado
principal (`main`) com o valor "Em conta" em destaque, seu delta vs. mês
anterior e um sparkline de fundo, mais um rodapé condicional sobre o
comprometido futuro; e um lado (`side`) com o medidor circular de saúde
(`gaugeSaude`) e a lista dos três pilares que compõem o score.

**Como faz.** `main` é um `<div class="hero-main">` com até quatro filhos: o
"eyebrow" (rótulo pequeno acima do número), a figura grande (valor + delta),
o sparkline de fundo, e — só se `futuro > 0` — uma linha de aviso sobre
faturas futuras já comprometidas. `side` é um `<div class="hero-side">` com o
gauge (o círculo colorido) e a lista de pilares, cada um desenhado por
`pilar(...)` (Bloco 6). Os dois lados viram filhos de um `<div class="hero">`
externo — provavelmente um layout flex/grid de duas colunas (ver
`app.css.explicado.md`).

**Sintaxe — `futuro > 0 ? el(...) : null`.** O ternário decide se o rodapé de
aviso existe ou não; `null` é descartado silenciosamente pelo `el(...)` do
`main` (lembra o Bloco 4 da Parte 1: `if (c == null) continue`). É a mesma
técnica de "elemento condicional inline" vista em toda a Parte 1.

**Conceito por trás — `s.score`, `s.faixa`, `s.pilares.*` — o formato que
`scoreSaude` devolve.** Esta função não calcula nada sobre saúde financeira —
ela só **desenha** o que `C.scoreSaude(estado, mesAtual)` (chamado no Bloco 1)
já decidiu: um número de 0 a 100 (`score`), um rótulo textual (`faixa`, algo
como `"Saudável"`) e três frações 0–1 (`pilares.saldo`,
`pilares.essencialidade`, `pilares.comprometimentoFuturo` — ver
`score.explicado.md` para a fórmula ponderada por trás desses três números).
`heroInicio` é pura composição visual sobre um objeto já pronto.

---

## Bloco 6 — `heroDelta`, `pilar`, `footDelta`

```js
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
```

**`heroInicio`, `heroDelta`, `pilar`, `footDelta` — dois formatos de "delta
vs. mês anterior", não um só.** `heroDelta` (grande, no hero) e `footDelta`
(compacto, no rodapé dos KPI cards) resolvem o mesmo problema — "como estou
comparado ao mês passado?" — mas com saídas visuais diferentes o bastante (um
elemento de DOM vs. um par `[chip, rótulo]`) que **não** foram unificadas
numa função só. Vale reconhecer que isso é uma escolha razoável, não uma
duplicação esquecida: forçar uma função genérica para os dois casos exigiria
tantos parâmetros de customização visual que a "economia" de linhas se
perderia. Compare com `kpi` (Bloco 7) — essa sim é a mesma forma exata
reaproveitada 4+ vezes, e por isso vale a pena como função única.

**`heroDelta` — passo a passo.** A guarda inicial (`anterior == null ||
!Number.isFinite(anterior) || atual - anterior === 0`) cobre três motivos
para não mostrar delta nenhum: não existe mês anterior (`antes(arr)` da Parte
1 devolveu `null`), o valor anterior não é um número válido, ou a diferença é
zero (nada mudou, nada para comparar). `up = d > 0` decide a direção. `pct`
só é calculado se `anterior !== 0` (dividir por zero produziria `Infinity`) —
o operador ternário aninhado dentro do template literal monta a string de
porcentagem só quando faz sentido, senão fica vazia (`''`).

**`pilar` — a barra de progresso de um pilar do score.** `Math.max(0,
Math.min(100, Math.round(Number(val) || 0)))` é uma cadeia de **saturação**
(clamping): `Number(val) || 0` garante um número (0 se `val` vier `undefined`
ou `NaN`), `Math.round` arredonda, `Math.min(100, ...)` teta o topo em 100,
`Math.max(0, ...)` teta o piso em 0. O resultado nunca escapa de `[0, 100]`,
mesmo que o pilar (por algum bug upstream) viesse com um valor fora da faixa
esperada — uma barra de progresso que "vaza" para 130% ou -20% seria
visualmente quebrada.

**`footDelta` — mesma ideia de `heroDelta`, com um ingrediente a mais:
`maiorMelhor`.** A diferença central é o parâmetro `maiorMelhor`: para
Entradas e Saldo, "maior é melhor" (`maiorMelhor = true`); para Saídas,
"menor é melhor" (`maiorMelhor = false`, passado no Bloco 2). `favor =
maiorMelhor ? d >= 0 : d <= 0` decide se a variação **favorece** o usuário —
gastar 20% a mais é ruim (`bad`), mesmo que a seta aponte "para cima"
(`▲`, porque o número subiu). Separar "a seta indica direção numérica" de
"a cor indica se é bom ou ruim" é o que permite Saídas subirem (seta ▲) e
ainda assim pintarem de vermelho (`bad`).

**Sintaxe — `.toFixed(1).replace('.', ',')`.** `toFixed(1)` arredonda para
uma casa decimal e devolve **string** com ponto (`"12.3"`, convenção
americana); `.replace('.', ',')` troca o separador decimal para a vírgula
brasileira (`"12,3"`). Esse par aparece repetido nas duas funções — um
detalhe de localização (i18n) tratado manualmente, sem `Intl.NumberFormat`.

---

## Bloco 7 — `cardVisaoAnual`

```js
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
```

**O que faz.** Monta o card "Visão anual" — três KPIs (entradas, saídas,
reserva do ano corrente) e, **só se houver mais de um ano com movimento**,
uma tabela comparando todos os anos lado a lado.

**Sintaxe — `mesAtual.slice(0, 4)`, extrair o ano do mês.** O mesmo idioma de
fatiar por posição fixa visto em `calculos.explicado.md` (`m.slice(0, 4)`
dentro de `anosComMovimento`): `"2026-07".slice(0, 4)` devolve `"2026"`.

**Sintaxe — `...anos.map((a) => {...})`, spread de um array de nós dentro de
outro array literal.** `anos.map(...)` devolve um array de `<tr>` (um por
ano); o `...` na frente **espalha** esses elementos como filhos individuais
do array de children de `el('table', ...)`, em vez de aninhar um array
dentro de outro. Sem o spread, `el` receberia `[linhaCabecalho, [tr1, tr2,
...]]` — um array dentro de outro — mas o helper `el` (Parte 1, Bloco 4)
já lida com isso via `[].concat(children)`, então tecnicamente funcionaria
sem o spread também; usá-lo aqui deixa a intenção mais clara: "uma linha de
cabeçalho, seguida de N linhas de dados, todas no mesmo nível".

**Conceito por trás — condicionar a comparação de anos à existência de mais
de um ano.** Se o usuário só tem dados de 2026, uma tabela "comparando anos"
com uma única linha seria redundante com os três KPIs already mostrados
acima — a condição `anos.length > 1` evita mostrar uma tabela que não agrega
informação nenhuma.

**Armadilha — `rr.reservaAno >= 0 ? 'pos' : 'neg'` repetido três vezes na
função (aqui e no KPI acima).** A mesma expressão de decisão de cor por sinal
aparece de novo — é o mesmo padrão do Bloco 2 (saldo do mês). Não há
duplicação de **regra de negócio** aqui (o sinal já vem calculado do
núcleo); é só a mesma decisão visual "positivo é verde, negativo é vermelho"
reaplicada em pontos diferentes da tela.

---

## Bloco 8 — `kpi`, a fábrica de card

```js
function kpi(label, value, cls = '', rodape = null, spark = null) {
  return el('div', { class: 'card kpi' }, [
    el('div', { class: 'label' }, label),
    el('div', { class: `value ${cls}` }, value),
    spark ? el('div', { class: 'tspark' }, spark) : null,
    rodape ? el('div', { class: 'kpi-foot' }, rodape) : null,
  ]);
}
```

**O que faz.** Monta um card de KPI: rótulo, valor grande (com classe de cor
opcional), sparkline opcional, rodapé opcional. Os quatro usos do Bloco 2, o
uso duplo no Bloco 4 (Início) e os três usos do Bloco 7 (Visão anual) todos
passam por aqui — a mesma forma visual, com parâmetros diferentes.

**Sintaxe — quatro parâmetros com valor padrão.** `cls = ''`, `rodape =
null`, `spark = null` tornam os três últimos argumentos opcionais: `kpi('Entradas
no ano', fmt(ra.entradas), 'pos')` (Bloco 7) passa só três argumentos e os
dois últimos assumem `null`, o que faz `spark ? ... : null` e `rodape ? ...
: null` devolverem `null` — nenhum sparkline, nenhum rodapé — sem precisar de
uma versão separada da função para o caso "sem essas partes".

**Conceito por trás — o mesmo instinto de fábrica local que gerou `meta(...)`
em `metas.js` (núcleo, fora do escopo desta mirror), aqui uma camada acima,
montando DOM em vez de um objeto de dados.** É o padrão "não repita a forma":
em vez de escrever a estrutura `<div class="card kpi">...</div>` sete vezes
espalhadas pela tela (quatro no grid principal, três na visão anual), uma
função a monta uma vez e é chamada sete vezes com dados diferentes.

---

## Bloco 9 — `linhaFatura`

```js
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
```

**O que faz até aqui.** Monta o "topo" de uma linha de fatura: nome do cartão,
data de vencimento, uma tag de status (`"Quitada"` ou `"X% pago"`), a barra
de progresso visual, e uma linha de texto com os números (pago de total, e
opcionalmente "faltam X" e/ou "X adiantados").

**Sintaxe — template literal com três trechos condicionais encadeados.** A
última linha do trecho é uma única string montada por interpolação
(`` `${...}${...}${...}` ``): o primeiro `${...}` sempre aparece (`"R$ 500,00
de R$ 1.000,00"`), o segundo só se `f.restante > 0` (senão vira string
vazia), o terceiro só se `f.adiantado > 0`. É a mesma técnica de "ternário
dentro de template literal, string vazia como caso nulo" vista em `heroDelta`
(Bloco 6) — aqui encadeada três vezes na mesma linha para montar uma frase
com partes opcionais.

**Conceito por trás — `f.progresso`, `f.pago`, `f.restante`, `f.adiantado` —
o vocabulário de uma fatura já calculado pelo núcleo.** Nenhum desses campos
é calculado aqui; `linhaFatura` só formata e desenha o que
`C.faturasDoMes`/`C.proximasFaturas` (ver `faturasPagas.explicado.md`) já
devolveram prontos. `adiantado > 0` merece nota: significa que o usuário já
pagou mais do que o esperado até este ponto do mês — o vocabulário "adiantar"
volta com força na próxima função (`linhaAdiantar`, Bloco 10).

```js
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
```

**O que faz.** Só se `comBotao` for verdadeiro **e** a fatura não estiver
quitada **e** tiver algum valor total, anexa um mini-formulário (campo de
valor + botão "Registrar pagamento") à linha já montada.

**Como faz.** `placeholder: fmt(f.restante).replace('R$', '').trim()` — usa
o valor restante formatado como **dica** no campo, mas sem o prefixo `"R$"`
(removido com `.replace`) nem espaços nas pontas (`.trim()`), porque um
placeholder de `<input type="number">` deveria parecer um número, não um
texto com símbolo de moeda. O `onclick` do botão lê `val.value` (por
**closure** — a função de callback "lembra" a variável `val` do escopo em que
foi criada, mesmo sendo chamada bem depois, quando o usuário clica), valida
que é maior que zero, chama `C.registrarPagamentoFatura` com os dados da
fatura (`f.cartaoId`, `f.mesFatura`) e o valor digitado, e por fim
`persistir()` + `toast`.

**Conceito por trás — o idioma mais repetido do arquivo inteiro.** *"Crie os
inputs, crie um botão cujo `onclick` lê `.value` desses mesmos inputs (por
closure) e dispara uma mutação do núcleo, seguida de `persistir()`."* Esse
exato receituário — variação de campo(s) + botão fechando sobre eles —
reaparece em `linhaAdiantar` (Bloco 10), em `renderLancar` (Parte 3), em
`renderImportar`/`renderRevisar` (Parte 4), e em toda tela ainda não coberta
por esta mirror (Cartões, Planejar, Reservas, Metas). Vale nomeá-lo aqui,
uma vez: as próximas partes não vão reexplicá-lo a cada ocorrência, só
apontar o que muda.

**`comBotao` — o mesmo corpo de função servindo dois contextos.** No Início
(Bloco 4 deste arquivo), `linhaFatura(f, false)` é chamada sem o formulário —
a fatura é só informativa ali. Na tela Cartões (fora desta mirror),
`linhaFatura(f)` (parâmetro padrão `true`) mostra o formulário completo. Um
parâmetro booleano decide qual pedaço da árvore de DOM existe — mais barato
do que manter duas funções quase idênticas.

---

## Bloco 10 — `linhaAdiantar`

```js
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
```

**O que faz até aqui.** Monta o topo de uma linha de fatura **futura** (ainda
não vencida): o mês da fatura em vez do nome do cartão em destaque (repare a
inversão comparada a `linhaFatura`: aqui `C.rotuloMes(f.mesFatura)` é o
`<strong>`, e o cartão vira texto secundário), o valor restante em destaque
(tag amarela, `warn`), e uma nota opcional "valor do banco" se `f.informada`
for verdadeira.

**Conceito por trás — `f.informada`, a diferença entre estimar e saber.** Uma
fatura futura pode ter seu valor **estimado** (soma das parcelas já
conhecidas) ou **informada** pelo próprio extrato do banco (quando o usuário
já importou a fatura real). Marcar visualmente qual é qual evita o usuário
confundir uma projeção com um número confirmado — outro caso de "não deixar o
dado mentir sobre sua própria certeza", parente da preocupação já vista com
`serieMensal` em `calculos.explicado.md`.

```js
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
```

**O que faz.** Monta os dois campos do formulário (quanto, quando) e o
botão "⏩ Adiantar", que registra o pagamento com a data informada (ou hoje,
se vazia) e mostra um toast confirmando o valor e o mês da fatura adiantada.

**Como faz — a diferença central com `linhaFatura`.** Aqui existem **dois**
campos (`val` e `data`), não um: adiantar uma fatura futura exige dizer
**quando** o dinheiro efetivamente saiu da conta, porque essa data é o que
decide em qual mês a saída conta (lembre a convenção temporal de
`calculos.explicado.md`: "saída direta conta no mês em que aconteceu"). O
`onclick` usa `Number(val.value) || f.restante` — se o usuário deixar o campo
vazio, assume o valor **restante inteiro** como padrão (adiantar a fatura
inteira é o caso mais comum), em vez de exigir digitar o número de novo.

**Conceito por trás — "adiantar" é a mesma operação de núcleo que "registrar
pagamento", só que fora de ordem no tempo.** Tanto `linhaFatura` quanto
`linhaAdiantar` chamam `C.registrarPagamentoFatura` — não existe uma função
de núcleo separada para "adiantamento". A diferença é inteiramente de
**contexto de UI**: uma tela mostra faturas já vencidas ou vencendo este mês
(pagamento normal), a outra mostra faturas que só vencem depois (pagamento
adiantado). O núcleo não precisa saber dessa distinção — ele só recebe
`{cartaoId, mesFatura, valor, data}` e decide, pela relação entre `data` e
`mesFatura`, se aquilo é adiantamento ou não (ver `faturasPagas.explicado.md`).
É outra fronteira "núcleo compacto, UI dá nome humano ao que o usuário está
fazendo" — o mesmo princípio que reaparece com o par Guardar/Resgatar de
`registrarReserva` (Parte 6, fora desta mirror).

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Extrair séries paralelas com `.map`** | Bloco 1 | uma lista de objetos vira várias listas planas, uma por campo |
| **Função guardada numa constante (`antes`)** | Bloco 1 | evita repetir `arr[arr.length-2]` com guarda quatro vezes |
| **Contrato implícito com o e2e (ordem dos KPIs)** | Bloco 2 | reordenar por estética pode quebrar teste em outro arquivo |
| **Estado vazio explícito ≠ gráfico vazio** | Bloco 3 | mostrar mensagem de "sem dado", não um gráfico zerado enganoso |
| **Reuso de função com parâmetro de contexto (`comBotao`)** | Blocos 4, 9 | mesma função, formulário aparece ou não conforme a tela |
| **Duas formas de "delta vs. mês anterior", por design** | Bloco 6 | `heroDelta`/`footDelta` não foram unificadas — o custo de generalizar superaria o ganho |
| **Saturação / clamping (`Math.max(Math.min(...))`)** | Bloco 6 | garante que um valor fique dentro de uma faixa segura para a UI |
| **Direção numérica ≠ julgamento de valor** | Bloco 6 | `favor` (bom/ruim) e `seta` (subiu/desceu) são decisões independentes |
| **Spread de array de nós (`...anos.map(...)`)** | Bloco 7 | achata uma lista de elementos dentro de outro array de filhos |
| **Fábrica de card (`kpi`)** | Bloco 8 | mesma forma visual, sete usos, parâmetros opcionais cobrem as variações |
| **O idioma mais repetido do arquivo: inputs + botão + closure + `persistir()`** | Blocos 9, 10 | nomeado uma vez aqui; as próximas partes só apontam o que muda |
| **Núcleo compacto, UI nomeia a intenção humana** | Bloco 10 | "adiantar" e "pagar" são o mesmo `registrarPagamentoFatura`, distintos só pelo contexto de tela |

---

**Navegação:** ← anterior: [Parte 1 — estado, helpers, roteador](./app.parte1.explicado.md) · próxima: [Parte 3 — Lançar](./app.parte3.explicado.md) →
