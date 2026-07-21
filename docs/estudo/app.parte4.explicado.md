# `src/ui/app.js` — Parte 4: Importar e Revisar (`renderImportar`, `renderRevisar`)

> **O que é esta parte:** as linhas 448–611 de `app.js` — as duas telas do
> fluxo de extrato bancário: `renderImportar` (ler o arquivo do banco,
> mostrar uma pré-visualização, deixar o usuário confirmar) e `renderRevisar`
> (resolver em lote o que sobrou sem categoria, de importações passadas ou
> lançamentos antigos). É aqui que a distinção "estado persistente vs.
> transiente", anunciada na Parte 1, tem sua consequência prática mais
> visível: ler um arquivo **não** grava nada até o usuário confirmar.
>
> **Papel na arquitetura:** a UI do fim de um pipeline de três arquivos do
> núcleo — `regras.js` (que categoria é isto?) → `importar.js` (ler o arquivo
> do banco) → `revisar.js` (resolver em lote o que sobrou). Esta parte não
> reimplementa nenhuma dessas regras; ela só monta formulário em cima do que
> o núcleo já decidiu.
>
> **Pré-requisitos:** [Parte 1](./app.parte1.explicado.md) (helpers `el`,
> `opts`, `field`, `toast`, a variável transiente `candidatos`, e a distinção
> `render()`/`persistir()`), [Parte 3](./app.parte3.explicado.md) (o idioma de
> tabela + linha + closure, já nomeado, reusado aqui sem repetir a
> explicação), [`importar.explicado.md`](./importar.explicado.md)
> (`parseExtrato`, `prepararImportacao`, `resumoImportacao`,
> `importarTransacoes`) e [`revisar.explicado.md`](./revisar.explicado.md)
> (`gruposParaRevisar`, `categorizarLote`, a distinção "nomeado" vs. "não
> nomeado").

---

## Bloco 1 — abertura de `renderImportar` e o card de introdução

```js
// ---------- Importar extrato ----------
function renderImportar(v) {
  v.append(el('h2', {}, 'Importar extrato'));

  const intro = el('div', { class: 'card' }, [
    el('h3', {}, 'Traga os gastos do banco'),
    el('p', { class: 'muted' }, 'Baixe o extrato da conta ou a fatura do cartão no app do banco (.ofx ou .csv) e solte aqui. O Finan lê, sugere a categoria de cada lançamento e ignora o que já existe. Nada entra sem você confirmar — e nenhum dado sai daqui.'),
  ]);

```

**O que faz.** Escreve o título da tela e monta o primeiro card, puramente
explicativo — sem nenhum campo ainda. O texto do parágrafo é, na prática, a
declaração de privacidade e de segurança do fluxo inteiro: "nada entra sem
você confirmar" (o mecanismo de `candidatos` como pré-visualização) e "nenhum
dado sai daqui" (o app é offline — não há upload nenhum do extrato para
lugar nenhum, ver `CLAUDE.md`: "app de finanças pessoais offline").

**Conceito por trás — o texto da UI como parte do contrato de confiança do
produto.** Um app de finanças pessoais lida com o dado mais sensível que
existe (extrato bancário completo). Esse parágrafo não é só instrução de uso
— é a UI comunicando explicitamente as duas garantias que tornam seguro
soltar um arquivo do banco ali: revisão antes de confirmar, e nenhuma
transmissão de dado para fora da máquina.

---

## Bloco 2 — o input de arquivo e o parser

```js
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

```

**O que faz.** Cria o `<input type="file">` (restrito a `.ofx`, `.csv`,
`.txt` via `accept`) e escuta o evento `change` (disparado quando o usuário
escolhe um arquivo). Lê o conteúdo como texto, manda para o parser do núcleo
(`C.parseExtrato`), e conforme o resultado: se não achou nada, limpa
`candidatos` e avisa; se achou, prepara a pré-visualização
(`C.prepararImportacao`) e avisa quantos lançamentos foram lidos. Qualquer
erro na leitura ou no parse cai no `catch` e vira um toast com a mensagem
específica.

