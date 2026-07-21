# `src/ui/app.js` — Parte 3: Lançar (`renderLancar`)

> **O que é esta parte:** as linhas 324–447 de `app.js` — uma única função,
> `renderLancar`, que desenha a tela de entrada rápida de transações (saída,
> entrada ou compra no cartão) mais a lista de lançamentos do mês logo
> abaixo. É a tela que, segundo o próprio comentário do código, existe para
> resolver "a maior queixa de usabilidade": antes eram três formulários
> repetidos (um por tipo de lançamento); agora é um formulário só, com o tipo
> controlado por um seletor de botões.
>
> **Papel na arquitetura:** é onde o usuário grava dado novo com mais
> frequência no dia a dia. Usa `C.adicionarTransacao`/`C.removerTransacao`
> (a metade "escreve" do núcleo, em `src/core/index.js`) e `C.categorizar`
> (o mesmo motor de regras usado em lote na importação, aqui usado ao vivo,
> campo a campo).
>
> **Pré-requisitos:** [Parte 1](./app.parte1.explicado.md) (helpers `el`,
> `opts`, `field`, `toast`, `hoje`, `persistir`, e a distinção "reconstruir
> tudo vs. patch cirúrgico"), [Parte 2](./app.parte2.explicado.md) (o idioma
> "inputs + botão + closure + `persistir()`", já nomeado e reusado aqui sem
> repetir a explicação), [`regras.explicado.md`](./regras.explicado.md)
> (`categorizar`, o motor por trás da sugestão automática ao sair do campo
> descrição) e [`index.explicado.md`](./index.explicado.md)
> (`adicionarTransacao`, `removerTransacao`, `mesDe`).

---

## Bloco 1 — abertura da função e o estado local `tipo`

```js
// ---------- Lançar ----------
// Um formulário só, com o tipo como botão. Antes eram três blocos repetidos na
// mesma tela — a maior queixa de "complicado de postar conta".
function renderLancar(v) {
  v.append(el('h2', {}, `Lançar — ${C.rotuloMes(mesAtual)}`));

  const wrap = el('div', { class: 'card destaque' });
  let tipo = 'saida'; // o que mais se lança no dia a dia

```

**O que faz.** O comentário acima da função conta a motivação de design: três
telas separadas (uma por tipo de lançamento) viraram uma só, com `tipo` como
uma variável que alterna qual conjunto de campos aparece. `v.append(el('h2',
...))` escreve o título com o mês por extenso (`C.rotuloMes`); `wrap` é o card
que vai conter o formulário inteiro; `tipo` começa em `'saida'` porque, no
dia a dia, gastar é o lançamento mais comum (o comentário deixa essa escolha
explícita, não é arbitrária).

**Sintaxe — `let tipo`, estado local à função, não de módulo.** Diferente de
`estado`/`mesAtual`/`tabAtual` (Parte 1, Bloco 2), `tipo` é declarada **dentro**
de `renderLancar` — ela só precisa sobreviver **enquanto esta chamada de
`renderLancar` estiver na tela**, não faz sentido persistir nem sobreviver a
uma troca de aba. Cada vez que `render()` chama `renderLancar(v)` de novo (ao
trocar de mês, por exemplo), uma **nova** variável `tipo` nasce, resetada para
`'saida'` — a anterior simplesmente deixa de existir.

**Conceito por trás — três tempos de vida de estado, três lugares para
declarar.** É a categoria de estado que fica **de fora** tanto do `estado`
global (persistente) quanto das variáveis de módulo (sobrevivem à sessão
inteira, mas não ao `render()`... na verdade sobrevivem até a `tabAtual`
essas sim sobrevivem a `render()`): uma variável comum de função, capturada
por **closure** pelos handlers dos botões de tipo (Bloco 2) — ela vive e
morre junto com esta chamada específica de `renderLancar`. Vale sempre
perguntar, ao decidir onde declarar uma variável nova neste arquivo: "isto
precisa sobreviver ao fechar o app? à próxima troca de aba? só a este
`render()` específico?" — a resposta aponta, respectivamente, para `estado`,
para uma variável de módulo, ou para uma variável local como `tipo`.

---

## Bloco 2 — o seletor de tipo (Saída / Entrada / Cartão)

```js
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

```

