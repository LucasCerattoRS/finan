# `src/ui/app.js` — Parte 1: estado global, helpers de DOM, e o roteador

> **O que é esta parte:** as linhas 1–99 de `app.js` — o alicerce que todo o
> resto do arquivo (Partes 2 a 8) usa sem repetir: as variáveis que guardam o
> que está na tela agora, o helper `el` que constrói DOM sem framework, os
> pequenos utilitários (`opts`, `field`, `toast`, `fmt`, `hoje`, `nomeCartao`,
> `rotuloTipo`), o ritual `persistir()` que toda mutação segue, a lógica do
> cabeçalho fixo (`listaMeses`, `atualizarBadge`, `atualizarTopo`), e o
> roteador `render()` que decide qual aba desenhar.
>
> **Papel na arquitetura:** `app.js` é o controlador da UI inteira — lê e
> escreve em `estado` através das operações do núcleo (`import * as C from
> '../core/index.js'`), persiste via `storage.js`, desenha gráficos via
> `charts.js`, e enche o `<main id="view">` que `index.html` deixou vazio de
> propósito. Esta Parte 1 é a única que todas as outras partes pressupõem —
> ler as Partes 2–4 sem ter lido esta primeiro deixaria `el`, `persistir`,
> `render` e as variáveis de módulo como caixas-pretas.
>
> **Pré-requisitos:** [`index.explicado.md`](./index.explicado.md) (o formato
> de `estado` que este arquivo lê e reescreve), [`storage.explicado.md`](./storage.explicado.md)
> (`carregarEstado`/`salvarEstado`, chamados por `persistir`),
> [`charts.explicado.md`](./charts.explicado.md) (o `sparkline`/`gaugeSaude`
> importados aqui e usados na Parte 2), [`model.explicado.md`](./model.explicado.md)
> (`formatarBRL`, por trás de `fmt`), [`calculos.explicado.md`](./calculos.explicado.md)
> (`mesesComMovimento`, `saldoAcumulado`, usados em `listaMeses`/`atualizarTopo`)
> e [`revisar.explicado.md`](./revisar.explicado.md) (`totalARevisar`, por trás
> do badge). Sem framework: nada de React/Vue/Svelte aqui — vale ter em mente
> por quê, dado o resto do projeto (`CLAUDE.md`): um framework pesaria no
> bundle e adicionaria uma etapa de build, dois atritos para um app que
> precisa rodar direto do pendrive sem instalação.

---

## Bloco 1 — o cabeçalho e os imports

```js
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
```

**O que faz.** Três importações. A primeira traz **todo** o núcleo sob um só
nome (`C`); as outras duas trazem, nomeadas uma a uma, as funções de
persistência (`storage.js`) e de desenho de gráfico (`charts.js`).

**Sintaxe — `import * as C from '...'` (import de namespace).** Existem dois
jeitos de importar de um módulo ES: **desestruturado** (`import { resumoMes,
saldoAcumulado, scoreSaude, ... } from '../core/index.js'`, listando cada nome)
ou **de namespace**, como aqui. Com `* as C`, tudo que `core/index.js` exporta
vira uma propriedade do objeto `C`: `C.resumoMes`, `C.saldoAcumulado`,
`C.scoreSaude`. A diferença não é só de estilo — o núcleo exporta **dezenas**
de funções (ver `src/core/index.js`, que faz `export * from './calculos.js'`
etc. para nove arquivos); listar cada uma manualmente seria uma lista enorme e
frágil (esquecer de importar uma nova função do núcleo quebraria em tempo de
execução, não de leitura). Com o namespace, qualquer coisa que o núcleo
exportar já está disponível como `C.algumaCoisa` — e cada chamada, em
qualquer parte do arquivo, fica **autodocumentada**: ao ler `C.registrarPagamentoFatura(...)`
em qualquer lugar do arquivo já se sabe "isto é uma operação do núcleo", sem
precisar checar o topo do arquivo para saber de onde veio.

**Conceito por trás — a fronteira de camadas fica visível no código.** O
prefixo `C.` não é só conveniência: ele marca visualmente, a cada chamada, a
travessia entre a casca (`app.js`, com DOM e efeito colateral) e o núcleo
(`src/core`, puro, testável sem navegador). Grep por `C\.` no arquivo mostra
exatamente onde a UI depende de regra de negócio — e onde não depende.