**Sintaxe — `await f.text()`, ler um arquivo escolhido pelo usuário como
texto.** `arquivo.files[0]` é um objeto `File` (API de arquivos do
navegador); `.text()` é um método assíncrono que devolve uma `Promise` com o
conteúdo inteiro do arquivo como string. Não existe leitura síncrona de
arquivo local no navegador (por design — travaria a aba num arquivo grande),
então `await` é obrigatório aqui.

**`render()`, não `persistir()` — a distinção mais importante desta tela.**
Ler um arquivo só preenche a **pré-visualização** (`candidatos`, a variável
transiente declarada na Parte 1, Bloco 2); nada foi decidido ainda, então
nada deve ir para o disco. `render()` sozinho já basta para mostrar a tabela
de revisão (Bloco 5, adiante) — chamar `persistir()` aqui salvaria um estado
que o usuário **nem confirmou ainda**. É a consequência prática, finalmente
visível em código, da distinção "estado persistente vs. transiente" que a
Parte 1 só descreveu em teoria.

**Erro exposto ao usuário, ao contrário de `carregarEstado` (boot do app, ver
`storage.explicado.md`), que engole qualquer erro de leitura
silenciosamente.** Aqui o `catch` faz o oposto — mostra `err.message` direto
num toast. A diferença de filosofia faz sentido pelo contexto: `carregarEstado`
roda no **boot do app** (silencioso = não travar a inicialização se o
`dados.json` estiver corrompido); este `catch` roda **em resposta a uma ação
que o usuário acabou de tomar** (escolher um arquivo) — ele está olhando para
a tela esperando um resultado, então o erro específico precisa aparecer, ou
o usuário ficaria sem entender por que nada aconteceu.

---

## Bloco 3 — anexando o input e a guarda de saída antecipada

```js
  intro.append(el('div', { class: 'form-row' }, [field('Arquivo do banco', arquivo)]));
  v.append(intro);

  if (!candidatos) return;

```

**O que faz.** Anexa o campo de arquivo ao card de introdução (embrulhado em
`field`, o átomo rótulo+input da Parte 1), anexa o card à view, e — se não
houver `candidatos` (nem arquivo escolhido ainda, nem depois de um "Cancelar"
do Bloco 8, nem depois de um arquivo sem lançamentos) — a função **para
aqui**, sem desenhar tabela nenhuma.

**Sintaxe — `if (!candidatos) return`, guarda de função inteira, não só de um
bloco.** Diferente das guardas vistas nas Partes 2–3 (que saem de uma
função menor, como `heroDelta` ou `salvar`), esta guarda está no **meio** de
`renderImportar`: tudo que vem antes (o card de introdução) sempre é
mostrado; tudo que vem depois (Blocos 4–8, a tabela de revisão inteira) só
roda se `candidatos` existir. É um padrão de "renderização condicional de uma
seção inteira da tela", equivalente a envolver o resto da função num `if
(candidatos) { ...resto... }`, mas sem precisar de mais um nível de
indentação.

---

## Bloco 4 — o resumo e o cabeçalho da tabela de revisão

```js
  const res = C.resumoImportacao(candidatos);
  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, 'Revisar antes de importar'));
  card.append(el('div', { class: 'muted', style: 'margin-bottom:10px' },
    `${res.total} lançamentos · ${res.reconhecidos} categorizados automaticamente · ${res.duplicados} já existem (desmarcados)`));

  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['', 'Data', 'Descrição', 'Categoria', 'Classif.', 'Valor'].map((c) => el('th', c === 'Valor' ? { class: 'num' } : {}, c)))));
  const tbody = el('tbody');