**O que faz.** Cria três botões (Saída, Entrada, Cartão) a partir de uma
lista de pares `[valor-interno, rótulo-visual]`, guarda cada botão no objeto
`botoes` (indexado pelo valor interno) e anexa todos ao `seletor`.

**Sintaxe — `for (const [t, rotulo] of [['saida', '− Saída'], ...])`,
destructuring dentro de um laço sobre uma lista de pares.** Cada item da
lista externa é um array de dois elementos (`['saida', '− Saída']`); `[t,
rotulo]` desmonta esse par em duas variáveis a cada volta do laço — a mesma
técnica de `for (const [k, v] of Object.entries(props))` vista em `el`
(Parte 1), aqui sobre um array literal escrito à mão em vez de
`Object.entries`.

**Sintaxe — `botoes[t] = ...`, acesso a objeto por chave computada.**
`t` é uma variável (`'saida'`, `'entrada'`, `'cartao'`); `botoes[t]` escreve
numa propriedade cujo **nome vem do valor de uma variável**, equivalente a
`botoes.saida = ...` na primeira volta, `botoes.entrada = ...` na segunda.
Isso é o que permite, no `onclick`, `Object.entries(botoes).forEach(([k, b])
=> ...)` percorrer os três botões genericamente, sem escrever `botoesSaida`,
`botoesEntrada`, `botoesCartao` como três variáveis separadas.

**Aqui o código escapa de propósito da estratégia "sempre `render()`
inteiro" (Parte 1, Bloco 9).** Trocar o tipo **não** chama `render()` — só
alterna classes e `style.display` nos elementos que já existem na tela:
`Object.entries(botoes).forEach(([k, b]) => b.classList.toggle('active', k
=== tipo))` tira a classe `active` de todos os botões e a coloca só no que
foi clicado; `wrap.classList.toggle('is-cartao', tipo === 'cartao')` marca o
card inteiro (o CSS provavelmente usa essa classe para ajustar o layout);
`camposCartao.style.display`/`campoForma.style.display` mostram um bloco de
campos e escondem o outro, alternadamente.

**Conceito por trás — por que não simplesmente chamar `render()` aqui?** Se
trocar o tipo chamasse `render()`, a tela inteira seria reconstruída (Parte
1, Bloco 9: `v.innerHTML = ''`) e **tudo que o usuário já tinha digitado**
(valor, descrição, data) seria perdido no meio do preenchimento — trocar de
"Saída" para "Cartão" depois de já ter escrito a descrição apagaria a
descrição. Esta é a contrapartida prática da observação da Parte 1:
"reconstruir tudo" é a estratégia padrão, mas existem casos onde perder o
DOM atual custa caro demais ao usuário, e o código deliberadamente faz patch
cirúrgico em vez disso.

**`valor.focus()` no fim do handler.** Depois de trocar o tipo e ajustar a
visibilidade dos campos, o foco volta para o campo de valor — o fluxo
esperado é "escolher o tipo, digitar o valor", então o cursor já espera lá.

---

## Bloco 3 — os campos do formulário

```js
  const valor = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00', class: 'input-valor' });
  const descricao = el('input', { type: 'text', placeholder: 'no que foi?' });
  const categoria = opts(el('select'), estado.config.categorias);
  const data = el('input', { type: 'date', value: hoje() });
  const forma = opts(el('select'), estado.config.formasPagamento);
  const classificacao = opts(el('select'), ['', ...estado.config.classificacoes]);
  const cartaoSel = opts(el('select'), estado.cartoes.map((c) => c.nome));
  const parcelas = el('input', { type: 'number', min: '1', step: '1', value: '1' });

```

**O que faz.** Declara os oito campos de entrada do formulário, cada um numa
constante própria — necessário porque handlers mais abaixo (`descricao.blur`,
o `onclick` de salvar, os `keydown`) precisam **ler `.value`** desses mesmos
elementos por referência direta, não por seletor de DOM.

**Como faz.** `valor` é um `<input type="number">` com `step="0.01"` (aceita
centavos) e `min="0"` (não aceita negativo — o sinal da transação é decidido
pelo `tipo`, não pelo valor digitado). `categoria`, `forma`, `cartaoSel` são
`<select>` preenchidos por `opts(...)` (Parte 1, Bloco 5) a partir das listas
configuráveis em `estado.config` — o que significa que, se o usuário
cadastrar uma categoria nova em Config (fora desta mirror), ela aparece aqui
automaticamente na próxima vez que `renderLancar` rodar.

