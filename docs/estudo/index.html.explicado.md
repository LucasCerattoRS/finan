# `src/ui/index.html` — explicado

> **O que é este arquivo:** a **casca** (shell) inteira da aplicação. É o único
> HTML do projeto — não existe um arquivo por aba (Dashboard, Cartões,
> Metas...). Isso é a marca registrada de uma **SPA** (*single page
> application*): uma página só, e o conteúdo de cada aba é **injetado** dentro
> dela em tempo de execução por [`app.js`](./app.explicado.md).
>
> **Nomenclatura:** este doc chama-se `index.html.explicado.md` (com a
> extensão), não `index.explicado.md` — esse nome já é do
> [`src/core/index.js`](./index.explicado.md). São dois arquivos "index"
> diferentes, em pastas diferentes.
>
> **Papel na arquitetura:** carregado por `electron/main.js` via
> `win.loadFile(...)` (ver [`main.explicado.md`](./main.explicado.md), Bloco 8).
> Puxa `../styles/app.css` e `./app.js` — é `app.js` quem faz o trabalho de
> verdade; este arquivo só monta o andaime em volta.

---

## Bloco 0 — cabeçalho do documento

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Finan</title>
  <link rel="stylesheet" href="../styles/app.css" />
</head>
```

**O que faz.** O boilerplate HTML5 padrão: charset, viewport, título da janela,
folha de estilo.

**Sintaxe:**
- `lang="pt-BR"` — não é decoração: leitores de tela usam isso pra escolher a
  pronúncia certa, e o corretor ortográfico do navegador/SO usa pra saber que
  idioma checar.
- `meta viewport` — convenção de app **mobile-first**, herdada mesmo num app
  desktop Electron. Não atrapalha aqui, mas também não faz muita diferença
  numa janela desktop de tamanho fixo — é só boilerplate barato que vem de
  fábrica em qualquer HTML moderno.
- `href="../styles/app.css"` — caminho **relativo ao próprio arquivo HTML no
  disco**. Como `electron/main.js` carrega este arquivo com
  `loadFile(path.join(__dirname, '..', 'src', 'ui', 'index.html'))`, o
  navegador resolve `../styles/app.css` a partir de `src/ui/`, chegando em
  `src/styles/app.css`. Não há bundler nem servidor — é navegação de arquivo
  puro (`file://`), então o caminho relativo *tem* que bater com a estrutura
  real de pastas do projeto.

---

## Bloco 1 — a topbar (marca, abas, seletor de mês)

```html
<body>
<header class="topbar">
  <div class="brand">
    <span class="logo">◈</span>
    <span>Finan</span>
  </div>
  <nav class="tabs" id="tabs">
    <button data-tab="dashboard" class="active">Início</button>
    <button data-tab="lancamentos">Lançar</button>
    <button data-tab="importar">Importar</button>
    <button data-tab="revisar">Revisar <i class="badge" id="badgeRevisar"></i></button>
    <button data-tab="cartoes">Cartões</button>
    <button data-tab="planejar">Planejar</button>
    <button data-tab="reservas">Reservas</button>
    <button data-tab="metas">Metas</button>
    <button data-tab="config">Config</button>
  </nav>
  <div class="topright">
    <label class="mes-picker">
      <span>Mês</span>
      <select id="mesSelect"></select>
    </label>
    <span class="saldo-pill" id="saldoPill">R$ 0,00</span>
  </div>
</header>
```

**O que faz.** A barra fixa no topo: marca, os 9 botões de navegação entre
abas, o seletor de mês corrente e um "pill" mostrando o saldo.

**Sintaxe/conceito — `data-tab` como contrato HTML↔JS.** Cada botão carrega um
atributo `data-tab="dashboard"`, `data-tab="cartoes"`, etc. Isso não é CSS nem
semântica HTML padrão — é um **atributo de dados** (`data-*`), lido em
JavaScript via `botao.dataset.tab`. É o mesmo papel que `padrao`/`categoria` faz
em [`regras.js`](./regras.explicado.md): **dado como configuração**, aqui na
camada HTML. `app.js` não precisa de um `if` por botão; ele lê `dataset.tab` e
decide o que desenhar de forma genérica.

**`<select id="mesSelect"></select>` — vazio de propósito.** Não há
`<option>` nenhuma aqui; a lista de meses é preenchida por `app.js` a partir do
que existe em `estado.transacoes` (meses com movimento real, não uma lista
fixa de 12). O HTML só reserva o **lugar**.

**`<i class="badge" id="badgeRevisar"></i>`** — um elemento inline vazio, sem
texto nenhum no HTML. `app.js` decide o número (quantas transações esperam
revisão) e a visibilidade; o CSS (`.tabs .badge`, ver
[`app.css`](./app.css.explicado.md)) já deixa pronta a bolinha vermelha, só
esperando conteúdo.

