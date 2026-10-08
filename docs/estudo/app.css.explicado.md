# `src/styles/app.css` — explicado

> **O que é este arquivo:** o tema visual inteiro do app (claro/escuro) e o
> CSS de todos os componentes — topbar, cards, hero, tabelas, formulários,
> gráficos, badges. É CSS **puro, escrito à mão** — sem Tailwind, sem
> pré-processador (Sass/Less), sem build step. Faz sentido dado o resto do
> projeto: um app offline/portátil não quer depender de uma etapa de
> compilação de CSS pra rodar do pendrive.
>
> **Nomenclatura:** este doc chama-se `app.css.explicado.md` (com a extensão)
> pra não colidir com o nome que [`app.js`](./app.explicado.md) vai usar
> (`app.explicado.md`) — são dois arquivos "app" diferentes.
>
> **Papel na arquitetura:** puramente de apresentação. Nenhuma classe daqui
> decide *o quê* aparece (isso é `app.js`) — só *como* aparece. A ponte entre
> os dois é o **nome da classe**: `app.js` escreve `class="card kpi"` num
> elemento; este arquivo diz o que "card kpi" parece visualmente.

---

## Bloco 0 — tokens de design: cor como dado, não como valor espalhado

```css
/* FinanWise — tema claro/escuro, layout de app de finanças (refresh 2026-07: estilo dashboard/stats). */
:root {
  --bg: #eef1f4;
  --surface: #ffffff;
  --surface-2: #f3f6f8;
  --border: #e4e9ed;
  --text: #14202b;
  --text-2: #3b4a58;
  --muted: #66768a;
  --brand: #0f9d95;
  --brand-2: #12b3a9;      /* teal mais claro: foco/hover */
  --brand-ink: #0b7a74;
  --brand-soft: #d9efed;
  --pos: #1c9f52; --pos-soft: #e4f3ea;
  --neg: #bf2f3d; --neg-soft: #f8e4e6;
  --warn: #b47610; --warn-soft: #f5ecd7;
  /* marcas de gráfico — validadas no scripts/validate_palette.js (não trocar sem rerodar) */
  --c-in: #1c9f52; --c-out: #bf2f3d; --c-cat: #0f9d95; --grid: #e9edf1;
  /* hero: superfície teal escura, comprometida (fica escura nos dois temas) */
  --hero-1: #0a5f5b; --hero-2: #0f8f87; --hero-ink: #eafcf9; --hero-line: #7ff0df;
  --shadow: 0 1px 2px rgba(16, 32, 48, .05), 0 10px 30px rgba(16, 32, 48, .06);
  --shadow-sm: 0 1px 2px rgba(16, 32, 48, .06);
  --radius: 14px; --radius-sm: 10px;
  --font: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif;
  --font-num: "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, sans-serif;
}
```

**O comentário de topo do arquivo** já resume o essencial: é o CSS de um app de finanças com
tema claro/escuro, e a data (`refresh 2026-07`) marca que este é o layout **depois** do refresh
visual (estilo dashboard/stats) mencionado na memória do projeto — útil pra saber que este arquivo
já reflete a decisão final, não um rascunho.

**Os comentários inline dentro do `:root`** valem leitura própria: `--brand-2` é anotado como
"teal mais claro: foco/hover" (o tom usado em estados de interação, não na marca "de repouso");
o par `--c-in/--c-out/--c-cat/--grid` carrega o aviso "validadas no `scripts/validate_palette.js`
— não trocar sem rerodar" (a mesma disciplina de paleta que `charts.js` documenta do lado do
código); e o grupo `--hero-*` é anotado como "superfície teal escura, comprometida (fica escura
nos dois temas)" — ou seja, ao contrário de quase todo o resto do arquivo, o hero **não** clareia
no tema claro. Isso já avisa, antes mesmo do Bloco 1, que o hero é uma exceção deliberada à regra
geral de retemização.

**O que faz.** Declara **todo** o vocabulário visual do app como *custom
properties* (variáveis CSS) num único lugar: cores por papel semântico
(`--text`, não "cinza-escuro"), espaçamento (`--radius`), sombra, fontes.

**Conceito por trás — tokens de design.** Repare que os nomes descrevem
**papel**, não **aparência**: `--pos`/`--neg` (positivo/negativo), não
`--verde`/`--vermelho`; `--surface`/`--surface-2`, não `--branco`/`--cinza`.
Isso importa porque o **mesmo nome** é reaproveitado no Bloco 1 com valores
completamente diferentes (tema escuro) — se o token se chamasse `--verde`, ele
ficaria com nome errado ao virar uma cor diferente no escuro. Nomear pelo papel
é o que torna a troca de tema **transparente** pro resto do arquivo: todo
componente lê `var(--pos)`, nunca a cor crua, então só os ~20 tokens mudam e
o app inteiro re-temiza sozinho.

**A dupla de fontes (`--font` / `--font-num`).** Duas famílias tipográficas,
não uma: `--font-num` (variante *Display*) é usada só onde números aparecem
alinhados (valores em reais, KPIs) — desenhada para dígitos monoespaçados/
tabulares; `--font` (variante *Text*) é pro resto do texto corrido. A cadeia de
fallback (`"Segoe UI Variable Text" → "Segoe UI" → system-ui → -apple-system →
Roboto → "Helvetica Neue" → sans-serif`) vai do mais específico (só existe no
Windows 11 mais recente) ao mais genérico — garantindo que o app renderize bem
tanto no Windows quanto no Linux (`system-ui` cobre a fonte nativa de cada
SO), coerente com o requisito de portabilidade do `CLAUDE.md`.

**Os tokens de gráfico (`--c-in`/`--c-out`/`--c-cat`/`--grid`).** Compartilhados
com [`charts.js`](./charts.explicado.md) — os SVGs de lá leem essas mesmas
variáveis via `var()`. O comentário no topo do arquivo (e em `charts.js`) fala
em validação de contraste/daltonismo feita durante o refresh visual do app;
não existe hoje um script `validate_palette.js` **dentro deste repositório** —
foi uma checagem pontual feita com uma ferramenta externa no momento do
refresh, não uma verificação automatizada de CI. Vale saber a diferença: o
comentário documenta uma decisão já tomada, não aponta pra um comando que você
pode rodar aqui.

---

