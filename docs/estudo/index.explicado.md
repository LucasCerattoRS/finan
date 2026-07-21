# `src/core/index.js` — explicado linha a linha

> **Papel no projeto:** é a **fachada** (porta de entrada) do núcleo — a UI e os testes
> importam *tudo* daqui (`import * as C from '../core/index.js'`). Faz duas coisas:
> (1) **re-exporta** os outros módulos do core num só lugar; (2) define as **operações de
> mutação** — as funções que *mudam* o estado.
>
> **A ideia-mestra deste arquivo (não pule):** toda mutação é uma **função pura** com a
> assinatura `(estado, dados) → novo estado`. Ela **nunca** altera o estado recebido nem grava
> em disco — só devolve um objeto novo. Quem salva é a UI, depois (`persistir()` em `app.js`).
> Se você entende esse contrato, entende o app inteiro.
>
> **Pré-requisito:** ter lido [`model.explicado.md`](./model.explicado.md) — aqui usamos
> `novoId`, `estadoInicial` e `migrar` o tempo todo.

Índice:
1. [O bloco de re-exports (o *barrel*)](#1)
2. [O padrão CRUD puro: transações e cartões](#2)
3. [`registrarPagamentoFatura` / `definirFatura` — *upsert*](#3)
4. [Planejamento: guarda, apaga e repete](#4)
5. [Reserva e metas](#5)
6. [`importarTransacoes` e `categorizarLote` — lote + efeitos consistentes](#6)
7. [`carregar` — a ponte com a migração](#7)
8. [Recapitulando os padrões](#8)

---

<a id="1"></a>
## 1. O bloco de re-exports (o *barrel*)

```js
// index.js — fachada do núcleo. UI e testes importam daqui.
export * from './model.js';
export * from './faturas.js';
export * from './parcelas.js';
export * from './calculos.js';
export * from './score.js';
export * from './regras.js';
export * from './importar.js';
export * from './faturasPagas.js';
export * from './revisar.js';
export * from './planejamento.js';
export * from './reserva.js';
export * from './metas.js';
```

**O que faz.** `export * from './x.js'` re-exporta **tudo** que `x.js` exporta, como se tivesse
sido declarado aqui. O resultado: quem faz `import * as C from './core/index.js'` recebe num
único objeto `C` todas as funções de todos os módulos do core (`C.resumoMes`, `C.scoreSaude`,
`C.formatarBRL`…).

**Por quê.** É o padrão **barrel** (barril): um ponto único de importação. Vantagens:
- A UI não precisa saber em qual arquivo mora cada função — importa só de `index.js`.
- Você pode **reorganizar** o core (mover uma função de `calculos.js` pra `faturas.js`) sem
  tocar em nenhum `import` da UI. O `index.js` é uma camada de **desacoplamento**.

**Conceito por trás — *facade pattern*.** Uma fachada esconde a estrutura interna de um
subsistema atrás de uma interface simples. Aqui, "o subsistema" são 12 arquivos; "a interface"
é o objeto `C`.

**Sintaxe — `export *` vs `export { nome }`.** `export *` reexporta os *nomeados* (não o
`export default`, que estes módulos não usam). Se dois módulos exportassem o **mesmo nome**,
daria conflito — por isso o core mantém nomes únicos entre arquivos.

**Armadilha.** `import * as C` traz tudo — inclusive o que você talvez não use. Em um projeto
com *bundler* e *tree-shaking* isso pode inflar o bundle; aqui (ESM direto, sem build) o custo é
irrelevante e a clareza compensa.

---

<a id="2"></a>
## 2. O padrão CRUD puro: transações e cartões

```js
import { migrar, estadoInicial, novoId } from './model.js';

// --- Operações de mutação (retornam novo estado; UI persiste depois) ---

export function adicionarTransacao(estado, dados) {
  const tx = { id: novoId('tx'), ...dados };
  return { ...estado, transacoes: [...estado.transacoes, tx] };
}

export function atualizarTransacao(estado, id, patch) {
  return {
    ...estado,
    transacoes: estado.transacoes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function removerTransacao(estado, id) {
  return { ...estado, transacoes: estado.transacoes.filter((t) => t.id !== id) };
}
```

**O comentário `--- Operações de mutação ---`.** Marca, no fonte, a virada entre "seção 1"
(re-exports) e "seção 2" em diante (tudo que segue é uma função que recebe `estado` e devolve
`estado` novo). É um separador visual — sem efeito em runtime, só orientação de leitura.

Estes três são o **molde** de quase tudo no arquivo. `adicionarCartao`/`atualizarCartao`/
`removerCartao` (logo abaixo no fonte) são idênticos, trocando `transacoes` por `cartoes` e
`novoId('tx')` por `novoId('card')`. Entenda um, entendeu todos:

```js
export function adicionarCartao(estado, dados) {
  const c = { id: novoId('card'), ...dados };
  return { ...estado, cartoes: [...estado.cartoes, c] };
}

export function atualizarCartao(estado, id, patch) {
  return {
    ...estado,
    cartoes: estado.cartoes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function removerCartao(estado, id) {
  return { ...estado, cartoes: estado.cartoes.filter((c) => c.id !== id) };
}
```

Compare campo a campo com o trio de transações: mesmo esqueleto, `id: novoId('card')` no lugar de
`novoId('tx')`, `c` no lugar de `t`, `cartoes` no lugar de `transacoes`. É repetição deliberada —
o arquivo não usa uma "fábrica de CRUD" genérica porque, com só dois casos, a duplicação
explícita é mais fácil de ler do que uma abstração prematura (você lê a função e já sabe tudo,
sem indireção).

**A regra de ouro (imutabilidade).** Nenhuma das três altera `estado`. Todas devolvem **um novo
objeto** com `{ ...estado, ... }`. O array também é recriado, nunca mutado:
- **Adicionar:** `[...estado.transacoes, tx]` cria um array novo com os antigos + o novo. Repare
  que **não** é `estado.transacoes.push(tx)` — `push` mutaria o array original.
- **Atualizar:** `.map(...)` cria um array novo; cada item é o mesmo, **exceto** o de `id`
  batendo, que vira `{ ...t, ...patch }` (uma cópia com os campos do `patch` sobrepostos).
- **Remover:** `.filter(t => t.id !== id)` devolve um array novo sem o item alvo.

**Como faz (sintaxe):**
- `{ id: novoId('tx'), ...dados }` — cria a transação: primeiro um `id` fresco, depois espalha
  os campos que a UI mandou (`valor`, `tipo`, `data`…). Como `...dados` vem **depois**, se `dados`
  trouxesse um `id` ele venceria — aqui não traz, então o `id` gerado prevalece na prática.
- `t.id === id ? { ...t, ...patch } : t` — *ternário* dentro do `map`: "é o alvo? devolve cópia
  atualizada; senão, devolve o original intacto".
- `{ ...t, ...patch }` — *merge*: os campos de `patch` sobrescrevem os de `t`. Atualização
  **parcial** (só o que mudou).

**Conceito por trás — o "reducer".** Uma função `(estado, ação) → novo estado` que nunca muta a
entrada é exatamente a assinatura de um **reducer** (Redux, `useReducer` do React). Este arquivo
é, na prática, um conjunto de reducers escritos à mão. A vantagem da imutabilidade:
- **Previsibilidade:** ninguém "de longe" muda seu estado por baixo dos panos.
- **Comparação barata:** dá pra saber se algo mudou comparando referências (`antigo !== novo`).
- **Histórico/undo:** como cada versão é um objeto separado, guardar versões antigas é trivial
  (o app aproveita isso nos backups).

**Por que "a UI persiste depois".** As funções **não** chamam `salvar`. Elas só computam o próximo
estado. Em `app.js`, o fluxo é: `estado = C.adicionarTransacao(estado, dados); await persistir();`
Essa separação entre **calcular** (puro, testável) e **efetivar** (salvar em disco, sujo) é o
princípio *functional core, imperative shell* que aparece no projeto inteiro.

**Alternativas e trade-offs.**
- *Mutar direto* (`estado.transacoes.push(tx)`): menos código, mas abre a porta pros bugs de
  estado compartilhado e mata a comparação por referência. O projeto escolheu o oposto de
  propósito.
- Uma lib de imutabilidade (Immer, Immutable.js): ajudaria em estruturas fundas, mas adiciona
  dependência — contra o espírito "offline, sem build" do app. Spread nativo dá conta aqui.

**Armadilha — spread é cópia RASA.** `{ ...estado }` copia só o primeiro nível. Por isso, para
mexer em `transacoes`, o código **recria explicitamente** esse array. Se você fizesse
`{ ...estado }` e depois `novo.transacoes.push(x)`, estaria mutando o **mesmo** array do estado
antigo (o spread não o clonou em profundidade). Cada função aqui recria exatamente o ramo que
toca — nem mais, nem menos.

---

<a id="3"></a>
## 3. `registrarPagamentoFatura` / `definirFatura` — o *upsert*

```js
// Registra um pagamento de fatura. `data` é QUANDO o dinheiro saiu — se for antes
// do mês da fatura, é um adiantamento (ver faturasPagas.ehAdiantamento).
export function registrarPagamentoFatura(estado, dados) {
  const p = {
    id: novoId('pag'),
    criadoEm: new Date().toISOString(),
    data: new Date().toISOString().slice(0, 10),
    ...dados,
  };
  return { ...estado, pagamentosFatura: [...estado.pagamentosFatura, p] };
}
```

**O que faz.** Registra o pagamento de uma fatura. Segue o molde do "adicionar", com um detalhe:
preenche **defaults** antes de `...dados` — um `criadoEm` (timestamp completo ISO) e uma `data`
(só o dia, `YYYY-MM-DD`). Como `...dados` vem **por último**, se a UI mandar uma `data` própria,
ela **vence** o default. É o idioma "valores padrão, sobrescritos pelo que veio".

**Detalhe de negócio.** O comentário do fonte lembra: `data` é *quando o dinheiro saiu*. Se for
antes do mês da fatura, é um **adiantamento** (a lógica que decide isso mora em `faturasPagas.js`).
Guarde: este arquivo só **grava** o fato; a *interpretação* é de outro módulo.

```js
// Guarda o total que o BANCO informa para a fatura de um cartão num mês.
// Substitui a de mesmo cartão+mês (reimportar o mesmo print não duplica).
export function definirFatura(estado, dados) {
  const faturas = (estado.faturas || []).filter(
    (f) => !(f.cartaoId === dados.cartaoId && f.mes === dados.mes),
  );
  return { ...estado, faturas: [...faturas, { id: novoId('fat'), fonte: 'banco', ...dados }] };
}
```

**O que faz.** Guarda o total que o **banco** informou pra fatura de um cartão num mês. Mas com
uma diferença crucial do "adicionar": ele **primeiro remove** qualquer fatura do mesmo
`cartaoId` + `mes`, e **depois** adiciona a nova. Resultado: reimportar o mesmo print **substitui**
em vez de duplicar.

**Conceito por trás — *upsert* (update-or-insert).** "Se já existe (mesma chave), troca; senão,
cria." A "chave" aqui é o par `(cartaoId, mes)`. O idioma `filter(fora os da chave)` + `concat(o
novo)` é o jeito imutável de fazer upsert num array. Você verá o **mesmo padrão** em
`definirPlanejamento` (chave = mês+categoria).

**Sintaxe — `(estado.faturas || [])`.** Blindagem: se `faturas` ainda não existir no estado
(arquivo antigo), usa `[]`. O `migrar` já garante o array, mas o `|| []` é cinto-e-suspensório.

**Sintaxe — a negação do "and".** `!(f.cartaoId === dados.cartaoId && f.mes === dados.mes)`
lê-se "mantenha os que **não são** (mesmo cartão E mesmo mês)". Pela lei de De Morgan, é
equivalente a `f.cartaoId !== dados.cartaoId || f.mes !== dados.mes`. A forma com `!(... && ...)`
é mais fácil de ler como "descarta o duplicado".

```js
export function removerPagamentoFatura(estado, id) {
  return { ...estado, pagamentosFatura: estado.pagamentosFatura.filter((p) => p.id !== id) };
}
```

**O que faz.** Fecha o CRUD de pagamentos de fatura com o molde "remover" de sempre —
`.filter` descartando o `id` alvo, o mesmo idioma da seção 2.

---

<a id="4"></a>
## 4. Planejamento: guarda, apaga e repete

```js
// ---- Planejamento (orçamento por mês/categoria) ----

// Define quanto se PRETENDE gastar numa categoria num mês. Upsert por (mês,
// categoria); estimado <= 0 apaga a meta (não guarda zero). Garante a categoria
// na config, como o categorizarLote faz.
export function definirPlanejamento(estado, { mes, categoria, estimado }) {
  const outros = (estado.planejamentos || []).filter(
    (p) => !(p.mes === mes && p.categoria === categoria),
  );
  const v = Number(estimado) || 0;
  if (v <= 0) return { ...estado, planejamentos: outros };
  let novo = {
    ...estado,
    planejamentos: [...outros, { id: novoId('plan'), mes, categoria, estimado: v }],
  };
  if (categoria && !novo.config.categorias.includes(categoria)) {
    novo = { ...novo, config: { ...novo.config, categorias: [...novo.config.categorias, categoria] } };
  }
  return novo;
}
```

**O que faz.** Define quanto você *pretende* gastar numa categoria num mês (orçamento). É um
**upsert com duas regras extras**:

1. **`estimado <= 0` apaga a meta** (não guarda zero). Se você zera o orçamento, o registro
   simplesmente some (`return { ...estado, planejamentos: outros }` — sem re-adicionar).
2. **Garante a categoria na config.** Se você orçou uma categoria nova, ela é adicionada a
   `config.categorias` — mantendo a lista de categorias sempre coerente com o que foi usado.

**Sintaxe — destructuring no parâmetro.** `function definirPlanejamento(estado, { mes, categoria,
estimado })` — o segundo argumento é desestruturado direto na assinatura. A UI chama
`definirPlanejamento(estado, { mes: '2026-07', categoria: 'Mercado', estimado: 800 })`. Isso é
"*named arguments*" fingido — mais legível que `(estado, mes, categoria, estimado)`, porque na
chamada os nomes ficam visíveis e a ordem não importa.

**Sintaxe — `Number(estimado) || 0`.** Converte pra número e cai pro 0 se vier `NaN`/vazio (a UI
manda strings de `<input>`). Cuidado com a pegadinha já vista: `|| 0` também transforma `0` em
`0` (inofensivo aqui) — mas é por isso que a checagem seguinte é `<= 0` e não `=== 0`.

**Sintaxe — atualização aninhada.** Adicionar uma categoria mexe **dois níveis** fundo
(`estado.config.categorias`). Veja como cada nível é recriado:
`{ ...novo, config: { ...novo.config, categorias: [...novo.config.categorias, categoria] } }`.
Recria o topo, recria `config`, recria o array `categorias`. É o custo da imutabilidade em
estruturas aninhadas — explícito e verboso, mas sem mágica.

```js
export function removerPlanejamento(estado, mes, categoria) {
  return {
    ...estado,
    planejamentos: (estado.planejamentos || []).filter(
      (p) => !(p.mes === mes && p.categoria === categoria),
    ),
  };
}
```

**O que faz.** Fecha o par com `definirPlanejamento`: remove a meta de `(mes, categoria)` com o
mesmo `filter` + negação de `&&` já visto em `definirFatura`. A chave composta (dois campos, não
um `id`) é o padrão de identidade deste registro — não existe "o planejamento X", existe "o
planejamento de Mercado em julho".

```js
// "Repetir para os demais meses": copia o orçamento de `mesOrigem` para cada mês
// em `mesesDestino`, substituindo no destino apenas as categorias que a origem
// tem (não apaga metas de outras categorias que já existam lá).
export function repetirPlanejamento(estado, mesOrigem, mesesDestino) {
  const origem = (estado.planejamentos || []).filter((p) => p.mes === mesOrigem);
  if (!origem.length) return estado;
  const destinos = new Set((mesesDestino || []).filter((m) => m && m !== mesOrigem));
  const catsOrigem = new Set(origem.map((p) => p.categoria));
  const planejamentos = (estado.planejamentos || []).filter(
    (p) => !(destinos.has(p.mes) && catsOrigem.has(p.categoria)),
  );
  for (const m of destinos) {
    for (const p of origem) {
      planejamentos.push({ id: novoId('plan'), mes: m, categoria: p.categoria, estimado: p.estimado });
    }
  }
  return { ...estado, planejamentos };
}
```

**O que faz.** "Repetir para os demais meses": copia o orçamento de `mesOrigem` para vários
`mesesDestino`, substituindo no destino **apenas** as categorias que a origem tem (não apaga
metas de outras categorias que já existam lá).

**Conceito por trás — `Set` para pertencimento O(1).** `destinos.has(p.mes)` e
`catsOrigem.has(p.categoria)` rodam em tempo constante. Se fossem arrays com `.includes(...)`,
cada teste seria O(n), e o filtro inteiro viraria O(n²). Converter as listas em `Set` **uma vez**
e consultar muitas é o idioma certo pra "esse item está no conjunto?".

**Sintaxe — `new Set(array)` + `.filter(m => m && m !== mesOrigem)`.** Cria um conjunto dos meses
de destino, jogando fora vazios e o próprio mês de origem (não faz sentido copiar pra si mesmo).
`Set` também **deduplica** de graça (se `mesesDestino` repetir um mês).

**Armadilha — aqui o array é MUTADO com `push` (e tudo bem).** Diferente dos outros, este cria
uma variável local `planejamentos` (já é um array **novo**, resultado do `filter`) e faz `push`
nela num laço. Isso é seguro **porque o array é local e novo** — não é o do estado antigo. Mutar
uma cópia local que você acabou de criar é um idioma legítimo e eficiente; o pecado é mutar o
estado **recebido**. A função ainda devolve `{ ...estado, planejamentos }`, respeitando o contrato.

**Alternativa.** Daria pra fazer 100% "funcional" com `flatMap`/`reduce` em vez do laço com
`push`. Trade-off: o laço aqui é mais legível e o array é local — pureza externa mantida sem
ginástica.

---

<a id="5"></a>
## 5. Reserva e metas

```js
// ---- Reserva de emergência (aba "Reservas PM") ----

// Registra um movimento de reserva num mês: valor > 0 aporta, valor < 0 resgata.
export function registrarReserva(estado, dados) {
  const r = {
    id: novoId('res'),
    criadoEm: new Date().toISOString(),
    mes: dados.mes,
    valor: Number(dados.valor) || 0,
    obs: dados.obs || '',
  };
  return { ...estado, reservas: [...(estado.reservas || []), r] };
}
```

**O que faz.** Registra um movimento da reserva de emergência. Detalhe de modelagem elegante:
**um único array `reservas`** guarda tanto aportes quanto resgates — a diferença é o **sinal do
valor**: `valor > 0` guarda, `valor < 0` resgata. O saldo da reserva é só a **soma** dos valores.

**Conceito por trás — *ledger* de sinal.** Em vez de dois tipos ("aporte"/"resgate"), um só
movimento com valor assinado. É como um livro-caixa (débito/crédito). Simplifica o cálculo do
acumulado (é uma soma) ao custo de você lembrar que negativo = saída da reserva.

**Diferença do "adicionar" genérico.** Aqui os campos são montados **explicitamente**
(`mes: dados.mes`, `valor: ...`, `obs: ...`) em vez de `...dados`. Efeito: só entram os campos
esperados — se a UI mandar lixo extra, ele **não** vaza pro estado. É uma escolha de
*allow-list* (mais rígida) versus o `...dados` (mais permissivo) usado em outras funções. Ambos
os estilos convivem no arquivo; vale notar o contraste.

```js
export function removerReserva(estado, id) {
  return { ...estado, reservas: (estado.reservas || []).filter((r) => r.id !== id) };
}
```

**O que faz.** Remove um movimento (aporte ou resgate) pelo `id` — o molde "filter" de sempre,
com o cinto-e-suspensório `(estado.reservas || [])` para o caso de o array ainda não existir.

```js
// Meta da reserva, em número de meses de gasto médio (0 = sem meta).
export function definirMetaReserva(estado, meses) {
  const m = Math.max(0, Number(meses) || 0);
  return { ...estado, config: { ...estado.config, reservaMetaMeses: m } };
}

// ---- Metas financeiras (calculadora: reserva, liberdade, dividendos) ----

// Atualiza campos da calculadora de metas (merge raso sobre config.metas). A UI passa
// só o que mudou: { rendaComponentes }, { patrimonioInvestido, aporteMensal, ... }.
export function definirMetas(estado, patch) {
  const metas = { ...(estado.config?.metas || {}), ...patch };
  return { ...estado, config: { ...estado.config, metas } };
}
```

**O que fazem.** Escrevem em `config`. `definirMetaReserva` fixa a meta (em meses), com
`Math.max(0, ...)` pra nunca ficar negativa. `definirMetas` faz um **merge raso** sobre
`config.metas` — a UI manda *só o que mudou* (`{ patrimonioInvestido: 2000 }`) e o resto é
preservado.

**Sintaxe — *optional chaining* `estado.config?.metas`.** O `?.` devolve `undefined` (em vez de
estourar) se `config` for `null`/`undefined`. Combinado com `|| {}`, garante um objeto pra
espalhar. É a versão segura de `estado.config.metas`.

---

<a id="6"></a>
## 6. `importarTransacoes` e `categorizarLote` — lote + efeitos consistentes

```js
export function importarTransacoes(estado, candidatos) {
  const novas = candidatos
    .filter((c) => c.importar)
    .map((c) => ({
      id: novoId('tx'),
      tipo: c.tipo,
      data: c.data,
      categoria: c.categoria || 'Outros',
      descricao: c.descricao || '',
      valor: c.valor,
      classificacao: c.classificacao || '',
      forma: c.forma || 'Importado',
      fitid: c.fitid || '',
    }));
  return { ...estado, transacoes: [...estado.transacoes, ...novas] };
}
```

**O que faz.** Recebe os *candidatos* da tela de importação (a pré-visualização do extrato, que
o `importar.js` monta) e efetiva **só os marcados** (`c.importar`) como transações de verdade.

**Como faz — `filter` + `map` encadeados.**
- `.filter(c => c.importar)` — descarta os que o usuário desmarcou (e os duplicados).
- `.map(c => ({...}))` — transforma cada candidato numa transação "limpa", com **allow-list**
  explícita dos campos e defaults (`categoria || 'Outros'`, `forma || 'Importado'`). Note o
  `fitid` — o ID do lançamento no arquivo OFX, usado pra **detectar reimportação** (não
  duplicar). Ver `importar.js`.

**Sintaxe — `.map(c => ({ ... }))`.** Os parênteses em volta de `{ ... }` são **obrigatórios**:
sem eles, `c => { ... }` seria interpretado como *corpo de função* (bloco), não como objeto
literal. Pegadinha clássica de arrow function.

```js
// Aplica categoria/classificação a um lote de lançamentos de uma vez.
// Se `virarRegra` for true, também guarda a regra — o app passa a acertar sozinho.
export function categorizarLote(estado, ids, categoria, classificacao = '', virarRegra = null) {
  const alvo = new Set(ids);
  const transacoes = estado.transacoes.map((t) => (
    alvo.has(t.id) ? { ...t, categoria, classificacao: classificacao || t.classificacao } : t
  ));
  let novo = { ...estado, transacoes };
  if (virarRegra) novo = adicionarRegra(novo, { padrao: virarRegra, categoria, classificacao });
  if (categoria && !novo.config.categorias.includes(categoria)) {
    novo = { ...novo, config: { ...novo.config, categorias: [...novo.config.categorias, categoria] } };
  }
  return novo;
}
```

**O que faz.** Aplica uma `categoria`/`classificacao` a **vários** lançamentos de uma vez (pelos
`ids`). E, opcionalmente, faz duas coisas a mais:
1. Se `virarRegra` (um padrão de texto) for passado, **também cria uma regra** — daí pra frente o
   app categoriza sozinho lançamentos parecidos. Repare que ele **compõe** outra função pura
   (`adicionarRegra(novo, ...)`), encadeando transformações de estado.
2. Garante a categoria na config (mesmo efeito colateral coerente de `definirPlanejamento`).

**Conceito por trás — composição de reducers.** `novo = adicionarRegra(novo, ...)` mostra o
padrão: cada passo recebe o estado do passo anterior e devolve o próximo. É como você
"encadearia" ações num reducer. O `let novo` (em vez de `const`) existe justamente pra ir
**reatribuindo** o estado a cada transformação — sem nunca mutar os objetos, só trocando a que
`novo` aponta.

**Sintaxe — `Set` de novo.** `alvo.has(t.id)` no meio de um `.map` sobre TODAS as transações:
com muitos lançamentos, `Set` evita o O(n²) que um `ids.includes(t.id)` traria.

**Sintaxe — defaults nos parâmetros.** `classificacao = ''` e `virarRegra = null` deixam esses
argumentos **opcionais**. Chamar `categorizarLote(estado, ids, 'Mercado')` funciona.

```js
export function adicionarRegra(estado, regra) {
  const regras = [...(estado.config.regras || []), regra];
  return { ...estado, config: { ...estado.config, regras } };
}

export function removerRegra(estado, padrao) {
  const regras = (estado.config.regras || []).filter((r) => r.padrao !== padrao);
  return { ...estado, config: { ...estado.config, regras } };
}
```

**O que fazem.** `adicionarRegra`/`removerRegra` seguem o molde add/filter, mexendo em
`config.regras` (a lista de "se a descrição casar com este padrão, categoriza assim" — ver
[`regras.explicado.md`](./regras.explicado.md)). `removerRegra` identifica a regra pelo campo
`padrao` (o texto que ela casa), não por um `id` — é a chave natural desse registro, já que duas
regras com o mesmo padrão não fariam sentido.

---

<a id="7"></a>
## 7. `carregar` — a ponte com a migração

```js
// Carrega JSON cru (de arquivo/localStorage) para um estado válido e migrado.
export function carregar(json) {
  if (!json) return estadoInicial();
  const dados = typeof json === 'string' ? JSON.parse(json) : json;
  return migrar(dados);
}
```

**O que faz.** Transforma o conteúdo cru vindo do disco/localStorage num **estado válido**:
- Sem conteúdo (`null`/vazio) → `estadoInicial()` (começa do zero).
- Se veio **string**, faz `JSON.parse`; se já veio objeto, usa direto. (`typeof json === 'string'`
  cobre os dois caminhos do `storage.js`.)
- Passa por `migrar` (ver `model.explicado.md` §9), que normaliza tudo.

**Por que existe.** É a **fronteira** entre "texto não confiável do disco" e "estado que o app
assume correto". `storage.js` chama `carregar(json)`; a partir daí, todo o resto confia no formato.

**Conceito por trás — *parse, don't validate*.** Em vez de espalhar checagens ("será que
`transacoes` existe?") pelo código, há **um** ponto que converte a entrada bruta num tipo já
garantido. Depois dele, ninguém precisa desconfiar.

**Armadilha.** `JSON.parse` **lança** exceção se o texto estiver corrompido. Quem chama
(`storage.carregarEstado`) envolve num `try/catch` e cai pro `estadoInicial()` — ou seja, um
`dados.json` corrompido não trava o app, ele abre vazio (e os backups salvam o dia).

---

<a id="8"></a>
## 8. Recapitulando os padrões deste arquivo

| Padrão | Assinatura / idioma | Exemplos |
|---|---|---|
| **Adicionar** | `{ ...estado, lista: [...lista, novo] }` | `adicionarTransacao`, `adicionarCartao`, `registrarPagamentoFatura`, `registrarReserva` |
| **Atualizar** | `.map(x => x.id===id ? {...x,...patch} : x)` | `atualizarTransacao`, `atualizarCartao` |
| **Remover** | `.filter(x => x.id !== id)` | `removerTransacao`, `removerCartao`, `removerPagamentoFatura` |
| **Upsert** | `filter(fora da chave)` + `concat(novo)` | `definirFatura`, `definirPlanejamento` |
| **Apagar no zero** | `if (v <= 0) return semAquele` | `definirPlanejamento` |
| **Efeito coerente** | garantir categoria em `config` | `definirPlanejamento`, `categorizarLote` |
| **Composição** | `novo = outraFuncao(novo, ...)` | `categorizarLote` + `adicionarRegra` |
| **Lote com `Set`** | `const alvo = new Set(ids)` | `categorizarLote`, `repetirPlanejamento` |
| **Ledger de sinal** | um array, valor `>0`/`<0` | `registrarReserva` |
| **Merge raso de config** | `{ ...cfg, ...patch }` | `definirMetas`, `migrar` |
| **Fronteira de dado** | `carregar` → `migrar` | `carregar` |

## Conceitos que este arquivo ensina

Facade/barrel module · reducer & imutabilidade · *functional core, imperative shell* · spread
raso vs. recriação explícita de ramos · upsert imutável · `Set` para pertencimento O(1) ·
composição de funções puras · allow-list vs. `...dados` (permissivo × rígido) · optional chaining ·
defaults de parâmetro · *parse, don't validate*.

## Em uma frase
"É a **mesa de operações** do app: um conjunto de funções puras `(estado, dados) → novo estado`
que a UI chama pra mudar qualquer coisa — sempre criando um estado novo, nunca mutando o antigo,
nunca salvando (isso é trabalho da casca)."