**Sintaxe — `opts(el('select'), ['', ...estado.config.classificacoes])`.** O
spread `...estado.config.classificacoes` espalha a lista de classificações
(`['Essencial', 'Não essencial']`, tipicamente) dentro de um array literal
que começa com `''` — uma opção vazia na frente, para permitir "nenhuma
classificação escolhida" como estado inicial válido do formulário. O mesmo
padrão `['', ...lista]` aparece de novo em `classificacao` aqui e será
reencontrado na Parte 4 (Importar/Revisar).

**Sintaxe — `estado.cartoes.map((c) => c.nome)`.** Extrai só os nomes dos
cartões cadastrados (`c.nome`), descartando os outros campos de cada objeto
`cartao` (id, cor, etc.) — o `<select>` de cartão só precisa mostrar nomes;
o id correspondente é buscado de volta por nome na hora de salvar (Bloco 6).

---

## Bloco 4 — sugestão automática de categoria

```js
  // digitou a descrição -> as regras já sugerem a categoria (mesmo motor da importação)
  descricao.addEventListener('blur', () => {
    const sug = C.categorizar(descricao.value, estado.config.regras);
    if (!sug) return;
    if (estado.config.categorias.includes(sug.categoria)) categoria.value = sug.categoria;
    if (sug.classificacao) classificacao.value = sug.classificacao;
  });

```

**O que faz.** Ao o usuário **sair** do campo descrição (evento `blur`, não
`input` — não sugere a cada tecla digitada, só quando o campo perde o foco),
chama `C.categorizar` com o texto digitado e as regras do usuário. Se houver
sugestão, preenche `categoria` e `classificacao` automaticamente.

**Sintaxe — o evento `blur`.** Diferente de `input` (dispara a cada
caractere) ou `change` (dispara quando o valor muda **e** o campo perde
foco, em alguns navegadores só para certos tipos de input), `blur` dispara
sempre que o elemento deixa de ser o foco — inclusive clicando em qualquer
outro lugar da página, ou usando Tab. É a escolha certa aqui: categorizar a
cada tecla seria caro e mostraria sugestões incompletas ("ifoo" ainda não é
"ifood"); esperar o campo perder o foco garante que a descrição já está
"pronta" quando a sugestão roda.

**Sintaxe — `if (!sug) return`, saída antecipada (early return).** Se
`categorizar` não encontrar nenhuma regra que bata (devolve algo falsy —
provavelmente `null` ou `undefined`), a função sai imediatamente, sem tentar
acessar `sug.categoria` (o que quebraria com `TypeError` se `sug` fosse
`null`). É o padrão "guarda no topo, resto do código assume o caso feliz" —
evita aninhar o resto da função dentro de um `if (sug) { ... }`.

**Conceito por trás — `estado.config.categorias.includes(sug.categoria)`, uma
segunda guarda antes de aplicar a sugestão.** Mesmo que `categorizar` sugira
uma categoria, o código só a aplica se ela **já existir** na lista de
categorias cadastradas do usuário (`estado.config.categorias`). Isso evita
que uma regra desatualizada (apontando para uma categoria que o usuário
apagou de Config) preencha o campo com um valor que nem aparece nas opções do
`<select>` — o que deixaria o formulário num estado visualmente estranho
(select mostrando uma opção que não está na lista).

**O mesmo motor de `regras.js` usado duas vezes: na importação em lote (Parte
4) e aqui, ao vivo, campo a campo.** Sair do campo descrição já sugere
categoria/classificação — sem duplicar nenhuma regra de negócio, só chamando
`C.categorizar` de novo com os mesmos dados (`estado.config.regras`) que a
importação usa.

---

## Bloco 5 — os campos condicionais (`campoForma`, `camposCartao`)

```js
  const campoForma = field('Forma', forma);
  const camposCartao = el('div', { class: 'campos-cartao', style: 'display:none' }, [
    field('Cartão', cartaoSel), field('Parcelas', parcelas),
  ]);

```

**O que faz.** Embrulha o `<select>` de forma de pagamento no átomo `field`
(Parte 1, Bloco 5), e agrupa os dois campos exclusivos de cartão (qual
cartão, quantas parcelas) num `<div>` que começa **escondido**
(`style: 'display:none'`) — porque o tipo inicial é `'saida'` (Bloco 1), não
`'cartao'`.