## Bloco 1 — tema escuro: redefinir os mesmos tokens, não duplicar regras

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e131a;
    --surface: #161d25;
    --surface-2: #1c2530;
    --border: #28323d;
    --text: #e9eef3;
    --text-2: #c2ccd7;
    --muted: #8b9aab;
    --brand: #2ec8bd;
    --brand-2: #7fe0d8;
    --brand-ink: #7fe0d8;
    --brand-soft: #123a38;
    --pos: #3ec27a; --pos-soft: #13291d;
    --neg: #e56571; --neg-soft: #301b1e;
    --warn: #cf9a3c; --warn-soft: #2c2515;
    --c-in: #24a05f; --c-out: #de4a56; --c-cat: #1a9f97; --grid: #232d38;
    --hero-1: #083f3c; --hero-2: #0c6b66; --hero-ink: #eafcf9; --hero-line: #7ff0df;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 12px 32px rgba(0, 0, 0, .38);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4);
  }
}
```

**Comparando os dois `:root` lado a lado.** Repare que o dark redefine **exatamente os mesmos 20
nomes** do Bloco 0, na mesma ordem — nenhum token novo, nenhum sumiço. `--radius`/`--radius-sm` e
as duas famílias de fonte **não aparecem aqui de propósito**: raio de borda e tipografia não têm
"versão escura", só cor tem. E confirmando a exceção anotada no Bloco 0: `--hero-1`/`--hero-2`/
`--hero-ink`/`--hero-line` mudam de valor entre os dois blocos, mas continuam **igualmente
escuros** nos dois temas (`#0a5f5b`/`#0f8f87` no claro vs. `#083f3c`/`#0c6b66` no escuro — ambos
tons profundos de teal) — é isso que faz o hero parecer "a mesma superfície" independente do
tema do sistema, enquanto tudo ao redor dele clareia ou escurece.

**O que faz.** Detecta a preferência de tema do sistema operacional
(`prefers-color-scheme: dark`) e **redefine os mesmos nomes de variável**
dentro do mesmo seletor `:root`.

**Conceito por trás — por que isso funciona sem `!important` nem duplicar
cada regra de componente.** Nenhuma regra de `.card`, `.hero`, `.tabs button`
etc. está **dentro** deste bloco `@media` — elas continuam escritas **uma
única vez**, lá embaixo no arquivo, sempre como `background: var(--surface)`.
O que muda entre claro/escuro é só a **definição do token**, nunca o
componente. Esse é o motivo de existir a camada de tokens do Bloco 0: ela cria
uma indireção (nome → valor) que permite trocar **o valor** sem tocar em quem
**usa** o nome. Compare com a alternativa ingênua — duplicar cada regra de
componente dentro de `@media (prefers-color-scheme: dark) { .card {...} }` —
que dobraria o arquivo inteiro de tamanho e criaria duas fontes de verdade pra
manter sincronizadas.

**Trade-off — só a preferência do SO, sem botão manual no app.** Este bloco
reage **apenas** à configuração do sistema operacional; não há uma classe tipo
`[data-theme="dark"]` alternável por um botão dentro do app. Se um dia o
FinanWise quiser um seletor de tema manual (independente do SO), a estrutura
de tokens já está pronta pra isso — bastaria adicionar um segundo seletor
(`:root[data-theme="dark"] { ... }` com os mesmos nomes) que o app alternasse
via JS, sem mexer em nenhum componente.

---

## Bloco 2 — reset mínimo e acessibilidade de base

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: var(--font);
  background: var(--bg); color: var(--text); font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.num, [class*="num"] { font-variant-numeric: tabular-nums; }