**Armadilha/observação.** Repare que **não existe** um `<div id="dashboard">`,
`<div id="cartoes">` etc. — nenhuma seção pré-construída por aba. Quem só olha
o HTML esperando achar "onde está o conteúdo de cada aba" não vai achar nada
aqui. Isso é intencional, não uma omissão: é o assunto inteiro do próximo
documento.

---

## Bloco 2 — o corpo real: um contêiner vazio

```html
<main id="view"></main>

<div id="toast" class="toast"></div>

<script type="module" src="./app.js"></script>
</body>
</html>
```

**O que faz.** Três linhas que resumem toda a filosofia da UI: um contêiner
vazio (`#view`), um contêiner de notificação vazio (`#toast`), e o script que
enche os dois.

**Conceito por trás — o padrão SPA de contêiner único.** Ao invés de ter uma
`<div>` por aba e alternar `display: none`/`block` entre elas (uma técnica
comum e válida em outros apps), este projeto **substitui o conteúdo inteiro**
de `#view` a cada troca de aba. `app.js` decide qual aba está ativa e gera o
HTML daquela aba do zero, toda vez. Vantagem: só existe **um** lugar no DOM pra
raciocinar; o estado "qual aba está ativa" mora só em JS, nunca duplicado em
CSS. É o mesmo espírito de "derive, não armazene" que aparece nos cálculos do
núcleo (ver [`calculos.explicado.md`](./calculos.explicado.md)) — aqui aplicado
à própria interface: a tela é **derivada** do estado a cada render, não mantida
por partes escondidas/mostradas.

**`<div id="toast">`** — o mecanismo de feedback global ("Salvo com sucesso",
"Erro ao importar"). Um único elemento reaproveitado pra qualquer mensagem da
sessão inteira, com a classe `.show` (ver CSS) alternando visibilidade — não
precisa criar/destruir elementos a cada aviso.

**`<script type="module">`** — a peça que habilita `import`/`export` dentro de
`app.js` (e por extensão, tudo que ele importa de `src/core` e
`src/ui/storage.js`). Sem `type="module"`, o `import { ... } from '...'` no
topo de `app.js` seria um erro de sintaxe. Efeito colateral útil: scripts
`type="module"` já rodam em **modo estrito** automaticamente e são **adiados**
por padrão (equivalente a `defer` — só executam depois do HTML ser parseado),
sem precisar declarar isso explicitamente.

**Armadilha (que não morde aqui, mas quase sempre morde em outro contexto).**
Módulos ES carregados via `file://` costumam esbarrar em bloqueio de CORS num
navegador comum (abrir um HTML local com duplo-clique e ver o console reclamar
de `import` bloqueado). Isso **não acontece** aqui porque quem carrega este
HTML não é um navegador genérico — é o Chromium embutido do Electron, através
de `BrowserWindow.loadFile`, que tem permissão para isso. Vale saber que é uma
particularidade do ambiente Electron, não uma regra geral de módulos ES.

---

## Mapa mental

```
  index.html (carregado 1x por electron/main.js)
       │
       ├── <head> ── link app.css (tema, cores, layout)
       │
       ├── <header class="topbar">
       │      ├── nav#tabs  → botões com data-tab="..." (contrato p/ app.js)
       │      ├── select#mesSelect  (vazio — preenchido em runtime)
       │      └── span#saldoPill   (vazio — preenchido em runtime)
       │
       ├── <main id="view"></main>       ◄── app.js REESCREVE isto a cada troca de aba
       ├── <div id="toast"></div>        ◄── app.js alterna .show pra avisos
       └── <script type="module" src="./app.js">   ◄── o motor de tudo
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **SPA de contêiner único** | `<main id="view">` | uma aba = reescrever o mesmo contêiner, não alternar `display` |
| **`data-*` como contrato HTML↔JS** | `data-tab="..."` | dado de configuração dentro do próprio HTML |
| **Elemento vazio como "slot"** | `#mesSelect`, `#saldoPill`, `#badgeRevisar` | HTML reserva o lugar; JS decide o conteúdo |
| **`<script type="module">`** | fim do `<body>` | habilita `import`/`export`; roda estrito e adiado por padrão |
| **Caminho relativo ao arquivo, não a um servidor** | `href="../styles/app.css"` | sem bundler: a pasta real do projeto importa |

**Próximo:** [`charts.js`](./charts.explicado.md) — os gráficos SVG desenhados
à mão que aparecem dentro do que `app.js` injeta em `#view`.