**Conceito por trás — os elementos existem sempre; só a visibilidade
muda.** `camposCartao` e `campoForma` são criados **uma vez**, na montagem
inicial da tela, e ficam vivos no DOM o tempo todo — o handler de clique do
Bloco 2 só alterna `style.display` entre eles, nunca os cria ou destrói. Isso
é o que torna possível o patch cirúrgico do Bloco 2: se os campos fossem
criados/destruídos a cada troca de tipo, os handlers (`blur` do Bloco 4,
`keydown` do Bloco 7) teriam que ser presos de novo toda vez.

---

## Bloco 6 — `salvar`

```js
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

```

**O que faz.** A função central da tela: valida, monta o objeto `base` da
transação, ramifica os campos específicos conforme o `tipo`, chama o núcleo
para gravar, muda o mês ativo se necessário, persiste, avisa, e prepara o
formulário para o próximo lançamento.

**Como faz, passo a passo:**
1. Duas guardas de validação com saída antecipada: valor precisa ser
   positivo; se o tipo é cartão, precisa existir pelo menos um cartão
   cadastrado (senão `base.cartaoId` não teria para onde apontar).
2. `base` é montado com os campos **comuns** a qualquer tipo (`tipo`, `data`,
   `categoria`, `descricao`, `valor`, `classificacao`).
3. Um `if/else` sobre `tipo === 'cartao'` adiciona os campos **exclusivos**
   de cada ramo: `cartaoId`/`parcelas` para cartão, `forma` para os outros.
4. `estado = C.adicionarTransacao(estado, base)` — a chamada ao núcleo que de
   fato grava a transação (e, no caso de cartão, provavelmente já expande as
   parcelas — ver `parcelas.explicado.md`).
5. `mesAtual = C.mesDe(base.data)` — troca o mês ativo para o mês da data
   lançada.
6. `await persistir()` — grava em disco, atualiza o topo, redesenha a tela.
7. Toast de confirmação, e o foco volta para o campo de valor (agora um
   elemento **novo**, porque `persistir()` reconstruiu `#view`).

**Sintaxe — `base.cartaoId = cartao ? cartao.id : null`.** `Array.find`
devolve `undefined` se nenhum cartão bate com o nome selecionado (não
deveria acontecer, já que `cartaoSel` só lista cartões existentes, mas é uma
guarda barata); o ternário troca esse `undefined` implícito por um `null`
explícito — mais seguro para serializar em JSON (`undefined` normalmente
desaparece de um `JSON.stringify`, `null` fica).

**Sintaxe — `Math.max(1, parseInt(parcelas.value, 10) || 1)`.**
`parseInt(str, 10)` converte a string do input para inteiro em base 10
(o segundo argumento evita ambiguidade com strings tipo `"010"`, que sem base
explícita já não é mais interpretada como octal nas engines modernas, mas é
boa prática explicitar). `|| 1` cobre o caso de `parseInt` devolver `NaN`
(campo vazio ou não numérico) — `NaN` é falsy, então cai no `1`.
`Math.max(1, ...)` garante o piso: mesmo que alguém digite `0` ou um número
negativo no campo, o mínimo de parcelas é sempre 1. Três camadas de defesa
empilhadas para uma única garantia: **nunca gravar uma compra com zero
parcelas**, o que quebraria a regra de negócio "a soma das parcelas tem que
fechar o valor da compra" (`CLAUDE.md`).

**`mesAtual = C.mesDe(base.data)` — um detalhe de correção fácil de não
perceber.** Toda a tela (lista de lançamentos, KPIs, saldo) é filtrada por
`mesAtual`. Se você lança uma compra retroativa (mês passado) sem esta linha,
ela some da tela **imediatamente** depois de salvar — pareceria que o
lançamento falhou, quando na verdade só ficou fora do filtro visível. Essa
única linha resolve um bug de percepção antes mesmo de existir.

**`campoValor.focus()` depois do `await persistir()` — a outra metade do
problema levantado na Parte 1.** `persistir()` chama `render()`, que
**destrói e recria** todo o `#view` (Parte 1, Bloco 9) — o `<input
class="input-valor">` antigo (que tinha o foco) deixou de existir enquanto
elemento de DOM. Esta linha busca o elemento **novo** (mesma classe, DOM
diferente — `$('.input-valor')` é uma nova busca por seletor, não a variável
`valor` antiga) e foca nele de novo, preservando o fluxo de "lançar vários
itens em sequência sem tocar no mouse".