**Alternativa e trade-off.** Import desestruturado dá **tree-shaking** mais
fácil para bundlers (o empacotador sabe exatamente o que é usado) e detecta em
tempo de edição se um nome não existe mais. Import de namespace perde essas
duas vantagens, mas ganha em **não precisar manter uma lista de imports
sincronizada** com o que o núcleo exporta — e, como o app roda sem bundler
(direto no navegador via `<script type="module">`, ver `index.html.explicado.md`),
tree-shaking não está em jogo aqui de qualquer forma. A escolha é coerente com
o contexto: sem build step, a vantagem do desestruturado desaparece e só sobra
a conveniência do namespace.

---

## Bloco 2 — as cinco variáveis de módulo

```js
let estado = C.estadoInicial();
let mesAtual = new Date().toISOString().slice(0, 7);
let tabAtual = 'dashboard';
let candidatos = null; // pré-visualização da importação (não persistida)
let revisarSoNomeados = true; // ver revisar.js: só o que o extrato nomeia pode virar regra
```

**O que faz.** Declara cinco `let` no escopo do módulo — ou seja, variáveis
que existem **uma vez só**, vivem durante a sessão inteira do app, e são
visíveis por **todas** as funções deste arquivo (não precisam ser passadas
como parâmetro).

**Sintaxe — escopo de módulo.** Um arquivo `.js` carregado como `type="module"`
tem seu próprio escopo: `let`/`const` no nível mais externo do arquivo não
vazam para o objeto global (`window`), mas ficam acessíveis para qualquer
função declarada **no mesmo arquivo**, não importa a ordem de declaração
relativa (funções são "hoisted"). É por isso que `renderDashboard` (Parte 2),
declarada bem depois, consegue ler `estado` e `mesAtual` livremente.