```

**O que faz.** Chama `C.resumoImportacao(candidatos)` para obter três
contagens (total, reconhecidos automaticamente, duplicados) e as mostra numa
linha de texto acima da tabela. Depois monta o cabeçalho da tabela: seis
colunas, a primeira sem nome (`''`, vai receber o checkbox de cada linha) e a
última (`'Valor'`) com a classe `'num'` para alinhamento numérico — o mesmo
idioma de cabeçalho já visto na Parte 3 (Bloco 9).

**Conceito por trás — o resumo numérico antes de qualquer linha, orientando a
decisão do usuário.** Ver "40 lançamentos, 32 categorizados automaticamente, 5
já existem" antes de rolar a tabela inteira dá ao usuário uma visão geral
imediata de quanto trabalho manual vai precisar (os 8 que não foram
reconhecidos automaticamente) sem precisar ler linha por linha primeiro.
`res.duplicados` já avisa que 5 linhas vêm **desmarcadas** por padrão — o
comportamento de fato (Bloco 5) confirma isso.

---

## Bloco 5 — uma linha de candidato: checkbox, categoria, classificação

```js
  candidatos.forEach((c, i) => {
    const check = el('input', { type: 'checkbox', ...(c.importar ? { checked: '' } : {}) });
    check.addEventListener('change', () => { candidatos[i].importar = check.checked; atualizarBotao(); });

    const cat = opts(el('select'), [...new Set([...estado.config.categorias, c.categoria].filter(Boolean))], c.categoria);
    cat.addEventListener('change', () => { candidatos[i].categoria = cat.value; });

    const cls = opts(el('select'), ['', ...estado.config.classificacoes], c.classificacao);
    cls.addEventListener('change', () => { candidatos[i].classificacao = cls.value; });

```

**O que faz.** Para cada candidato (`c`, no índice `i` da lista
`candidatos`), monta três controles interativos: um checkbox de
"importar este?" (já vem marcado ou não conforme `c.importar`, decidido pelo
núcleo em `prepararImportacao` — duplicados provavelmente nascem
desmarcados), um `<select>` de categoria, e um `<select>` de classificação.
Cada um tem um listener que **escreve de volta** no objeto `candidatos[i]`
correspondente quando o usuário interage.

**Sintaxe — `candidatos.forEach((c, i) => {...})`, o segundo parâmetro de
`forEach`.** `Array.forEach` sempre passa o item e, como segundo argumento
opcional, o **índice** dele na lista. Aqui o índice é necessário porque os
handlers de `change` precisam escrever de volta em `candidatos[i]`
especificamente — `c` sozinho (a cópia do item capturada pela closure) não
seria suficiente para **mutar** o array original pelo índice certo.

**Mutação direta do array, sem `render()` a cada clique.** Marcar/desmarcar
um checkbox ou trocar uma categoria muda `candidatos[i]` **no lugar**
(`candidatos[i].importar = check.checked`), e só atualiza o botão
(`atualizarBotao()`, Bloco 7, um patch pontual de texto/`disabled`) — não a
tabela inteira. Com potencialmente centenas de linhas de extrato,
reconstruir a tabela inteira a cada clique seria caro e perderia o foco
atual do usuário (o mesmo problema de `render()` completo discutido desde a
Parte 1); mutar o objeto e deixar a tabela como está resolve isso. É a
terceira ocorrência da tensão "reconstruir tudo vs. patch cirúrgico" (depois
do cabeçalho fixo na Parte 1 e da visibilidade de campos na Parte 3).

**`[...new Set([...estado.config.categorias, c.categoria].filter(Boolean))]`
— por que a categoria sugerida entra na lista do `<select>` mesmo que não
exista ainda em `config.categorias`.** Sem isso, uma categoria detectada pelo
extrato (`c.categoria`, sugerida por `C.categorizar` dentro de
`prepararImportacao`) mas ainda não cadastrada em Config ficaria de fora das
opções do dropdown — o `<select>` mostraria `c.categoria` como valor
selecionado, mas sem uma `<option>` correspondente, o que a maioria dos
navegadores trata mostrando em branco ou a primeira opção, não o valor
pretendido. A expressão resolve isso em três passos: `[...estado.config.categorias,
c.categoria]` junta as categorias cadastradas com a sugerida; `new Set(...)`
remove duplicata (caso `c.categoria` já exista na lista); `.filter(Boolean)`
descarta valores vazios (`''`/`null`/`undefined`, quando a transação ainda
não tem categoria sugerida); e o spread externo `[...]` converte o `Set` de
volta para array, que é o que `opts` espera.

---

## Bloco 6 — a linha da tabela

```js
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

```

**O que faz.** Monta a linha (`<tr>`) com os controles do Bloco 5 mais duas
colunas de texto (data, valor). A linha inteira ganha a classe `'dup'` se o
lançamento for duplicado — provavelmente esmaecendo visualmente a linha via
CSS (ver `app.css.explicado.md`).

**Sintaxe — ternário aninhado de três vias:** `c.duplicado ? el(...) :
(c.reconhecido ? null : el(...))`. Três estados possíveis para a célula de
descrição: **duplicado** (mostra a tag "já existe"), **reconhecido** (nenhuma
tag extra — a categoria já veio certa), **não reconhecido** (mostra a tag
"sem regra", avisando que a categoria precisou ser adivinhada ou ficou
vazia). É o mesmo padrão de "decisão em cascata, primeiro caso que bate
vence" já visto em `regras.js` (a primeira regra que casa vence) e em
`faixaScore` (`score.explicado.md`), aqui expresso como ternário aninhado em
vez de uma escada de `if`.

**Conceito por trás — o array de dois elementos como filho de uma `<td>`.**
`el('td', {}, [el('div', ...), condição ? el(...) : null])` — a célula de
descrição tem **dois** filhos possíveis: o texto da descrição sempre, e a
tag de status condicionalmente. `el` (Parte 1) já lida com isso via
`[].concat(children)` e `if (c == null) continue` — o padrão "array de
filhos com alguns `null`" reaparece aqui pela enésima vez no arquivo,
consistente com todas as partes anteriores.

**Fechamento do laço e montagem da tabela.** `table.append(tbody)` insere
todas as linhas de uma vez (o `<tbody>` já estava sendo populado dentro do
`forEach`); `card.append(...)` embrulha a tabela num `<div class="table-wrap">`
(scroll horizontal em telas estreitas, mesmo padrão da Parte 3).

---

## Bloco 7 — o botão de confirmar e `atualizarBotao`

```js
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

```

**O que faz.** `botao` é o botão de confirmação: ao clicar, conta quantos
candidatos estão marcados para importar, valida que há pelo menos um, chama
`C.importarTransacoes` (a operação de núcleo que de fato grava as
transações escolhidas — só agora, pela primeira vez em toda a tela, algo é
persistido), limpa `candidatos` (a pré-visualização não faz mais sentido
depois de confirmada), troca para a aba "Lançar" **programaticamente**, e só
então `persistir()` + toast. `atualizarBotao` é uma função auxiliar,
declarada logo depois e chamada uma vez de imediato, que sincroniza o texto e
o estado `disabled` do botão com a contagem atual de selecionados.

**Sintaxe — `` `Importar ${n} selecionado${n === 1 ? '' : 's'}` ``, plural
condicional dentro de um template literal.** Em português, "1 selecionado"
mas "2 selecionados" — o `${n === 1 ? '' : 's'}` decide se o `s` do plural
aparece, no fim da mesma string interpolada. É um pequeno detalhe de i18n
tratado manualmente, o mesmo espírito do `.toFixed(1).replace('.', ',')` da
Parte 2.

**Como essa troca de aba não veio de um clique real no botão da barra, o
listener de clique de `init()` (fora desta mirror) nunca dispara sozinho —
por isso esta linha assume manualmente o trabalho de marcar `.active` no
botão certo.** `tabAtual = 'lancamentos'` muda a variável de módulo, mas o
efeito visual de "qual botão da barra de abas está destacado" normalmente é
responsabilidade de um listener de clique preso em `#tabs` (que, ao clicar de
verdade, já alterna a classe `active`). Como aqui a troca de aba é disparada
por código, não por um clique real do usuário na barra, esse listener nunca
roda — então o código precisa fazer manualmente o que o listener faria:
`[...$('#tabs').children].forEach((b) => b.classList.toggle('active', b.dataset.tab
=== 'lancamentos'))` percorre todos os botões da barra e marca como ativo só
aquele cujo `data-tab` é `'lancamentos'`.

**Sintaxe — `[...$('#tabs').children]`, converter uma `HTMLCollection` para
array.** `.children` de um elemento devolve uma `HTMLCollection` — uma lista
"viva" de elementos, mas **sem** os métodos de array como `.forEach`. O
spread `[...algo]` funciona em qualquer objeto **iterável** (arrays, `Set`,
`Map`, `NodeList`, `HTMLCollection`...) e produz um array de verdade,
liberando o uso de `.forEach`, `.map`, etc.

**Sintaxe — `b.dataset.tab`, acessar um atributo `data-*`.** Um botão como
`<button data-tab="lancamentos">` expõe esse atributo customizado via
`b.dataset.tab` (o prefixo `data-` é removido, e `tab` vira a chave em
camelCase se o atributo tivesse hífen, como `data-tab-nome` → `dataset.tabNome`).
É a API padrão do navegador para atributos personalizados em elementos HTML,
usada aqui para identificar qual botão corresponde a qual aba sem depender de
texto visível ou de uma classe CSS.

**Conceito por trás — por que `atualizarBotao` existe como função nomeada,
declarada no meio da função, em vez de inline.** Ela precisa ser chamada de
**dois** lugares: uma vez aqui, imediatamente após ser definida (para o
estado inicial do botão refletir os candidatos já marcados por padrão), e uma
vez a cada `change` de checkbox (Bloco 5, `atualizarBotao()` dentro do
listener). Nomear a função permite esse reuso sem duplicar a lógica de
contagem/texto/disabled em dois lugares.

---

## Bloco 8 — o botão de cancelar e fechamento

```js
  card.append(el('div', { class: 'form-row' }, [
    botao,
    el('button', { class: 'btn ghost', onclick: () => { candidatos = null; render(); } }, 'Cancelar'),
  ]));
  v.append(card);
}
```

**O que faz.** Anexa o botão de confirmar e um segundo botão "Cancelar" (que
descarta a pré-visualização inteira, zerando `candidatos` e chamando
`render()` — de novo, **não** `persistir()`, porque nada precisa ser salvo
ao cancelar algo que nunca foi salvo) à mesma linha, e finalmente anexa o
card completo à view.

**Conceito por trás — `render()` no cancelar, simétrico ao `render()` do
Bloco 2.** Cancelar é, em essência, o mesmo tipo de operação que "ler um
arquivo vazio": muda só o que a tela **mostra** (`candidatos = null`), nunca
o que está **salvo** (`estado`). A simetria entre "ler arquivo" e "cancelar"
— ambos terminando em `render()` puro — reforça visualmente, para quem lê o
código, que estamos inteiramente no território "pré-visualização", e só o
Bloco 7 (o botão "Importar selecionados") cruza a fronteira para
`persistir()`.

---

## Bloco 9 — abertura de `renderRevisar` e os grupos

```js
// ---------- Revisar (o que o banco não nomeou) ----------
// Resolve em LOTE: um grupo = todos os lançamentos pro mesmo destino. Quando o
// destino tem nome, a escolha vira regra e o app nunca mais pergunta.
function renderRevisar(v) {
  const todos = C.gruposParaRevisar(estado);
  const nomeados = todos.filter((g) => g.nomeado);
  const grupos = revisarSoNomeados ? nomeados : todos;
  const total = todos.reduce((a, g) => a + g.n, 0);
  const anonimos = todos.length - nomeados.length;

```

**O que faz.** `renderRevisar` é a segunda tela desta parte: o que fazer com
lançamentos que **já foram importados** mas ficaram sem categoria. Ela pede
ao núcleo (`C.gruposParaRevisar`) a lista de grupos — cada grupo é "todos os
lançamentos para o mesmo destino" (ver `revisar.explicado.md`) — separa os
que têm nome de contraparte identificável (`nomeados`) dos que não têm, e
decide qual lista mostrar (`grupos`) conforme o filtro atual
(`revisarSoNomeados`, a variável de **módulo** declarada na Parte 1). `total`
soma quantos lançamentos individuais existem em todos os grupos (não quantos
grupos — `g.n` é a contagem de itens de cada grupo); `anonimos` é a diferença
entre o total de grupos e os nomeados.

**Sintaxe — `todos.reduce((a, g) => a + g.n, 0)`, somar um campo de uma
lista de objetos.** O mesmo idioma de `somaCent` (`calculos.explicado.md`):
"dobrar" uma lista num valor só, começando em `0` e acumulando `g.n`
(a quantidade de lançamentos daquele grupo) a cada volta.

**`revisarSoNomeados` — o mesmo padrão de "filtro que sobrevive ao render",
mas em escopo de módulo.** Declarada na Parte 1 (Bloco 2), **não** dentro
desta função, `revisarSoNomeados` é alternada por um botão (Bloco 10) e, ao
contrário do `tipo` da Parte 3 (que é local e reseta a cada chamada de
`renderLancar`), **sobrevive** a qualquer `render()` — inclusive troca de mês
ou de aba e volta — porque vive um nível acima, no módulo, não na chamada da
função. Duas variáveis de aparência parecida (uma flag de alternância numa
tela), mas com tempo de vida bem diferente: vale sempre perguntar "esta
variável precisa sobreviver à próxima reconstrução de `#view`?" antes de
decidir onde declará-la — a resposta aqui é "sim", e por isso ela mora na
Parte 1, não dentro de `renderRevisar`.

---

## Bloco 10 — o estado vazio e o filtro

```js
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

```

**O que faz.** Se não houver nenhum grupo pendente (`!todos.length`), mostra
um card de celebração ("Tudo categorizado 🎉") e **sai** da função — nenhuma
tabela, nenhum filtro, nada mais é montado. Caso contrário, monta os dois
botões de filtro ("Dá pra ensinar (N)" / "Todos (N)"), cada rótulo já com a
contagem embutida.

**Sintaxe — `for (const [val, rotulo] of [[true, ...], [false, ...]])`, o
mesmo idioma de destructuring sobre lista de pares da Parte 3 (Bloco 2), só
que aqui `val` é **booleano** (`true`/`false`), não uma string como
`'saida'`/`'entrada'`. `revisarSoNomeados === val` decide qual botão nasce
com a classe `active`.

**Diferença com o filtro de tipo da Parte 3 — este `onclick` chama
`render()` diretamente.** `onclick: () => { revisarSoNomeados = val;
render(); }` — ao contrário do seletor de tipo em `renderLancar` (que evitava
`render()` de propósito para não perder o que o usuário estava digitando),
aqui não há formulário em andamento para preservar: trocar o filtro
legitimamente precisa reconstruir a tabela inteira (o conjunto de grupos
mostrado muda). Não é uma inconsistência com o padrão da Parte 3 — é a
mesma pergunta ("isto perderia algo que o usuário está fazendo?") respondida
de forma diferente, porque o contexto é diferente.

---

## Bloco 11 — as mensagens explicativas do card superior

```js
  v.append(el('div', { class: 'card' }, [
    el('p', { class: 'muted', style: 'margin:0 0 12px' }, `${total} lançamentos sem categoria. Comece de cima: os maiores valores resolvem a maior parte. Quando o extrato traz o nome de quem recebeu, sua escolha vira regra e o app nunca mais pergunta.`),
    anonimos ? el('p', { class: 'muted', style: 'margin:0 0 12px' }, `${anonimos} grupos ficam fora deste filtro porque o banco não registrou quem recebeu (Pix antigos, 2023–2025). Neles dá pra categorizar na mão, mas não vira regra — e jogar todos numa categoria só seria inventar. Em 2026 isso não acontece: todo lançamento tem nome.`) : null,
    filtro,
  ]));

```

**O que faz.** Anexa um card com duas mensagens explicativas (a segunda
condicional, só se `anonimos > 0`) e o filtro montado no Bloco 10.

**Conceito por trás — "comece de cima: os maiores valores resolvem a maior
parte".** Essa frase entrega uma dica de **estratégia** ao usuário, não só
informação: como os grupos vêm ordenados (presumivelmente por valor total
decrescente — ver `revisar.explicado.md` para a ordenação exata),
categorizar as primeiras linhas da tabela resolve desproporcionalmente mais
do dinheiro total do que categorizar as últimas (o clássico princípio 80/20
aplicado a extrato bancário: poucos destinos concentram a maior parte do
valor movimentado).

**A segunda mensagem explica por que alguns grupos existem fora do controle
do usuário.** "O banco não registrou quem recebeu (Pix antigos, 2023–2025)... Em
2026 isso não acontece: todo lançamento tem nome" — é uma nota sobre a
**qualidade do dado de origem** mudando ao longo do tempo (o banco passou a
identificar melhor as contrapartes de Pix), não uma limitação do app. Isso
evita o usuário achar que o app "falhou" em reconhecer esses lançamentos — a
limitação é do dado de entrada, documentada aqui para gerenciar a expectativa.

---

## Bloco 12 — a tabela de grupos: cabeçalho e o laço

```js
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

```

**O que faz.** Monta o cabeçalho da tabela (cinco colunas com nome, mais uma
sem nome para o botão) e começa o laço sobre os primeiros 40 grupos
(`grupos.slice(0, 40)` — um **limite deliberado**, ver Bloco 13). Para cada
grupo, cria um `<select>` de categoria e um de classificação **vazios por
padrão** (`['', ...lista]`, sem sugestão pré-selecionada — diferente da
Parte 3, aqui o núcleo não tenta adivinhar, porque estes são exatamente os
casos em que **nenhuma** regra bateu), e um botão "Aplicar (N)" cujo
`onclick` valida que uma categoria foi escolhida e chama
`C.categorizarLote`.

**Sintaxe — `grupos.slice(0, 40)`.** `Array.slice(0, 40)` devolve os
primeiros 40 itens sem alterar o array original — diferente de
`Array.splice`, que mutaria `grupos` removendo os itens. A escolha de
`slice` aqui é a correta: `grupos` ainda é usado depois (Bloco 13, para
saber se há mais de 40 no total).

**`C.categorizarLote(estado, g.ids, cat.value, cls.value, g.nomeado ?
g.chave : null)` — o quinto argumento é a decisão de negócio mais importante
desta tela.** Repare no comentário logo acima: "só vira regra se o extrato
nomeia quem recebeu". O quinto parâmetro de `categorizarLote` (aparentemente
"o padrão que deve virar regra, ou `null` se não deve virar regra nenhuma")
recebe `g.chave` **apenas** se `g.nomeado` for verdadeiro; caso contrário,
`null` — o núcleo aplica a categoria só àqueles lançamentos específicos
(`g.ids`), sem criar uma regra permanente. Essa é a mesma distinção central
de `revisar.js`: aplicar uma categoria a "PAGAMENTO PIX SICREDI" (sem nome de
contraparte) uma vez é seguro; transformar isso numa regra permanente
carimbaria **todo** Pix futuro com a mesma categoria, o que seria um erro
sistemático.