:where(button, a):focus-visible { outline: 2px solid var(--brand-2); outline-offset: 2px; }
```

**O que faz.** O reset mínimo necessário (não um Normalize.css inteiro) mais
duas regras de acessibilidade/legibilidade que valem a pena destacar.

**`[class*="num"]` + `font-variant-numeric: tabular-nums`.** Um seletor de
**atributo com correspondência parcial** (`*=`) — pega qualquer elemento cuja
`class` contenha a substring `"num"` em qualquer lugar (`.num`, `.kpi .value`
via a classe auxiliar, `.num-input`, etc.), sem precisar listar cada classe
explicitamente. `tabular-nums` faz todo dígito ocupar a **mesma largura** —
essencial em qualquer lugar onde números ficam empilhados em coluna (tabelas,
KPIs): sem isso, um "1" (fino) e um "8" (largo) empurrariam o alinhamento a
cada re-render.

**`:where(button, a):focus-visible`.** `:focus-visible` (não `:focus` puro) só
mostra o contorno quando o navegador **acredita** que a navegação foi por
teclado (Tab), não em todo clique de mouse — evita o "anel azul" aparecer em
cliques comuns, mas preserva a pista visual pra quem navega sem mouse.
`:where(...)` é o detalhe mais sutil aqui: **tem especificidade zero**. Um
`:where(button, a)` casa exatamente como `button, a` casaria, mas não soma
peso de especificidade — então uma regra futura tão simples quanto
`.tabs button { outline: none }` ainda consegue sobrepor este `focus-visible`
sem precisar de `!important` nem seletores mais específicos só pra "ganhar" da
regra de acessibilidade. Vale reconhecer `:where()` como a ferramenta certa
sempre que você quer aplicar um estilo "de baixa prioridade" de propósito.

---

## Bloco 3 — a topbar: barra fixa e abas com rolagem sem barra visível

```css
/* ---- Topbar ---- */
.topbar {
  display: flex; align-items: center; gap: 18px;
  padding: 0 18px; height: 56px;
  background: color-mix(in oklab, var(--surface) 90%, var(--bg));
  border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10;
}
.brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 16px; letter-spacing: -.01em; }
.brand .logo {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px;
  background: linear-gradient(140deg, var(--hero-2), var(--hero-1)); color: #eafffb; font-size: 15px;
  box-shadow: 0 2px 8px color-mix(in oklab, var(--brand) 40%, transparent);
}
.tabs { display: flex; gap: 2px; flex: 1; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button {
  border: none; background: transparent; color: var(--muted); white-space: nowrap;
  padding: 8px 13px; border-radius: 9px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 500;
}
.tabs button:hover { background: var(--surface-2); color: var(--text); }
.tabs button.active { background: var(--brand); color: #fff; box-shadow: 0 2px 8px color-mix(in oklab, var(--brand) 42%, transparent); }
.topright { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.mes-picker {
  display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12.5px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 5px 11px;
}
.saldo-pill {
  background: var(--surface-2); padding: 7px 14px; border-radius: 999px;
  font-weight: 700; font-variant-numeric: tabular-nums; font-family: var(--font-num);
  border: 1px solid var(--border);
}
```

**`.brand .logo` — o quadrado do logo é o mesmo gradiente do hero, em miniatura.**
`linear-gradient(140deg, var(--hero-2), var(--hero-1))` reaproveita os tokens `--hero-*` — o
logo "combina" visualmente com o hero da tela Início porque literalmente usa as mesmas cores,
sem duplicar valores.

**`.tabs button` (estado base) → `:hover` → `.active` — três camadas de estilo por especificidade
crescente.** O estado base é "invisível" (`background: transparent`, texto `--muted`); o `:hover`
sinaliza interatividade com um fundo sutil; `.active` (aplicada via JS conforme a aba selecionada)
ganha a cor de marca sólida com sombra — a mesma progressão "neutro → hover → selecionado" que
reaparece nos botões de tipo do Bloco de "Lançar" mais adiante.

**`color-mix(in oklab, var(--surface) 90%, var(--bg))`.** A função nativa
`color-mix()` mistura duas cores **sem precisar calcular um terceiro hex à
mão** — aqui, 90% da cor de superfície com 10% do fundo, gerando um tom
intermediário sutil pra topbar (não idêntico à superfície dos cards, não
idêntico ao fundo da página). O espaço de mistura `oklab` é **perceptualmente
uniforme** — misturar 90/10 em `oklab` produz uma transição que *parece*
proporcional ao olho humano, diferente de misturar direto em `srgb` (onde
misturas em determinadas faixas de cor podem parecer desproporcionais). Vale
notar: este arquivo usa `color-mix(in oklab, ...)` pra tons de superfície
(Blocos 3/5) e `color-mix(in srgb, ...)` pra transparências de "pill"/tag
(Bloco 9) — a escolha do espaço muda conforme o efeito desejado (tom sutil vs.
transparência simples).

**Abas com rolagem, sem barra visível.** `overflow-x: auto` permite rolar
horizontalmente se as 9 abas não couberem na largura da janela.
`scrollbar-width: none` (Firefox) e `::-webkit-scrollbar { display: none }`
(Chromium — e por extensão, o próprio Electron) escondem a barra de rolagem
**sem desabilitar a rolagem em si** — o usuário ainda rola com roda do mouse
ou touch, só não vê o "trilho" cinza. Precisa das duas regras porque são duas
APIs CSS não-padronizadas de navegadores diferentes pro mesmo efeito.

**`position: sticky; top: 0`.** A topbar gruda no topo ao rolar a página —
mais barato que `position: fixed` porque não exige compensar manualmente o
espaço que ela ocuparia no fluxo normal do documento.

---

## Bloco 4 — layout geral e os cards de KPI

```css
/* ---- Layout ---- */
main { padding: 22px 24px 40px; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
h2 { margin: 0; font-size: 21px; letter-spacing: -.02em; text-wrap: balance; }
h3 { margin: 0 0 14px; font-size: 13.5px; font-weight: 700; letter-spacing: -.01em; color: var(--text); text-transform: none; }
.eyebrow, .kpi .label { font-size: 11px; letter-spacing: .11em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.dash-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.dash-head .sub { margin: 0; color: var(--muted); font-size: 13px; }
```

**`main` — o "molde" que centraliza e limita a largura de todas as telas.** `max-width: 1200px;
margin: 0 auto` centraliza o conteúdo em telas largas (sem isso, num monitor grande o texto se
esticaria de ponta a ponta, difícil de ler); `display: flex; flex-direction: column; gap: 18px`
empilha as seções (hero, KPIs, gráficos, tabelas) com um espaçamento vertical uniforme — nenhuma
seção precisa de `margin-bottom` manual, o `gap` do pai resolve para todas de uma vez.

**`text-wrap: balance` no `h2`.** Uma propriedade CSS recente: em vez de deixar o navegador
quebrar linha "greedily" (enche a primeira linha até estourar), tenta **equilibrar** o número de
caracteres entre as linhas de um título que quebra em duas — evita o efeito feio de "uma palavra
solta sozinha na segunda linha".

**`.eyebrow, .kpi .label` — o rótulo pequeno em maiúsculas.** `letter-spacing: .11em` (espaçamento
generoso entre letras) + `text-transform: uppercase` + tamanho pequeno (`11px`) é a assinatura
visual clássica de um "eyebrow" (rótulo de contexto acima de um título ou valor) — o mesmo
seletor serve tanto para `.eyebrow` solto quanto para `.kpi .label` (o rótulo de cada card de KPI,
ex. "SALDO EM CONTA"), reaproveitando a regra em vez de duas declarações idênticas.

**`.dash-head` — cabeçalho de seção que quebra graciosamente.** `justify-content: space-between`
empurra o título para a esquerda e algo à direita (um filtro, um botão); `flex-wrap: wrap` deixa
o segundo elemento cair para a linha de baixo em telas estreitas, em vez de espremer os dois.

```css
.grid-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow-sm);
}
```

**`repeat(auto-fit, minmax(190px, 1fr))`.** Um dos truques mais úteis do CSS
Grid: "encaixe quantas colunas de no mínimo 190px couberem, e estique-as pra
preencher o espaço sobrando." Numa janela larga, isso pode virar 5-6 colunas;
numa janela estreita, 2. **Sem nenhuma `@media` query** — o próprio algoritmo
de grid resolve o número de colunas a cada redimensionamento. Compare com
`.subgrid` (bloco de formulários, mais abaixo), que usa a abordagem oposta —
duas colunas fixas com uma media query explícita pra colapsar em uma — a
diferença mostra as duas técnicas de responsividade lado a lado no mesmo
arquivo: *auto-fit* quando o número de itens é variável (KPIs), media query
explícita quando o layout tem uma forma fixa conhecida (formulário de duas
colunas).

```css
.card.kpi { padding: 15px 16px; display: flex; flex-direction: column; gap: 9px; min-width: 0; overflow: hidden; }
.kpi .value { font-family: var(--font-num); font-size: 24px; font-weight: 800; letter-spacing: -.02em; line-height: 1; font-variant-numeric: tabular-nums; }
.value.pos { color: var(--pos); }
.value.neg { color: var(--neg); }
.value.warn { color: var(--warn); }
.kpi-foot { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--muted); margin-top: auto; }
.tspark { height: 30px; width: 100%; }
.kdelta { display: inline-flex; align-items: center; gap: 3px; font-weight: 700; font-family: var(--font-num); font-variant-numeric: tabular-nums; }
.kdelta.good { color: var(--pos); } .kdelta.bad { color: var(--neg); } .kdelta.mut { color: var(--muted); }
```

**`.card.kpi` — composição de classes, de novo.** `.card` dá a casca (fundo, borda, sombra);
`.kpi` acrescenta o layout interno específico (coluna, `gap`, e crucialmente `min-width: 0` +
`overflow: hidden`). Sem `min-width: 0`, um item flex/grid tende a **não encolher** abaixo do
tamanho do seu conteúdo — um valor numérico grande ou um sparkline poderiam estourar a largura do
card num grid apertado; zerar o `min-width` permite que o card encolha normalmente junto com a
coluna do grid.

**`.value.pos`/`.value.neg`/`.value.warn` — semântica de cor aplicada por modificador.** O valor
de um KPI (`.kpi .value`) recebe uma classe extra conforme o significado do número — positivo,
negativo, ou "atenção" — e só a cor muda, reaproveitando os três tokens de status já vistos no
Bloco 0. É o mesmo princípio de `.btn.ghost`/`.btn.danger` (Bloco 6), aplicado a texto em vez de
botão.

**`.kpi-foot` com `margin-top: auto`.** Dentro de um `.card.kpi` que é `flex-direction: column`,
`margin-top: auto` no rodapé o empurra para **o fim do card**, mesmo que o conteúdo acima tenha
alturas diferentes entre KPIs vizinhos — assim todos os rodapés (`.kdelta` + sparkline) ficam
alinhados na mesma linha de base horizontal no grid, independente de quanto texto cada card tem
acima.

**`.tspark`** só fixa a altura (30px) e a largura total do sparkline (`width: 100%`) dentro do
rodapé — o desenho em si (path, cor) vem de `charts.js` (`sparkline()`), este seletor só reserva
o espaço.

**`.kdelta.good`/`.bad`/`.mut`** — o indicador de variação ("+12% vs mês anterior") ganha cor por
modificador exatamente como `.value.*`: verde quando a mudança é boa, vermelho quando é ruim,
neutro (`--muted`) quando não há juízo de valor a fazer (ex. "sem dado no mês anterior").

---

## Bloco 5 — o hero: gradientes compostos e o anel de saúde

```css
/* ---- Hero (Em conta + saúde) ---- */
.hero {
  display: grid; grid-template-columns: 1.5fr 1fr; gap: 0;
  border-radius: var(--radius); overflow: hidden; color: var(--hero-ink);
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, var(--hero-2) 70%, transparent) 0%, transparent 60%),
    linear-gradient(135deg, var(--hero-1), var(--hero-2));
  box-shadow: var(--shadow);
}
.hero-main { padding: 22px 24px; display: flex; flex-direction: column; gap: 12px; }
.hero .eyebrow { color: color-mix(in oklab, var(--hero-line) 75%, #fff); }
.hero-figure { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.hero-figure .big { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 800; font-size: clamp(32px, 5vw, 50px); line-height: .95; letter-spacing: -.03em; }
.delta { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }
.delta.up { background: rgba(120, 240, 210, .16); color: #b7f4e9; }
.delta.dn { background: rgba(255, 180, 180, .14); color: #ffc9c9; }
.delta .ar { font-size: 11px; }
.hero-foot { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: color-mix(in oklab, var(--hero-line) 55%, #fff); padding-top: 12px; margin-top: auto; border-top: 1px solid rgba(180, 240, 232, .18); }
.hero-foot b { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; color: var(--hero-ink); }
.hero-side { padding: 22px; display: flex; align-items: center; gap: 18px; background: rgba(3, 32, 30, .22); border-left: 1px solid rgba(180, 240, 232, .16); }
.gauge-wrap { position: relative; flex: 0 0 auto; width: 104px; height: 104px; }
.hero .gauge { width: 104px; height: 104px; transform: rotate(-90deg); }
.hero .gauge .track { fill: none; stroke: rgba(180, 240, 232, .2); stroke-width: 11; }
.hero .gauge .val { fill: none; stroke: var(--hero-line); stroke-width: 11; stroke-linecap: round; }
.gauge-num { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-num); font-variant-numeric: tabular-nums; }
.gauge-num b { font-size: 27px; font-weight: 800; line-height: 1; letter-spacing: -.02em; }
.gauge-num span { font-size: 10px; letter-spacing: .06em; color: color-mix(in oklab, var(--hero-line) 70%, #fff); text-transform: uppercase; }
.hero-pillars { display: flex; flex-direction: column; gap: 9px; min-width: 0; flex: 1 1 auto; }
.hero-pillars .faixa { font-weight: 700; font-size: 15px; margin-bottom: 2px; }
.pillar { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; font-size: 11.5px; color: color-mix(in oklab, var(--hero-line) 40%, #fff); }
.pillar .ptrack { grid-column: 1 / 3; height: 5px; border-radius: 99px; background: rgba(180, 240, 232, .18); overflow: hidden; }
.pillar .ptrack > i { display: block; height: 100%; border-radius: 99px; background: var(--hero-line); }
```

**A anatomia do hero: duas colunas de tamanhos assimétricos.** `.hero` é um grid de
`1.5fr 1fr` — a coluna esquerda (`.hero-main`, o "Em conta") tem 1,5× o peso da direita
(`.hero-side`, o anel de saúde) — e `overflow: hidden` corta qualquer canto do gradiente que
escape do `border-radius`. `.hero-main` é uma coluna flex simples (`gap: 12px`) empilhando
eyebrow → `.hero-figure` (o número grande + o `.delta`) → `.hero-foot` (o rodapé com dado
auxiliar). `.hero-foot` reaproveita o truque `margin-top: auto` já visto no `.kpi-foot` (Bloco 4):
gruda no fim do card mesmo que o conteúdo acima varie de altura.

**Cores no hero não usam os tokens de status (`--pos`/`--neg`) — usam `rgba()` fixo.** Repare em
`.delta.up`/`.delta.dn`: em vez de `var(--pos)`/`var(--neg)`, os valores são `rgba(120, 240, 210,
...)`/`rgba(255, 180, 180, ...)` escritos à mão. Faz sentido porque o hero **não** retemiza
(lembra da anotação do Bloco 0/1: `--hero-*` fica escuro nos dois temas) — usar os tokens de
status geraria contraste ruim no claro, onde `--pos`/`--neg` são desenhados para um fundo claro,
não para a superfície escura do hero. É uma paleta paralela, deliberada, só para essa superfície.

**`.hero .eyebrow`, `.hero-foot`, `.gauge-num span` — o mesmo truque de contraste.**
`color-mix(in oklab, var(--hero-line) NN%, #fff)` aparece três vezes com percentuais diferentes
(75%, 55%, 70%, 40%) — cada uso pede um nível de contraste distinto contra o fundo escuro do
hero (texto principal precisa de mais contraste que uma legenda pequena), mas todos partem do
mesmo token `--hero-line`, misturado com branco em proporções diferentes em vez de declarar
quatro cores soltas nas mãos.

**`.hero-side` — o compartimento do anel.** Fundo semi-transparente escuro
(`rgba(3, 32, 30, .22)`) e uma borda esquerda sutil separam visualmente a metade do "score" da
metade do "saldo", sem precisar de uma borda dura ou uma segunda cor de fundo sólida.

**`.gauge-wrap` + `.gauge-num` — texto sobreposto ao SVG via `position: absolute`.** O anel
(`<svg class="gauge">`) e o número (`.gauge-num`) ocupam **o mesmo espaço físico**: `.gauge-wrap`
vira o `position: relative` de referência, e `.gauge-num { position: absolute; inset: 0 }` cobre
exatamente a área do wrapper, com `place-items: center` centralizando o texto no meio do anel —
a mesma técnica de sobreposição de camadas que reaparece no `.ring::after` mais abaixo.

**`clamp(32px, 5vw, 50px)` — tipografia fluida.** Três valores: mínimo,
preferido, máximo. O tamanho de fonte do número principal do hero cresce com a
largura da viewport (`5vw`), mas nunca fica menor que 32px nem maior que 50px.
Uma linha substitui o que precisaria de várias media queries pra um efeito
parecido.

**O anel do hero (`.gauge`) é CSS + SVG trabalhando juntos:** o **traço**
(`stroke-dasharray`) é calculado em JS (ver
[`gaugeSaude` em charts.js](./charts.explicado.md), Bloco 6); este arquivo cuida
do resto — tamanho, cor (`var(--hero-line)`), ponta arredondada
(`stroke-linecap: round`) e a **rotação** (`rotate(-90deg)`) que faz o
preenchimento começar no topo do círculo em vez de às 3 horas (o padrão de um
`<circle>` SVG).

**`.track` vs `.val` — dois círculos, um por cima do outro.** `charts.js` (`gaugeSaude`) desenha
**dois** `<circle>` no mesmo lugar: `.track` é o "trilho" de fundo, sempre completo (opacidade
baixa via `rgba(180, 240, 232, .2)`, sem `stroke-dasharray`) — mostra o que seria "100%"; `.val`
é desenhado por cima com o `stroke-dasharray` parcial que representa o score de verdade. A mesma
técnica visual de "trilho + preenchimento" que reaparece em `.bar`/`.bar > i` (Bloco de
categorias) e `.ring`/`.ring::after` logo abaixo — só que ali com barras/`conic-gradient`, aqui
com dois círculos SVG.

**`.hero-pillars`/`.pillar` — os três "pilares" do score, como mini-barras de progresso.** Cada
pilar é um grid de duas colunas (`1fr auto`: rótulo à esquerda, valor à direita) mais uma
**segunda linha** que a trilha ocupa sozinha — o truque é `.pillar .ptrack { grid-column: 1 / 3 }`,
que faz a trilha (a barrinha fininha de 5px) **atravessar as duas colunas** do grid, em vez de
ficar espremida numa só. `.ptrack > i` é o preenchimento propriamente dito (largura ajustada via
`style.width` inline, vindo de `app.js`), com o mesmo padrão trilho-cinza-translúcido +
preenchimento-sólido dos outros medidores do arquivo.

**Ring antigo, mantido só por compatibilidade.** Um pouco abaixo no arquivo
existe `.ring` (`conic-gradient(var(--brand) calc(var(--p) * 1%), ...)`) com o
comentário `/* score ring (mantido p/ compat; hero usa .gauge) */`. É um
segundo jeito de desenhar um anel de progresso — **só CSS**, via
`conic-gradient` e uma variável `--p` (percentual) que seria setada inline via
JS (`style="--p: 72"`) —, mas que o hero atual **não usa mais** (foi
substituído pelo `.gauge` em SVG). Vale reconhecer o padrão: código "morto"
mantido de propósito, com o comentário explicando por quê, em vez de apagado —
uma decisão explícita, não uma sobra esquecida.

---

## Bloco 6 — tabelas e formulários: os mesmos padrões, reaproveitados

```css
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:hover td { background: var(--surface-2); }

.field { display: flex; flex-direction: column; gap: 4px; }
input, select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
button.btn { padding: 8px 16px; border: none; border-radius: 8px; background: var(--brand); color: #fff; }
button.btn.ghost { background: var(--surface-2); color: var(--text); }
button.btn.danger { background: transparent; color: var(--neg); }
```

**`td.num`/`th.num` — alinhamento à direita como convenção, não exceção.**
Qualquer célula numérica ganha `text-align: right` + `tabular-nums` só por
carregar a classe `.num` — a mesma convenção do Bloco 2, aplicada
especificamente dentro de tabelas. É assim que colunas de valores em reais
ficam alinhadas pelo separador decimal visualmente, sem cálculo manual de
posição.

**Variantes de botão por sufixo de classe (`.btn`, `.btn.ghost`,
`.btn.danger`).** Uma classe base (`.btn`) define o formato comum (padding,
raio, peso da fonte); classes adicionais (`.ghost`, `.danger`) **sobrescrevem
só a cor**. É composição de classes CSS — o HTML combina `class="btn danger"`
— em vez de uma classe monolítica `.btn-danger` que reduplicasse o
formato inteiro. Reaproveita o mesmo princípio de "uma fonte de verdade" que
os tokens do Bloco 0 aplicam a cores.

---

## Bloco 7 — gráficos, badges e "pills" de status

```css
.chart-svg .bar-mark { transition: opacity .12s ease; }
.chart-svg:hover .bar-mark { opacity: .55; }
.chart-svg .bar-mark:hover { opacity: 1; }

.tabs .badge {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px;
  border-radius: 999px; background: var(--neg); color: #fff; font-size: 10px;
}

.pill-tipo.entrada { background: color-mix(in srgb, var(--pos) 16%, transparent); color: var(--pos); }
.pill-tipo.saida   { background: color-mix(in srgb, var(--neg) 16%, transparent); color: var(--neg); }
```

**O "destaque no hover" das barras (`.chart-svg:hover .bar-mark` +
`.bar-mark:hover`).** Um truque de dois seletores: ao passar o mouse em
**qualquer lugar do gráfico**, todas as barras escurecem levemente (opacidade
55%) — sinaliza "isto é interativo"; ao pousar sobre **uma barra específica**,
essa barra volta a 100% (a regra mais específica, `.bar-mark:hover`, vence a
mais geral). O efeito visual final: a barra sob o cursor "se destaca" das
outras, só com CSS, sem nenhum JavaScript de hover.

**`display: inline-grid; place-items: center` no badge.** Centralizar um
número dentro de um círculo/pílula é historicamente incômodo em CSS
(`line-height` manual, `vertical-align`...). `place-items: center` num
container grid resolve os dois eixos (horizontal e vertical) numa palavra só —
a técnica moderna preferida pra esse problema específico.

**`color-mix(in srgb, var(--pos) 16%, transparent)` — transparência sem
`rgba()`.** Pra pegar uma cor-token (`--pos`) e usá-la só parcialmente opaca, a
alternativa clássica seria manter uma segunda variável `rgba(28, 159, 82,
.16)` **duplicando** o valor da cor em outro formato. `color-mix(..., 16%,
transparent)` deriva a versão translúcida **direto do token existente** — se
`--pos` mudar de tom no tema escuro (e muda — ver Bloco 1), o `.pill-tipo.entrada`
acompanha automaticamente, sem precisar de um segundo token pra manter
sincronizado.

---

## Bloco 8 — toast e respeito a `prefers-reduced-motion`

```css
.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px);
  opacity: 0; transition: .25s; pointer-events: none;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

**O padrão "estado oculto tem transform + opacity, JS só alterna uma classe."**
`app.js` nunca precisa saber **como** o toast aparece — só adiciona/remove a
classe `.show`. Toda a animação (subir 20px + desvanecer) é resolvida pela
`transition` do CSS. `pointer-events: none` no estado padrão garante que o
toast (mesmo ocupando espaço fixo na tela) nunca **bloqueie cliques** em
elementos por baixo dele quando está invisível.

**`@media (prefers-reduced-motion: reduce)` — a única regra do arquivo com
`!important`, e de propósito.** Usuários que ativam "reduzir movimento" no
sistema operacional (frequentemente por sensibilidade vestibular/enxaqueca por
gatilho de movimento, não só preferência) precisam que **toda** transição pare
— por isso o seletor universal `*` e o `!important`: é a única regra do
arquivo inteiro onde sobrescrever tudo, incondicionalmente, é o comportamento
correto, não um cheiro de código.

---

## Bloco 9 — as regras que os blocos acima resumiram

Os Blocos 0 a 8 escolheram as regras que ensinam cada ideia. Este bloco fecha o espelho: tudo o que
ficou de fora aparece aqui, na ordem do arquivo, com o porquê do que não é óbvio. O teste
`test/estudo.test.mjs` confere que nenhuma regra do `app.css` fica sem aparecer em algum bloco.

### 9.1 O anel de pontuação antigo (`.ring`) — CSS morto

```css
/* score ring (mantido p/ compat; hero usa .gauge) */
.score-wrap { display: flex; align-items: center; gap: 16px; }
.ring { --p: 0; width: 84px; height: 84px; border-radius: 50%;
  background: conic-gradient(var(--brand) calc(var(--p) * 1%), var(--surface-2) 0);
  display: grid; place-items: center; flex: 0 0 auto; }
.ring::after { content: ""; width: 64px; height: 64px; border-radius: 50%; background: var(--surface); grid-area: 1/1; }
.ring .num { grid-area: 1/1; z-index: 1; font-weight: 800; font-size: 22px; }
```

**Ninguém usa mais.** O comentário do próprio arquivo avisa ("mantido p/ compat; hero usa .gauge"), e
uma busca confirma: nem `app.js` nem `charts.js` criam `.score-wrap` ou `.ring`. O hero do Bloco 5
desenha o medidor de saúde com `.gauge`. Fica aqui porque o espelho cobre o arquivo inteiro, mas é o
primeiro candidato a apagar numa limpeza.

**O truque que vale aprender mesmo assim: rosca só com CSS.** `conic-gradient` pinta o círculo como
uma pizza: `var(--brand)` de 0 até `--p`% e `var(--surface-2)` no resto. O `::after` é um círculo
menor da cor do fundo, empilhado no centro (`grid-area: 1/1` põe filho e pseudo-elemento na mesma
célula da grade); o "buraco" transforma a pizza em rosca. O número fica por cima com `z-index: 1`.
Quem usa só troca a variável: `style="--p: 72"`.

### 9.2 Tabelas por inteiro

```css
/* ---- Tabelas ---- */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:hover td { background: var(--surface-2); }
.tab-anos { margin-top: 14px; }
.tab-anos th:not(:first-child), .tab-anos td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
.tab-anos tr.ano-atual td { background: var(--brand-soft); font-weight: 700; }
.tab-anos tr.ano-atual td:first-child { color: var(--brand-ink); }
.tag { padding: 2px 8px; border-radius: 20px; font-size: 12px; background: var(--surface-2); }
.tag.ess { color: var(--pos); }
.tag.nao { color: var(--warn); }
.amount.in { color: var(--pos); }
.amount.out { color: var(--neg); }
```

**`.table-wrap { overflow-x: auto }` — tabela larga no celular.** Tabela não encolhe como texto: com
`white-space: nowrap` nas células (Bloco 6), uma tabela de 7 colunas passa da largura da tela. Em vez
de quebrar o layout da página inteira, o invólucro ganha rolagem horizontal só para ela.

**`border-collapse: collapse`.** Junta as bordas de células vizinhas numa linha só; sem isso, cada
célula desenha a sua e aparecem linhas duplas.

**`.tab-anos ... :not(:first-child)`.** Na tabela de anos, a primeira coluna é o rótulo (o ano) e
todas as outras são valores. Em vez de pôr `.num` em cada `<td>`, um seletor diz "toda célula que
não é a primeira" e alinha à direita. A linha do ano corrente (`tr.ano-atual`) ganha o fundo
`--brand-soft` e o rótulo em `--brand-ink`.

**`.tag`, `.amount` — cor com significado.** `.tag.ess` (essencial) em `--pos` e `.tag.nao` em
`--warn`; `.amount.in`/`.amount.out` pintam entrada e saída. É o mesmo princípio dos tokens do
Bloco 0: a cor vem de um papel (`--pos`, `--neg`), não de um hexadecimal escolhido ali.

### 9.3 Formulários por inteiro

```css
/* ---- Forms ---- */
.form-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin: 10px 0; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field span { font-size: 12px; color: var(--muted); }
input, select {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); color: var(--text); font: inherit; font-size: 14px; min-width: 120px;
}
input:focus, select:focus { outline: 2px solid var(--brand-2); outline-offset: -1px; }
button.btn {
  padding: 8px 16px; border: none; border-radius: 8px; background: var(--brand);
  color: #fff; font-weight: 600; cursor: pointer; font: inherit; font-size: 14px;
}
button.btn:hover { filter: brightness(1.06); }
button.btn.ghost { background: var(--surface-2); color: var(--text); }
button.btn.danger { background: transparent; color: var(--neg); padding: 4px 8px; }
button.link { background: none; border: none; color: var(--brand); cursor: pointer; font: inherit; }
```

**`.form-row` com `align-items: flex-end`.** Os campos têm rótulo em cima e altura diferente (um
`<select>`, um `<input>`, um botão). Alinhar pela base deixa todos os controles na mesma linha
visual, com os rótulos "pendurados" acima; com `flex-wrap: wrap` eles descem para a linha de baixo
quando a tela estreita.

**`font: inherit` em `input`, `select` e botão.** Por padrão o navegador dá a controles de
formulário uma fonte própria do sistema, menor que a do texto. `inherit` faz o controle usar a
mesma família do resto da página; o `font-size: 14px` logo depois fixa só o tamanho.

**`outline-offset: -1px` no foco.** O contorno de foco (acessibilidade: mostra onde está o teclado)
é desenhado 1px para dentro, por cima da borda, em vez de "engordar" o campo para fora.

**`filter: brightness(1.06)` no hover do botão.** Clareia o botão em 6% sem precisar de um segundo
token de cor "brand-hover": funciona igual no tema claro e no escuro.

**`button.link` — outro seletor morto.** Nenhum lugar do `app.js` cria `class: 'link'`; mesmo caso
do `.ring` em 9.1.

### 9.4 Grade de duas colunas, estado vazio e chips

```css
.subgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 760px) { .subgrid { grid-template-columns: 1fr; } }

.empty { color: var(--muted); padding: 24px; text-align: center; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: var(--surface-2); padding: 4px 10px; border-radius: 20px; display: flex; gap: 6px; align-items: center; }
.chip button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; }
```

**`.subgrid` + `@media (max-width: 760px)`.** Duas colunas lado a lado no computador; abaixo de
760px, uma coluna só. É o único `@media` de largura do arquivo: o resto do layout se adapta sozinho
com `flex-wrap` e `auto-fit` (Bloco 4).

**`.empty`.** O texto cinza centralizado que aparece quando uma lista está vazia ("Sem gastos neste
mês.", "Nenhuma fatura fecha neste mês."). Ter uma classe só para isso garante que todo estado vazio do app tenha a mesma cara.

**`.chips` / `.chip`.** As etiquetas arredondadas da tela de Config (as listas editáveis e as
regras de categorização), cada uma com um botãozinho de remover. `flex-wrap` deixa a lista quebrar em várias
linhas como texto.

### 9.5 Gráficos: eixos, legenda e barras de categoria

```css
/* ---- Gráfico de evolução (SVG) ---- */
.chart { width: 100%; }
.chart-svg { width: 100%; height: auto; display: block; overflow: visible; }
.chart-svg .grid { stroke: var(--grid); stroke-width: 1; }
.chart-svg .baseline { stroke: var(--grid); stroke-width: 1; }
.chart-svg .axis { fill: var(--muted); font-size: 10px; font-family: var(--font-num); font-variant-numeric: tabular-nums; }
.chart-svg .bar-mark { transition: opacity .12s ease; }
.chart-svg:hover .bar-mark { opacity: .55; }
.chart-svg .bar-mark:hover { opacity: 1; }

.chart-legend { display: flex; gap: 16px; margin-bottom: 10px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); font-weight: 600; }
.legend-item i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

/* sparkline (KPIs / hero) */
.spark { display: block; width: 100%; }

/* ---- Gastos por categoria (barras horizontais, uma cor só) ---- */
.chart-cats { display: flex; flex-direction: column; gap: 11px; }
.catrow { display: grid; grid-template-columns: 104px 1fr auto; align-items: center; gap: 11px; }
.catrow-nome { font-size: 12.5px; font-weight: 600; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.catrow-valor { font-size: 12.5px; color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.bar { background: var(--surface-2); border-radius: 999px; height: 9px; overflow: hidden; }
.bar > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, color-mix(in oklab, var(--c-cat) 78%, #fff 8%), var(--c-cat)); transition: width .5s cubic-bezier(.4, 0, .2, 1); }
```

**SVG com cor por token.** `.chart-svg .grid`, `.baseline` e `.axis` usam `stroke`/`fill` (as
propriedades de cor do SVG) apontando para `--grid` e `--muted`. Por isso o gráfico que `charts.js`
desenha troca de cor sozinho no tema escuro: o SVG não tem cor escrita, só classes.

**`overflow: visible` no SVG.** Rótulos do eixo que passam um pouco da área do desenho não são
cortados.

**`.catrow { grid-template-columns: 104px 1fr auto }`.** Cada linha de "para onde foi o dinheiro" é
uma grade de três colunas: nome com largura fixa, barra que ocupa o que sobrar (`1fr`) e valor do
tamanho do próprio texto (`auto`). Nome comprido não empurra a barra: `text-overflow: ellipsis`
corta com "…".

**A barra que cresce (`.bar > i`).** O `<i>` dentro de `.bar` recebe `width: 63%` pelo JS; a
`transition: width .5s cubic-bezier(.4, 0, .2, 1)` anima a mudança com a curva "sai rápido, chega
devagar". O degradê nasce de um único token (`--c-cat`) com `color-mix`, então não existe uma
segunda cor para manter.

### 9.6 Faturas, tela de lançar e as pílulas de tipo

```css
/* ---- Faturas (progresso do pagamento) ---- */
.fatura { padding: 13px 0; border-bottom: 1px solid var(--border); }
.fatura:last-child { border-bottom: 0; }
.fatura-topo { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.fatura-nums { font-size: 12px; margin-top: 6px; font-variant-numeric: tabular-nums; color: var(--muted); }
.bar-fatura { height: 9px; }
.bar-fatura > i { background: var(--pos); }

/* ---- Lançar: tipo como botão + valor em destaque ---- */
.card.destaque { border-color: var(--brand); }
.tipo-toggle { display: inline-flex; gap: 4px; padding: 4px; margin-bottom: 14px; background: var(--surface-2); border-radius: 10px; }
.tipo-btn { border: 0; background: transparent; color: var(--muted); padding: 7px 14px; border-radius: 7px; cursor: pointer; font: inherit; font-weight: 600; font-size: 13px; }
.tipo-btn:hover { color: var(--text); }
.tipo-btn.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
.input-valor { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.campos-cartao { display: contents; }
.form-row.compacta { margin-top: 8px; }

.pill-tipo { font-size: 11px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.pill-tipo.entrada { background: color-mix(in srgb, var(--pos) 16%, transparent); color: var(--pos); }
.pill-tipo.saida   { background: color-mix(in srgb, var(--neg) 16%, transparent); color: var(--neg); }
.pill-tipo.cartao  { background: color-mix(in srgb, var(--brand) 18%, transparent); color: var(--brand); }
.pill-tipo.transferencia { background: color-mix(in srgb, var(--muted) 18%, transparent); color: var(--muted); }
```

**`.fatura:last-child { border-bottom: 0 }`.** Cada fatura tem uma linha embaixo para separar da
próxima; a última não precisa. É mais simples que lembrar de não pôr a borda no último item no JS.

**`.tipo-toggle` / `.tipo-btn.active` — controle segmentado.** Os botões Saída / Entrada / Cartão
ficam numa "trilha" cinza; o ativo ganha fundo de cartão (`--surface`) e sombra, parecendo uma
peça levantada. Faz o papel de um grupo de botões de rádio (só um ativo por vez), feito com
`<button>` comuns e uma classe.

**`.campos-cartao { display: contents }` — o detalhe mais fino do arquivo.** Os campos "Cartão" e
"Parcelas" ficam dentro de uma `<div>` para o JS poder escondê-los juntos
(`camposCartao.style.display = 'none'`). Mas uma `<div>` no meio de `.form-row` viraria **um** item
do flex, e os dois campos ficariam presos dentro dela. `display: contents` faz a caixa da `<div>`
desaparecer do layout: os filhos passam a ser itens do `.form-row`, como se a `<div>` não
existisse. Quando o JS volta o `style.display` para `''`, vale de novo o `contents` do CSS.

**`.pill-tipo` base + variantes.** A forma (pílula pequena, `white-space: nowrap`) fica na classe
base; cada tipo só define a cor, de novo com `color-mix` sobre o token (ver Bloco 7).

### 9.7 Importação, planejamento e o contador da aba Revisar

```css
/* ---- Importação ---- */
input.file { padding: 8px; }
tr.dup { opacity: .55; }
tr.destaque-linha { background: color-mix(in srgb, var(--brand) 8%, transparent); }
.tag.warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.muted { color: var(--muted); }

/* ---- Planejar (orçamento estimado x real) ---- */
.bar-orc { height: 8px; margin-top: 2px; max-width: 240px; }
.bar-orc > i { background: var(--pos); }
.bar-orc.over > i { background: var(--neg); }
.num-input { min-width: 90px; width: 120px; text-align: right; font-variant-numeric: tabular-nums; }
.total-row td { border-top: 2px solid var(--border); }
.total-row:hover td { background: transparent; }

/* Contador da aba Revisar */
.tabs .badge {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 6px;
  border-radius: 999px; background: var(--neg); color: #fff;
  font-size: 10px; font-weight: 700; font-style: normal; line-height: 1;
  font-variant-numeric: tabular-nums;
```

**`tr.dup { opacity: .55 }`.** Na prévia da importação, linha que já existe aparece apagada: o
usuário vê que ela não vai ser gravada de novo sem precisar ler um aviso. `tr.destaque-linha` está
nesta seção do arquivo mas é usada na aba Cartões: na lista de parcelas, realça a que cai na fatura
do mês aberto (`p.mesFatura === mesAtual`).

**`.bar-orc.over > i`.** A barra do orçamento é verde até estourar; passou do estimado, o JS põe
`.over` e ela fica vermelha. Uma classe de estado em vez de cor calculada no JS.

**`.total-row:hover td { background: transparent }`.** Toda linha de tabela ganha fundo no hover
(Bloco 6), mas a linha de total não é clicável nem selecionável; esta regra desliga o efeito só
nela. Ordem importa: ela vem depois e é mais específica que `tr:hover td`.

**O badge completo.** O Bloco 7 mostrou o essencial (`inline-grid` + `place-items`); aqui estão o
`padding: 0 5px` (para "12" caber sem apertar), o `line-height: 1` (sem ele o número fica fora do
centro vertical) e o `tabular-nums` (dígitos da mesma largura: o badge não "pula" quando a contagem
muda de 9 para 10).

### 9.8 O toast completo

```css
/* ---- Toast ---- */
.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px);
  background: var(--text); color: var(--bg); padding: 10px 18px; border-radius: 10px;
  opacity: 0; transition: .25s; pointer-events: none; box-shadow: var(--shadow);
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

As linhas que o Bloco 8 resumiu: o toast usa as cores **invertidas** (`background: var(--text)`,
`color: var(--bg)`): escuro no tema claro e claro no tema escuro, sempre em contraste com a página
por baixo, sem um token só para ele.

---

## Mapa mental

```
  :root { tokens }  ──┬──► @media (prefers-color-scheme: dark) { redefine os MESMOS tokens }
                      │
                      ▼
     todo componente lê var(--token), nunca a cor crua
                      │
      ┌───────────────┼────────────────────────────┬─────────────────────┐
      ▼                ▼                            ▼                     ▼
   topbar/tabs     cards/KPI/hero              tabelas/forms          gráficos/badges/toast
  (sticky, color-mix, (grid auto-fit, clamp,   (.num = tabular,      (hover 2 seletores,
   scrollbar oculta)   gradientes compostos)    composição de .btn)   color-mix p/ transparência)
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Tokens de design (`:root` custom properties)** | Bloco 0 | nomear pelo papel, não pela aparência — permite retemizar sem tocar componentes |
| **Dark mode por redefinição de token** | Bloco 1 | `@media` só redeclara os mesmos nomes; zero duplicação de regra de componente |
| **`[class*="num"]` + `tabular-nums`** | Bloco 2 | dígitos de largura igual, aplicado por convenção de nome de classe |
| **`:where()` para especificidade zero** | Bloco 2 | acessibilidade de baixa prioridade, fácil de sobrescrever depois |
| **`color-mix()`** | Blocos 3/7 | mistura/transparência nativa, sem duplicar cor em outro formato |
| **`repeat(auto-fit, minmax())`** | Bloco 4 | grid responsivo sem media query |
| **Gradientes empilhados (`background` em camadas)** | Bloco 5 | radial + linear compostos numa única propriedade |
| **`clamp()` (tipografia fluida)** | Bloco 5 | tamanho de fonte que escala com a viewport, com piso e teto |
| **Código morto mantido de propósito** | `.ring` (Bloco 5) | comentário explica por quê; não é sobra esquecida |
| **Composição de classes (`.btn.ghost`)** | Bloco 6 | variante = classe base + modificador, não duplicar o formato inteiro |
| **Estado visual via `transition` + toggle de classe** | Bloco 8 (toast) | JS só alterna `.show`; a animação é 100% CSS |
| **`prefers-reduced-motion`** | Bloco 8 | acessibilidade de movimento — a única exceção legítima a `!important` |

**Próximo:** [`app.js`](./app.explicado.md) — o arquivo que decide **o quê**
aparece; tudo que este CSS estiliza e tudo que `charts.js` desenha é montado e
inserido em `#view` por ele.