**Conceito por trás — o único lugar do app com estado mutável de verdade.**
Isso é proposital e é a contrapartida da regra do `CLAUDE.md` ("núcleo puro,
UI com efeito colateral"): o núcleo inteiro (`src/core`) é feito de funções
que devolvem estado **novo** sem nunca mutar nada (você viu isso em
`calculos.explicado.md`: "esta camada só deriva, nunca altera"). Este arquivo
é o único lugar do app onde essa disciplina "acaba" — aqui,
`estado = C.algumaOperacao(estado, dados)` **reatribui** a variável de módulo
a cada mutação. É a fronteira entre o mundo funcional (núcleo) e o mundo
imperativo (UI), e ela está exatamente aqui, nestas cinco linhas.

**Duas categorias de estado, e por que a distinção importa.** `estado` é
**persistente** — todo o resto do app parte dele, e ele sobrevive a
fechar/abrir o app via `dados.json` (ver `storage.explicado.md`). `candidatos`
e `revisarSoNomeados` são **transientes** — só existem em memória, nunca vão
para o disco sozinhos; servem para guardar "o que a tela está mostrando
agora", não "o que é verdade sobre suas finanças". Essa distinção reaparece
com consequências práticas na Parte 4 (Importar): ler um arquivo de extrato
preenche `candidatos`, mas **não** chama `persistir()` — só `render()` — porque
nada foi confirmado ainda.

**Armadilha evitada pelo comentário.** As duas últimas linhas trazem
comentário explicando **por que** a variável existe e o que ela guarda —
`candidatos` e `revisarSoNomeados` não são autoexplicativas olhando só o
nome; sem o comentário, um leitor futuro poderia achar que `candidatos` faz
parte do `estado` persistido e tentar salvá-la por engano.

---

## Bloco 3 — três atalhos de uma linha

```js
const $ = (sel) => document.querySelector(sel);
const fmt = C.formatarBRL;
const hoje = () => new Date().toISOString().slice(0, 10);
```

**O que faz.** `$` é um apelido curto para `document.querySelector` (o nome
`$` é uma convenção antiga, herdada do jQuery, para "buscar elemento na
página"). `fmt` é só outro nome para `C.formatarBRL` — a função de
formatação de dinheiro do núcleo (ver `model.explicado.md`). `hoje()` devolve
a data de hoje no formato `"YYYY-MM-DD"`.

**Sintaxe — `const fmt = C.formatarBRL` (função como valor).** Em JavaScript,
funções são **valores de primeira classe**: `C.formatarBRL` já é a função em
si (sem parênteses, então não é *chamada* aqui, só *referenciada*).
Atribuí-la a `fmt` cria um segundo nome para a mesma função — chamar
`fmt(1050)` é idêntico a chamar `C.formatarBRL(1050)`. É puro açúcar de
legibilidade: `fmt(r.entradas)` (usado dezenas de vezes no arquivo) é mais
curto e menos repetitivo que `C.formatarBRL(r.entradas)` a cada chamada.

**Sintaxe — `new Date().toISOString().slice(0, 7)` vs. `slice(0, 10)`.**
`toISOString()` sempre devolve algo como `"2026-07-20T14:32:00.000Z"`. Fatiar
os primeiros 7 caracteres pega `"2026-07"` (ano-mês, o formato que `mesAtual`
usa em todo o arquivo); fatiar os primeiros 10 pega `"2026-07-20"`
(ano-mês-dia, o formato de um campo `<input type="date">`). A mesma técnica de
"string ISO tem largura fixa, fatiar por posição é seguro" que você viu em
`calculos.explicado.md` (`m.slice(0, 4)` para extrair o ano de um mês).

**Armadilha — `toISOString()` usa UTC, não o fuso local.** Isso significa que
perto da meia-noite, num fuso com diferença grande de UTC, `hoje()` pode
devolver a data de "ontem" ou "amanhã" dependendo da hora exata. Para um app
de finanças pessoais isso raramente importa (o usuário ajusta a data manual se
precisar), mas é o tipo de detalhe que um app de fuso-crítico (ex.: reservas de
hotel) não poderia ignorar.

---

## Bloco 4 — `el`, o hyperscript para HTML

```js
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
```

**O que faz.** Cria um elemento HTML (`tag`), aplica um conjunto de
propriedades (`props`) e anexa filhos (`children`). É chamada centenas de
vezes no arquivo inteiro — o "tijolo" com que toda tela é construída, no
lugar de `document.createElement` + `.setAttribute` + `.append` cru repetidos
à mão.

**Como faz, passo a passo:**
1. `document.createElement(tag)` cria o nó vazio (`<div>`, `<button>`, etc.).
2. Para cada par `[chave, valor]` de `props`, decide o que fazer conforme a
   chave: caso especial `class`, caso especial `html`, caso especial `on*` com
   função, e um caso genérico (`setAttribute`) para tudo o mais.
3. Para cada filho, ignora `null`/`undefined` (permite passar `condição ?
   elemento : null` sem checar antes) e decide entre anexar o nó direto ou
   criar um nó de texto se `c` não for um nó de DOM.

**Sintaxe explicada do zero:**
- `props = {}` e `children = []` — **parâmetros com valor padrão**. Chamar
  `el('div')` sozinho é válido: sem `props`, o laço `Object.entries({})` não
  itera nada; sem `children`, o laço de filhos também não itera nada. Isso é
  o que permite `el('div', { class: 'foo' })` sem terceiro argumento.
- `Object.entries(props)` — transforma `{ class: 'card', title: 'oi' }` em
  `[['class', 'card'], ['title', 'oi']]`, uma lista de pares chave/valor,
  percorrível com `for...of`.
- `for (const [k, v] of ...)` — **destructuring** de array direto na
  variável do laço: cada item de `Object.entries(...)` já é um par
  `[chave, valor]`; `[k, v]` desmonta esse par em duas variáveis de uma vez,
  em vez de escrever `item[0]` e `item[1]`.
- `k.startsWith('on') && typeof v === 'function'` — duas condições com `&&`:
  a chave começa com `'on'` **e** o valor é uma função. As duas precisam ser
  verdade — só assim `onclick: () => {...}` vira `addEventListener('click',
  ...)`, em vez de tentar `setAttribute('onclick', funçãoAqui)` (que quebraria,
  porque atributos HTML só aceitam string).
- `k.slice(2)` — corta os dois primeiros caracteres de `'onclick'`, sobrando
  `'click'`, o nome de evento que `addEventListener` espera.
- `v !== null && v !== undefined` — **guarda explícita**, diferente de só
  `if (v)`: um valor `0` ou `''` é falsy mas **válido** como atributo (ex.:
  `value: 0`). Testar contra `null`/`undefined` especificamente evita
  descartar por engano um atributo cujo valor legítimo é zero ou string vazia.
- `[].concat(children)` — **normaliza `children` para sempre ser array**,
  mesmo que quem chamou `el` tenha passado um item solto (`el('span', {},
  'texto')` em vez de `el('span', {}, ['texto'])`). `[].concat(x)` devolve
  `[x]` se `x` não for array, ou o próprio array "achatado" um nível se `x`
  já for array — um truque idiomático para "aceite tanto um item quanto uma
  lista".
- `c == null` — **igualdade fraca (`==`), de propósito.** `null == undefined`
  é `true` em JavaScript (é a única comparação onde `==` frouxo é considerado
  aceitável por convenção), então esta única checagem cobre os dois casos que
  merecem ser pulados.
- `c.nodeType ? c : document.createTextNode(String(c))` — **duck typing**:
  em vez de perguntar "isso é um nó de DOM?" com `instanceof Node`, o código
  testa se `c` **tem** a propriedade `nodeType` (todo nó de DOM tem; strings e
  números não). Se tem, `c` já é um elemento pronto para `.append`; se não
  tem, `String(c)` converte para texto (cobre números, por exemplo, um `label`
  passado como `123`) e `createTextNode` embrulha como nó de texto puro (sem
  interpretar HTML).

**Conceito por trás — "hyperscript": construir árvore de DOM com chamadas de
função em vez de template de marcação.** É o mesmo padrão de `s()` em
`charts.js` (que faz o equivalente para elementos SVG, com namespace
diferente) — aqui, para HTML comum, sem namespace. A ideia central: uma
função que recebe (tag, propriedades, filhos) e devolve um nó, permitindo
compor árvores inteiras como chamadas aninhadas (`el('div', {}, [el('span',
{}, 'a'), el('span', {}, 'b')])`) em JavaScript puro, sem depender de um
template engine ou de JSX com etapa de compilação.

**Alternativa e trade-off.** Escrever `innerHTML` com template literals
(`` `<div class="${cls}">${texto}</div>` ``) seria mais compacto para telas
simples, mas exige **escapar manualmente** qualquer texto vindo do usuário
(senão abre XSS) e reconstrói o DOM inteiro string por string a cada chamada.
`el(...)` cria nós reais, e texto vira `createTextNode` — automaticamente
escapado (o browser nunca interpreta o conteúdo de um nó de texto como
marcação). O preço é mais verboso na chamada (`el('div', {class:'x'}, 'y')`
em vez de `` `<div class="x">y</div>` ``).

**Armadilha — `html` é a única porta de entrada de marcação crua.** A
convenção `k === 'html'` faz `n.innerHTML = v` — ao contrário de todo o resto
do helper, que sempre passa por `setAttribute` ou `createTextNode` (ambos
seguros contra injeção). No código atual, essa porta só é usada com o
literal fixo `'&nbsp;'` (um espaço não-quebrável, para alinhar rótulos vazios
em formulários — você vai ver isso nas Partes 2–4) — nunca com dado vindo do
usuário ou do extrato importado. Vale reconhecer isso como o único ponto do
arquivo que **poderia** virar uma abertura de XSS se um dia alguém passasse,
por exemplo, `{ html: transacao.descricao }` com uma descrição vinda de um
extrato bancário. Hoje não é usada assim — mas é o ponto que merece atenção
se o código crescer.

---

## Bloco 5 — `opts`, `field`, `toast`

```js
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
```

**`opts` — preenche um `<select>` a partir de uma lista simples.** Para cada
valor de `lista`, cria uma `<option>`. `sel` é o valor que deve nascer
marcado como selecionado.

**Sintaxe — spread condicional.** `...(v === sel ? { selected: '' } : {})`:
se `v === sel` é falso, o spread de `{}` não adiciona nada ao objeto de
propriedades; se verdadeiro, espalha `{ selected: '' }` dentro dele. É um
jeito de **adicionar uma propriedade condicionalmente dentro de um objeto
literal**, sem precisar de um `if` separado nem montar o objeto em duas
etapas. Esse exato truque reaparece dezenas de vezes ao longo do arquivo
inteiro, sempre que uma prop deve existir só sob uma condição (`checked`,
`selected`, classes condicionais).

**`field` — o átomo de layout mais reusado do arquivo.** Rótulo + input,
sempre no mesmo formato (`<label class="field"><span>rótulo</span><input
.../></label>`). Toda tela usa `field(...)` em vez de escrever essa estrutura
cru repetidamente — o mesmo instinto de "não repita a forma" que você vai
reencontrar em `kpi` (Parte 2) e em `cardMeta` (Parte 7, fora do escopo desta
mirror).

**`toast` — mensagem temporária no rodapé da tela.** Escreve a mensagem no
elemento `#toast`, adiciona a classe `show` (que o CSS anima), e agenda a
remoção da classe depois de `ms` milissegundos: 1800 por padrão (parâmetro com
valor padrão, `ms = 1800`), mais quando o aviso é longo e importante, como o de
dados ilegíveis do Bloco 7.

**Sintaxe — `toast._t` como "slot de memória".** Funções em JavaScript são
objetos — podem ganhar propriedades como qualquer outro objeto. `toast._t =
setTimeout(...)` guarda o **id do timer** como propriedade da própria função
`toast`, em vez de precisar de uma variável de módulo separada (`let
ultimoTimer`, ao lado das cinco do Bloco 2). `clearTimeout(toast._t)` no
início de cada chamada cancela qualquer toast anterior ainda pendente — assim,
toasts em sequência rápida (por exemplo, lançar três transações seguidas) não
brigam entre si para decidir quando a mensagem some; cada chamada nova reinicia
o relógio.

**Conceito por trás — duas soluções válidas para "lembrar algo entre
chamadas".** Guardar estado numa variável de módulo dedicada (como `estado`,
`mesAtual`) e guardar estado como propriedade de uma função (`toast._t`) são
as duas formas idiomáticas de closure/memória em JS. A escolha aqui é de
conveniência local: `_t` só interessa a `toast`, então acoplá-lo à própria
função evita "sujar" o escopo de módulo com mais uma variável que só uma
função usa.

---

## Bloco 6 — `nomeCartao` e `rotuloTipo`

```js
const nomeCartao = (id) => (estado.cartoes.find((c) => c.id === id) || {}).nome || '—';
const rotuloTipo = (t) => ({ entrada: 'Entrada', saida: 'Saída', cartao: 'Cartão', transferencia: 'Transf.' }[t] || t);
```

**O que faz.** `nomeCartao(id)` traduz o id de um cartão para o nome legível
("Nubank", "Inter"...); `rotuloTipo(t)` traduz o tipo interno de uma
transação (`'entrada'`, `'saida'`, `'cartao'`, `'transferencia'`) para o texto
em português mostrado na tabela.

**Sintaxe — `.find(...) || {}`, o "objeto vazio de reserva".** `Array.find`
devolve `undefined` se nada casa. `(undefined).nome` quebraria o programa
(`TypeError: Cannot read properties of undefined`); `(undefined || {}).nome`
não quebra, porque `undefined || {}` avalia para `{}`, e `{}.nome` é apenas
`undefined` — um resultado inofensivo. A segunda cadeia `|| '—'` então troca
esse `undefined` por um traço visível, para a UI nunca mostrar a palavra
literal `"undefined"` se o cartão foi removido mas alguma transação antiga
ainda referencia o id dele.

**Sintaxe — objeto literal como tabela de tradução, com `[t]` para buscar e
`|| t` como caso padrão.** `{ entrada: 'Entrada', ... }[t]` é a mesma técnica
de "objeto como `switch`" que você vai reencontrar na tabela de despacho de
`render()` (Bloco 9) — só que aqui devolvendo uma **string**, não uma
função. `|| t` é a rede de segurança: se `t` for um tipo desconhecido (não
deveria acontecer, mas é barato se proteger), devolve o próprio valor cru em
vez de `undefined`.

**Conceito por trás — tradução técnico → humano na fronteira da UI.** Nenhuma
das duas funções guarda regra de negócio; ambas só decidem **como
apresentar** um dado que o núcleo já decidiu (o `tipo` da transação, o `id`
do cartão). É a mesma fronteira "núcleo entrega o fato, UI decide como
mostrar" que aparece de novo em `prazoLegivel` (Parte 7, fora desta mirror).

---

## Bloco 7 — `persistir`, o ritual central

```js
const AVISO_LEITURA = 'Seus dados salvos não puderam ser lidos. Nada será gravado até você importar um backup (Config → Importar backup). O arquivo original não foi tocado.';

async function persistir() {
  if (falhaDeLeitura()) { toast(AVISO_LEITURA, 10000); return; }
  await salvarEstado(estado);
  atualizarTopo();
  render();
}
```

**A guarda da primeira linha (08/10/2026).** Se a leitura dos dados falhou ao abrir
(`storage.js`, Bloco 0.5), `persistir` não tenta gravar: mostra o aviso por 10 segundos e
volta. A mudança fica só na tela; o arquivo original continua intacto até o usuário importar um
backup. É aqui, no ponto único de mutação, que a guarda faz sentido: nenhuma das trinta
funções que mudam o estado precisa saber que ela existe.

**O que faz.** Três linhas, mas é o contrato central do app inteiro. Toda
mutação, em qualquer aba, segue **exatamente** este ritual: gravar no disco
(`salvarEstado`, de `storage.js`), atualizar o cabeçalho fixo (saldo, badge,
lista de meses), redesenhar o conteúdo da aba atual.

**Como faz.** `await salvarEstado(estado)` — espera a escrita em disco
terminar antes de seguir (`salvarEstado` é `async`; ver
`storage.explicado.md`). Só então `atualizarTopo()` (Bloco 8) e `render()`
(Bloco 9) rodam, síncronos.

**Sintaxe — `async function` + `await`.** Uma função `async` sempre devolve
uma `Promise`, mesmo que o corpo pareça síncrono; `await` dentro dela pausa a
execução daquela função (sem travar o resto do programa) até a `Promise` que
segue resolver. Aqui isso garante que `render()` só desenha a tela **depois**
que o arquivo já foi gravado — evitando a UI mostrar um estado que ainda não
está garantidamente salvo.

**Conceito por trás — um único ponto de mutação central.** Nenhuma função
`renderX` chama `salvarEstado` diretamente — todas passam por `persistir()`.
Isso significa que, se um dia for preciso adicionar, por exemplo, um log de
auditoria a cada mudança, ou uma verificação extra antes de salvar, existe
**um único lugar** para adicionar isso, não trinta espalhados pelo arquivo.
É o mesmo princípio de "regra num lugar só" que fez `resumoAno` reusar
`resumoMes` em `calculos.js`, aplicado aqui ao **ato de persistir**, não a um
cálculo.

**Armadilha evitada.** Sem esse ritual único, seria fácil uma função nova
esquecer de chamar `atualizarTopo()` depois de mudar o saldo — e o cabeçalho
ficaria mostrando um número desatualizado até a próxima troca de aba. Centralizar
em `persistir()` torna esse erro estruturalmente impossível: quem quer que
mude `estado` e chame `persistir()` ganha as três etapas de graça.

---

## Bloco 8 — o cabeçalho fixo: `listaMeses`, `atualizarBadge`, `atualizarTopo`

```js
// ---------- topo (meses + saldo) ----------
function listaMeses() {
  const set = new Set(C.mesesComMovimento(estado));
  const anoAtual = new Date().getFullYear();
  for (let m = 1; m <= 12; m += 1) set.add(`${anoAtual}-${String(m).padStart(2, '0')}`);
  set.add(mesAtual);
  return [...set].sort();
}
```

**O que faz.** Monta a lista de meses que aparece no seletor do topo, unindo
três fontes: os meses com movimento real (`C.mesesComMovimento`, ver
`calculos.explicado.md`), todos os 12 meses do ano corrente (mesmo sem
nenhum lançamento ainda), e o mês atualmente selecionado (`mesAtual`).

**Como faz.** `new Set(...)` já parte carregado com os meses reais; o laço
`for` adiciona `"2026-01"` a `"2026-12"` (o `padStart(2, '0')` garante dois
dígitos: `5` vira `"05"`, não `"5"`, preservando o formato `"YYYY-MM"` que
ordena como texto igual a data); `set.add(mesAtual)` garante que o mês
selecionado nunca falte, mesmo que seja de um ano diferente do atual.
`[...set].sort()` — o mesmo combo "`Set` para unir sem duplicata, spread para
virar array, `sort()` de texto que já é ordem cronológica" visto em
`calculos.explicado.md`.

**Conceito por trás — por que unir três fontes em vez de só usar
`mesesComMovimento`?** O resultado garante duas coisas ao mesmo tempo: o
seletor sempre mostra o **ano inteiro** (mesmo em janeiro, sem dado ainda —
você não fica sem poder escolher fevereiro só porque ainda não lançou nada
nele), mas também **nunca esconde** um mês de outro ano onde você já lançou
algo (um extrato importado de dezembro de 2025, por exemplo). Sem a união,
qualquer uma das duas fontes sozinha deixaria de cobrir um desses casos.

```js
function atualizarBadge() {
  const n = C.totalARevisar(estado);
  const b = $('#badgeRevisar');
  b.textContent = n ? String(n) : '';
  b.style.display = n ? '' : 'none';
}
```

**O que faz.** Lê quantos lançamentos ainda esperam categorização
(`C.totalARevisar`, ver `revisar.explicado.md`) e atualiza o número no badge
do botão "Revisar" da barra de abas.

**Sintaxe — `n ? String(n) : ''` e `n ? '' : 'none'`.** Dois usos do
ternário sobre a mesma condição (`n`, truthy se maior que zero), com efeitos
opostos: se há algo a revisar, mostra o número (`String(n)` converte `3` para
`"3"`, porque `textContent` espera string) e garante que o badge **não** está
escondido (`display: ''` remove qualquer `display: none` inline anterior); se
não há nada, o texto fica vazio e o badge é escondido (`display: 'none'`).

```js
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
```

**O que faz.** Reconstrói o `<select>` de meses do zero (`innerHTML = ''`,
depois uma `<option>` por mês de `listaMeses()`, usando o mesmo spread
condicional do Bloco 5 para marcar `selected` no mês atual), chama
`atualizarBadge()`, e atualiza a "pílula" de saldo no topo (texto formatado
em reais, cor verde ou vermelha conforme o sinal).

**Sintaxe — `saldo >= 0 ? 'var(--pos)' : 'var(--neg)'`.** `var(--pos)` e
`var(--neg)` são **variáveis CSS customizadas** (definidas em `app.css`);
atribuir uma string assim a `style.color` funciona porque o CSS resolve
`var(--pos)` no momento em que o navegador aplica o estilo — o JavaScript só
precisa escrever o nome da variável, não o valor de cor final.

**Conceito por trás — por que o cabeçalho não é redesenhado por `render()`?**
Repare que `#tabs`, `#mesSelect` e `#saldoPill` (ver `index.html.explicado.md`)
**não estão dentro** de `#view`. `render()` (Bloco 9, a seguir) só reescreve
`#view`; o cabeçalho é atualizado à parte, por `atualizarTopo()`/
`atualizarBadge()`, que fazem **patches cirúrgicos** (trocar `textContent`,
alternar `style.display`) em vez de recriar tudo. O app inteiro usa duas
estratégias de atualização lado a lado: **reconstrução total** para o
conteúdo de cada aba, **patch pontual** para o chrome fixo que persiste entre
trocas de aba. Essa tensão volta a aparecer nas Partes 3 e 4.

---

## Bloco 9 — `render`, o roteador

```js
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
```

**O que faz.** Apaga o conteúdo de `#view` e chama a função `renderX`
correspondente à aba atual (`tabAtual`), passando o próprio elemento `v` para
ela preencher.

**Sintaxe — objeto literal como tabela de despacho.** Em vez de uma cadeia
`if (tabAtual === 'dashboard') renderDashboard(v); else if (tabAtual ===
'lancamentos') renderLancar(v); else if (...)`, um objeto mapeia cada valor
possível de `tabAtual` (uma string) direto para a função correspondente.
`{...}[tabAtual]` busca a função pela chave — uma operação O(1), equivalente
a uma tabela hash — e `|| renderDashboard` cobre o caso em que `tabAtual` não
bate com nenhuma chave (uma aba desconhecida nunca quebra o app, só volta
para o Início). Repare nos parênteses envolvendo o objeto inteiro: `({...}[tabAtual]
|| renderDashboard)(v)` — são necessários porque, sem eles, o motor de
JavaScript interpretaria `{` no início da instrução como abertura de **bloco de
código**, não como início de objeto literal; envolver tudo em `(...)` força a
leitura como expressão.

**Conceito por trás — "dado como configuração", aplicado a roteamento.** É a
mesma ideia de tabela associando chave a comportamento que aparece em
`regras.js` (lista de padrão→categoria) e em `rotuloTipo` (Bloco 6) — aqui
usada para decidir **qual tela desenhar**, em vez de qual categoria aplicar
ou qual rótulo mostrar. Sempre que você reconhecer "preciso de um `if/else`
longo comparando a mesma variável contra valores fixos", esse é o padrão que
substitui.

**Conceito por trás — `v.innerHTML = ''`, a estratégia de "sem estado,
reconstrua tudo".** Não há DOM virtual, não há diffing: toda troca de aba
(ou de mês, ou qualquer mutação que chame `persistir()`) apaga `#view`
inteiro e cada `renderX` desenha do zero a partir do `estado` atual. Mais
simples de raciocinar — a tela é sempre uma **função pura** do `estado` e do
`tabAtual`/`mesAtual` correntes, sem histórico escondido — mas com um custo
real: **qualquer estado que more só no DOM** (foco de um campo de texto,
posição de scroll, o que o usuário estava digitando) se perde a cada
`render()`. As Partes 3 e 4 mostram dois jeitos diferentes que o código lida
com essa perda: uma restaurando o foco manualmente depois de salvar, outra
evitando o `render()` completo de propósito para não interromper o
preenchimento de um formulário.

**Alternativa e trade-off.** Um framework com DOM virtual (React, Vue)
recalcularia **o que mudou** e tocaria só essas partes, preservando foco e
scroll automaticamente. A troca aqui é: sem essa infraestrutura, o código
fica mais simples de escrever e não precisa de build step (coerente com "roda
direto do pendrive"), mas empurra para quem escreve cada tela a
responsabilidade de perceber "isto vai perder o foco do usuário" e decidir se
vale a pena um patch cirúrgico em vez do `render()` padrão.

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Import de namespace (`import * as C`)** | Bloco 1 | toda chamada ao núcleo se autodocumenta como `C.algo`, sem lista de imports para manter |
| **Escopo de módulo / variáveis `let` de topo** | Bloco 2 | vivem a sessão inteira, visíveis a todas as funções do arquivo |
| **Estado persistente vs. transiente** | Bloco 2 | só o que precisa sobreviver ao fechar o app (`estado`) vai pro disco |
| **Hyperscript (`el`)** | Bloco 4 | construir árvore de DOM com chamadas de função, sem template engine |
| **Destructuring de par `[k, v]`** | Bloco 4 | `for (const [k, v] of Object.entries(props))` desmonta cada par direto |
| **Duck typing (`c.nodeType`)** | Bloco 4 | pergunta "tem essa propriedade?" em vez de `instanceof` |
| **Spread condicional (`...(cond ? {...} : {})`)** | Bloco 5 | adiciona uma propriedade a um objeto só sob condição, numa linha |
| **Função como slot de memória (`toast._t`)** | Bloco 5 | funções são objetos; guardam propriedade sem variável de módulo extra |
| **`.find(...) \|\| {}`, objeto vazio de reserva** | Bloco 6 | evita `TypeError` ao acessar propriedade de um resultado que pode não existir |
| **Objeto como tabela de tradução/despacho** | Blocos 6, 9 | `{chave: valor}[x] \|\| padrão` substitui cadeias de `if/else` |
| **Ritual único pós-mutação (`persistir`)** | Bloco 7 | salvar → atualizar topo → redesenhar, sempre nesta ordem, nunca duplicado |
| **`async`/`await`** | Bloco 7 | pausa a função (não o programa) até a `Promise` resolver |
| **Chrome fora de `#view`: patch vs. rebuild** | Bloco 8 | cabeçalho sobrevive a `render()`; conteúdo da aba não |
| **Reconstruir tudo é o padrão, não a regra absoluta** | Bloco 9 | `v.innerHTML = ''` é simples, mas perde foco/scroll — Partes 3 e 4 escapam disso de propósito |

---

**Navegação:** ← anterior: [`app.explicado.md`](./app.explicado.md) (índice) · próxima: [Parte 2 — Início](./app.parte2.explicado.md) →