---

## Bloco 13 — construindo cada linha de grupo

```js
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
```

**O que faz.** Monta a linha: uma célula com três informações empilhadas
(`g.chave` em negrito — o destino identificado; `g.exemplo` — um exemplo real
de descrição bruta daquele grupo, truncado; e uma tag indicando se vira regra
ou não), mais quantidade, total (formatado e colorido), e os três controles
já montados no Bloco 12. No fim do laço, monta a tabela completa e, **se
houver mais de 40 grupos no total**, avisa quantos ficaram de fora.

**Sintaxe — `g.exemplo.slice(0, 58)`, truncar texto por tamanho fixo de
caracteres.** Diferente dos usos de `.slice` vistos até agora (sempre sobre
datas, posições fixas conhecidas), aqui é um truncamento de **exibição**:
`g.exemplo` pode ser uma descrição bancária longa; cortar em 58 caracteres
evita que uma linha de tabela estoure a largura da coluna. É uma decisão de
layout, não de dado — o valor completo continua em `g.exemplo`, só a
apresentação é cortada.

**`title: 'O extrato não diz quem recebeu...'`, um atributo `title` como
tooltip explicativo.** O atributo HTML `title` faz o navegador mostrar um
balão de texto ao passar o mouse sobre o elemento — aqui usado para explicar,
só para quem quiser mais detalhe, por que aquele grupo específico não pode
virar regra. É uma forma de **documentação em camadas**: a tag visível já diz
"sem nome no extrato"; o tooltip, disponível sob demanda, explica o
porquê — sem poluir a tela com um parágrafo de texto por linha.