**Sintaxe — `const campoValor = $('.input-valor'); if (campoValor)
campoValor.focus();`, guarda antes de chamar método.** Buscar por seletor
pode devolver `null` se o elemento não existir (por exemplo, se a aba tiver
mudado entre o clique e a resposta assíncrona); chamar `.focus()` direto em
`null` quebraria. A guarda `if (campoValor)` torna essa chamada seguramente
condicional.

---

## Bloco 7 — Enter salva, sem precisar do mouse

```js
  // Enter em qualquer campo salva — lançar não deveria exigir o mouse.
  for (const campo of [valor, descricao, data]) {
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  }

```

**O que faz.** Prende o mesmo handler de teclado em três campos diferentes: se
a tecla pressionada for Enter, chama `salvar()`.

**Sintaxe — `for (const campo of [valor, descricao, data])`, laço sobre uma
lista literal de referências a elementos.** Em vez de escrever
`valor.addEventListener(...)`, `descricao.addEventListener(...)`,
`data.addEventListener(...)` três vezes repetindo o mesmo corpo, o laço
percorre um array construído na hora com as três variáveis já declaradas —
uma forma compacta de "aplicar a mesma coisa a vários elementos conhecidos".

**Sintaxe — `e.key === 'Enter'`.** O objeto de evento de teclado (`e`) traz
`.key` com o **nome** da tecla pressionada (`'Enter'`, `'Tab'`, `'a'`...) —
a forma moderna de detectar teclas, substituindo o antigo `e.keyCode`
(numérico e menos legível).

**Conceito por trás — acessibilidade de teclado como decisão deliberada de
produto.** O comentário do código é explícito: "lançar não deveria exigir o
mouse". Para um app usado repetidamente ao longo do dia (postar contas), cada
vez que a mão precisa sair do teclado para pegar o mouse é atrito acumulado.
Este bloco, combinado com `valor.focus()` nos Blocos 2 e 6, forma um ciclo
completo: escolher tipo → digitar → Enter → foco volta → digitar de novo —
tudo sem mouse.

---

## Bloco 8 — montagem do formulário na tela

```js
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

```

**O que faz.** Agrupa todos os campos (embrulhados em `field(...)`, exceto
`campoForma`/`camposCartao` que já vêm prontos dos Blocos 5) numa única linha
de formulário, mais o botão "Lançar" no fim, e anexa o card inteiro (`wrap`)
à view.

**Sintaxe — `el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }),
botão])`, um rótulo vazio "por simetria visual".** O botão não precisa de
rótulo de campo, mas é embrulhado na mesma estrutura `field` (rótulo + input,
aqui manual em vez de via `field(...)`) para que ele se alinhe visualmente
com os outros campos numa grade CSS. `&nbsp;` (espaço não-quebrável) ocupa o
lugar onde o texto do rótulo iria, mantendo a altura/alinhamento sem mostrar
texto nenhum — o único uso real da porta `html` do helper `el` (ver Parte 1,
Bloco 4, "Armadilha").

**Conceito por trás — `onclick: salvar`, passar a função em si, não uma
chamada.** `onclick: salvar` (sem parênteses) passa a **referência** à
função `salvar`; o helper `el` (Parte 1) vai transformar isso em
`addEventListener('click', salvar)`. Se fosse escrito `onclick: salvar()`
(com parênteses), `salvar()` executaria **imediatamente**, na hora de montar
o DOM, e o valor passado como `onclick` seria o que `salvar()` **devolve**
(uma `Promise`, já que é `async`), não uma função — o clique nunca chamaria
`salvar` de novo. É um erro comum e sutil o suficiente para valer o
destaque.

---

## Bloco 9 — a lista de lançamentos do mês: preparação