**Conceito por trás — o limite de 40 linhas é uma decisão de UX, não uma
limitação técnica.** Mostrar todos os grupos de uma vez (que podem ser
centenas, num histórico bancário de anos) tornaria a tela lenta de rolar e
diluiria a atenção. Limitar a 40 e mostrar "Resolva estes e os próximos
sobem" transforma a tarefa em um **fluxo iterativo**: resolver os 40 maiores
faz os próximos 40 (por valor) aparecerem na próxima vez que a tela
renderizar — coerente com a dica já dada no Bloco 11 ("os maiores valores
resolvem a maior parte").

**Fechamento — a última linha desta parte já pertence à próxima seção do
arquivo.** O comentário `// ---------- Cartões (cadastro + faturas + parcelas)
----------`, que fecha o intervalo de linhas coberto por esta mirror (448–611),
é o cabeçalho de `renderCartoes` — a próxima função do arquivo, cujo corpo
começa logo após e é objeto da Parte 5 (`app.parte5.explicado.md`).

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Texto de UI como parte do contrato de confiança** | Bloco 1 | o parágrafo de introdução declara as garantias de privacidade do fluxo |
| **`f.text()` assíncrono** | Bloco 2 | ler arquivo local do usuário sempre devolve uma `Promise`, nunca é síncrono |
| **`render()` sem `persistir()`** | Blocos 2, 8 | pré-visualização é só tela; nada é salvo até o usuário confirmar |
| **Erro silencioso (boot) vs. erro visível (ação do usuário)** | Bloco 2 | a mesma situação (exceção) pede tratamento oposto conforme o contexto |
| **Guarda de seção inteira (`if (!candidatos) return`)** | Bloco 3 | renderiza uma parte da tela condicionalmente sem indentar o resto |
| **Segundo parâmetro de `forEach` (índice)** | Bloco 5 | necessário para mutar o array original pela posição certa |
| **Mutação direta + patch pontual, não `render()` a cada clique** | Bloco 5 | tabela grande não pode reconstruir tudo a cada interação |
| **Sugestão fora da lista oficial precisa ser injetada nas opções** | Bloco 5 | `[...cadastradas, sugerida]` evita um `<select>` com valor sem `<option>` |
| **Troca de aba programática exige replicar o efeito visual do clique** | Bloco 7 | sem clique real, ninguém marca `.active` sozinho — o código assume esse trabalho |
| **`[...HTMLCollection]`** | Bloco 7 | spread converte coleções "vivas" do DOM em array de verdade |
| **`dataset.tab`** | Bloco 7 | API padrão para ler atributos `data-*` customizados |
| **Filtro que sobrevive ao render vive no módulo, não na função** | Bloco 9 | `revisarSoNomeados` é de módulo (Parte 1); `tipo` da Parte 3 é local — tempos de vida diferentes por necessidade diferente |
| **A mesma decisão ("perderia algo em andamento?") responde diferente conforme o contexto** | Bloco 10 | filtro de Revisar chama `render()` direto; seletor de tipo de Lançar evita, por não haver nada para preservar aqui |
| **Regra só nasce quando o dado de origem permite** | Bloco 12 | quinto argumento de `categorizarLote` é `null` sempre que o extrato não nomeia a contraparte |
| **Truncamento de exibição ≠ truncamento de dado** | Bloco 13 | `.slice` por layout corta só o que aparece; o valor completo continua guardado |
| **Paginação como fluxo iterativo, não limitação técnica** | Bloco 13 | 40 por vez transforma "resolver tudo" em passos administráveis, guiados por valor |

---

**Navegação:** ← anterior: [Parte 3 — Lançar](./app.parte3.explicado.md) · próxima: [Parte 5 — Cartões](./app.parte5.explicado.md) →