```js
  // lista do mês, tudo junto e ordenado — em vez de três tabelas separadas
  const noMes = (t) => C.mesDe(t.data) === mesAtual;
  const itens = estado.transacoes.filter(noMes).sort((a, b) => (a.data < b.data ? 1 : -1));

  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, `Lançamentos de ${C.rotuloMes(mesAtual)} (${itens.length})`));
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['Data', 'Tipo', 'Categoria', 'Descrição', 'Onde', 'Classif.', 'Valor', ''].map((c) => el('th', c === 'Valor' ? { class: 'num' } : {}, c)))));
  const tbody = el('tbody');
  if (!itens.length) tbody.append(el('tr', {}, el('td', { colspan: 8, class: 'empty' }, 'Nada lançado neste mês ainda.')));

```

**O que faz.** Filtra as transações do mês ativo, ordena da mais recente para
a mais antiga, e prepara a tabela: título com contagem, cabeçalho de colunas,
e uma linha de "vazio" caso não haja nenhum lançamento no mês.

**Sintaxe — `const noMes = (t) => C.mesDe(t.data) === mesAtual`, um predicado
nomeado.** Em vez de escrever a expressão direto dentro de `.filter(...)`,
ela ganha um nome (`noMes`) — puramente para legibilidade: `.filter(noMes)`
se lê quase como português ("filtre o que está no mês"), enquanto
`.filter((t) => C.mesDe(t.data) === mesAtual)` inline exigiria parar para
entender o que a arrow function faz.

**Sintaxe — `.sort((a, b) => (a.data < b.data ? 1 : -1))`.** O comparador
devolve `1` (b vem antes de a) quando `a.data < b.data`, e `-1` (a vem antes
de b) caso contrário — o efeito é ordenar **do mais recente para o mais
antigo** (decrescente), porque datas em formato `"YYYY-MM-DD"` comparam
corretamente como string (o mesmo motivo pelo qual `"YYYY-MM"` ordena como
data em `calculos.js`). Note que este comparador não trata o caso de
igualdade (`a.data === b.data`) explicitamente — ele sempre devolve `-1`
nesse caso (porque a condição `a.data < b.data` é falsa), o que é
inofensivo para `sort` (só significa "não troca a ordem relativa entre
lançamentos do mesmo dia", tecnicamente não garantido como estável em todo
motor, mas sem consequência prática aqui).

**Sintaxe — `['Data', 'Tipo', ...].map((c) => el('th', c === 'Valor' ? {
class: 'num' } : {}, c))`.** Constrói as células de cabeçalho a partir de uma
lista de nomes de coluna, aplicando a classe `'num'` (provavelmente
alinhamento à direita, para números) só na coluna `'Valor'` — um ternário
dentro do `.map` decide as props de cada `<th>` conforme o próprio nome da
coluna.

**A lista de lançamentos junta os três tipos (entrada/saída/cartão) numa
tabela só, ordenada por data — o comentário do código conta a história: "era
três tabelas repetidas na mesma tela", motivo citado como a maior queixa de
usabilidade antes deste refactor.** É a mesma filosofia do formulário
unificado (Bloco 1): um lugar só para ver tudo, em vez de três lugares
separados que o usuário precisaria checar um a um.

---

## Bloco 10 — construindo cada linha da tabela

```js
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
```

**O que faz.** Para cada transação do mês, monta uma linha de tabela com
oito células: data, tipo (como uma "pílula" colorida), categoria, descrição,
"onde" (cartão+parcelas ou forma de pagamento), classificação (como uma tag,
se houver), valor formatado (colorido conforme entrada/saída), e um botão de
remover.

**Sintaxe — `t.data.slice(8, 10) + '/' + t.data.slice(5, 7)`.** `t.data` é
`"YYYY-MM-DD"` (por exemplo `"2026-07-20"`); `.slice(8, 10)` pega o dia
(`"20"`), `.slice(5, 7)` pega o mês (`"07"`); concatenados com `'/'` no meio
dá `"20/07"` — o formato brasileiro dia/mês, sem o ano (a coluna já está
dentro do contexto de um mês/ano específico, mostrado no título da tabela).

**Sintaxe — `` `${nomeCartao(t.cartaoId)} ${t.parcelas > 1 ? `${t.parcelas}x`
: ''}`.trim() ``, template literal aninhado.** Um template literal **dentro**
de outro: o ternário interno (`` `${t.parcelas}x` ``) só é avaliado quando
`t.parcelas > 1`, produzindo por exemplo `"3x"`; caso contrário vira string
vazia. O template externo junta o nome do cartão com esse sufixo (com um
espaço entre os dois, mesmo quando o sufixo é vazio) e `.trim()` no final
remove esse espaço sobrando quando não há parcelas — o resultado é
`"Nubank 3x"` para uma compra parcelada, ou só `"Nubank"` para uma compra à
vista no cartão.

**Sintaxe — `t.forma || ''`, guarda contra campo ausente.** Se `t.forma` for
`undefined` (transações de cartão não têm esse campo — vejam o Bloco 6:
`base.forma` só é setado no ramo `else`), o `||` troca por string vazia, em
vez de a célula mostrar o texto literal `"undefined"`.

**Sintaxe — `t.tipo === 'transferencia' ? '' : (ehEntrada ? 'in' : 'out')`,
ternário aninhado.** Decide a classe de cor do valor em três casos:
transferências não são nem "verde" nem "vermelho" (sem classe — cor neutra),
entradas ganham `'in'`, saídas ganham `'out'`. Repare que este arquivo (Parte
3) lida com um quarto tipo, `'transferencia'`, que não aparecia nas Partes 1
e 2 — ele existe em `rotuloTipo` (Parte 1, Bloco 6) mas o formulário desta
tela (Bloco 2) só oferece três botões (Saída/Entrada/Cartão); transferências
provavelmente só entram no sistema por outro caminho (talvez a tela de
Cartões, fora desta mirror, ou diretamente pela importação).

**O botão de remover, o mesmo idioma de closure já nomeado na Parte 2.**
`onclick: async () => { estado = C.removerTransacao(estado, t.id); await
persistir(); toast('Removido'); }` fecha sobre `t` (a transação específica
desta linha, capturada do laço `for...of`) — cada botão "sabe" qual `t.id`
remover porque foi criado dentro de uma iteração específica do laço. É o
mesmo idioma "inputs/dado + botão + closure + `persistir()`" nomeado na
Parte 2 (Bloco 9), aqui sem inputs — só o próprio item da lista como o
"dado" capturado.

**Fechamento da função.** `table.append(tbody)`, `card.append(...)` e
`v.append(card)` encerram a montagem: o `<tbody>` (com todas as linhas já
inseridas pelo laço) entra na tabela, a tabela entra no card (embrulhada num
`<div class="table-wrap">`, provavelmente para permitir scroll horizontal em
telas estreitas), e o card entra na view.

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Estado local de função vs. de módulo** | Bloco 1 | `tipo` só vive enquanto esta chamada de `renderLancar` está na tela |
| **Acesso a objeto por chave computada (`botoes[t]`)** | Bloco 2 | permite percorrer genericamente um grupo de elementos relacionados |
| **Patch cirúrgico escolhido de propósito** | Bloco 2 | trocar tipo não chama `render()` — perderia o que já foi digitado |
| **`blur` vs. `input`/`change`** | Bloco 4 | sugerir só quando o campo perde foco, não a cada tecla |
| **Guarda dupla antes de aplicar sugestão automática** | Bloco 4 | só aplica categoria sugerida se ela ainda existir nas opções válidas |
| **Elementos sempre existem; só a visibilidade alterna** | Bloco 5 | pré-requisito para o patch cirúrgico do Bloco 2 funcionar sem recriar listeners |
| **Camadas de defesa empilhadas (`Math.max(1, parseInt(...) \|\| 1)`)** | Bloco 6 | garante uma invariante de negócio (parcelas ≥ 1) contra três formas de entrada inválida |
| **Correção de mês ativo após lançar (`mesAtual = C.mesDe(base.data)`)** | Bloco 6 | evita que um lançamento retroativo "suma" da tela por engano |
| **Passar função por referência, não por chamada (`onclick: salvar`)** | Bloco 8 | `salvar` sem parênteses; com parênteses executaria na hora errada |
| **Predicado nomeado (`noMes`)** | Bloco 9 | dar nome a uma condição de filtro para o código se ler como frase |
| **Template literal aninhado** | Bloco 10 | um `${...}` pode conter outro template literal completo dentro |
| **Closure sobre item de laço (`t` capturado por cada botão)** | Bloco 10 | cada botão de remover "sabe" qual item apagar sem variável extra |

---

**Navegação:** ← anterior: [Parte 2 — Início](./app.parte2.explicado.md) · próxima: [Parte 4 — Importar e Revisar](./app.parte4.explicado.md) →
