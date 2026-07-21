# `src/core/model.js` — explicado linha a linha

> **Papel no projeto:** é a **fundação de dados**. Define o *formato* do estado (o que
> vira o `dados.json`), o estado inicial vazio, a **migração** de arquivos antigos e um
> punhado de *helpers puros* (dinheiro, texto, datas) que o resto do núcleo reusa.
>
> **Por que começar por aqui:** o app inteiro é uma função do `estado`. Se você entende
> a *forma* do estado, todo o resto (`calculos.js`, `app.js`…) passa a ser "só" ler e
> transformar essa forma.
>
> **"Puro" quer dizer:** o arquivo não toca no DOM nem no Node (`fs`, `path`). Roda
> idêntico no navegador, no Electron e nos testes. Isso é o que permite `npm run test:core`
> testar a lógica sem abrir janela nenhuma. Guarde o termo **"functional core, imperative
> shell"** — o núcleo calcula, e as bordas sujas (arquivo, tela) ficam no `main.js`/`app.js`.

Índice dos blocos:
1. [Cabeçalho e `SCHEMA_VERSION`](#1)
2. [`MESES_PT`](#2)
3. [`CONFIG_PADRAO` — a configuração padrão](#3)
4. [`estadoInicial()` — o coração do modelo](#4)
5. [`novoId()` — gerando identificadores](#5)
6. [Dinheiro: centavos × reais](#6)
7. [`normalizar()` — texto pra comparação](#7)
8. [Datas: `mesDe`, `rotuloMes`, `somaMeses`](#8)
9. [`migrar()` — migração versionada](#9)
10. [`structuredCloneSafe()`](#10)

---

<a id="1"></a>
## 1. Cabeçalho e `SCHEMA_VERSION`

```js
// model.js — schema, estado inicial, migração e helpers puros.
// Sem DOM, sem Node: roda igual no navegador, no Electron e nos testes.

export const SCHEMA_VERSION = 1;
```

**O que faz.** Declara a versão do *schema* (formato) dos dados. Hoje é `1`.

**Por quê.** Um app que salva em arquivo precisa lidar com a evolução do formato: amanhã
você adiciona um campo, muda a estrutura de `cartoes`… Os arquivos salvos com o formato
antigo continuam no disco. Guardar um número de versão **junto do dado** deixa o código
decidir "este arquivo é da v1, preciso convertê-lo pra v2". Ver o bloco 9 (`migrar`).

**Conceito por trás — versionamento de schema.** É o mesmo princípio das *migrations* de
banco de dados (Rails, Django, Flyway). A diferença: aqui não há banco, é um JSON solto,
então a "migração" é uma função JS que roda toda vez que o arquivo é carregado.

**Sintaxe — `export const`.** `export` torna o símbolo importável por outro módulo ESM
(`import { SCHEMA_VERSION } from './model.js'`). `const` = não pode ser reatribuído. Em ESM
cada arquivo é um *módulo* com escopo próprio; nada "vaza" pro global sem `export`.

---

<a id="2"></a>
## 2. `MESES_PT`

```js
export const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
```

**O que faz.** Um array com os nomes dos meses em português, índice 0 = Janeiro.

**Por quê.** O `Date` do JavaScript formata mês em inglês por padrão, e o app é 100% pt-BR.
Uma tabela fixa é simples e não depende de *locale* do sistema. Usado em `rotuloMes` (bloco 8).

**Armadilha — índice base 0.** `MESES_PT[0]` é Janeiro, mas humanos falam "mês 1 = Janeiro".
Por isso, sempre que converter número→nome você verá `mes - 1` (ver `rotuloMes`). Errar esse
`-1` é o clássico *off-by-one*.

---

<a id="3"></a>
## 3. `CONFIG_PADRAO` — a configuração padrão

```js
// Categorias/listas iniciais (herdadas da planilha FinanWise 2026).
export const CONFIG_PADRAO = {
  moeda: 'BRL',
  categorias: [
    'Salário', 'Vale Alimentação', 'Investimento', 'Saque Investimento',
    'Venda', 'Mercado', 'Alimentação', 'Padaria', 'Farmácia', 'Saúde',
    'Psicanálise', 'Transporte', 'Gasolina', 'Assinaturas', 'Lazer',
    'Educação', 'Vestuário', 'Casa', 'Fatura', 'Tarifas bancárias',
    'Saque', 'Impostos', 'Transferência entre contas', 'Outros',
  ],
  formasPagamento: [
    'Pix', 'Dinheiro', 'Transferência bancária', 'Débito', 'Boleto', 'Cartão',
  ],
  classificacoes: ['Essencial', 'Não essencial'],
  // meta da reserva de emergência, em meses de gasto médio (a "Reserva PM" da planilha)
  reservaMetaMeses: 6,
```

**O que faz.** Define as listas e ajustes com que o app **nasce** — herdados da planilha
*FinanWise 2026* que este projeto reconstrói. `moeda`, as `categorias` de lançamento, as
`formasPagamento`, as `classificacoes` (Essencial × Não essencial) e a meta de reserva
padrão (6 meses de gasto). O comentário logo acima do `export const` (`// Categorias/listas
iniciais...`) é o resumo de uma linha do bloco inteiro — o tipo de comentário que vale a
pena escrever no topo de qualquer bloco de dados grande.

**Por quê separar `config` do resto do estado.** Tudo aqui é *editável pelo usuário* e é
"configuração", não "dado transacional". Manter num sub-objeto `config` deixa claro o que é
ajuste (some com um `migrar` que reescreve defaults) versus o que é histórico (as transações,
sagradas). Ver `estadoInicial` (bloco 4).

```js
  // calculadora de metas (ver metas.js). Valores em branco/zero de propósito: os números
  // reais (renda, patrimônio) o usuário preenche na tela — não entram no git.
  metas: {
    // componentes da renda mensal (salário, benefícios, bolsa...); a soma é a renda.
    rendaComponentes: [{ nome: 'Salário', valor: 0 }],
    patrimonioInvestido: 0, // quanto já está investido (informado à mão — app é offline)
    aporteMensal: 0,        // quanto se guarda/investe por mês (ritmo rumo às metas)
    taxaAnual: 0.10,        // rendimento anual esperado dos investimentos (projeção de prazo)
    libFinanceiraMeses: 6,  // "liberdade financeira" = ter N meses de renda guardados
    dividendosYield: 0.10,  // "viver de dividendos" = renda passiva ≥ renda, a este yield a.a.
  },
```

**O que faz.** Os parâmetros da *calculadora de metas* (detalhada em `metas.js`): componentes
da renda mensal, patrimônio já investido, aporte mensal, rendimento anual esperado, e as duas
metas — "liberdade financeira" (ter N meses de renda guardados) e "viver de dividendos" (renda
passiva ≥ renda, a um *yield* anual). Repare que o comentário acima do bloco já avisa: os
valores nascem em branco/zero de propósito (dado real fica de fora do git); e cada campo tem
seu comentário inline — a documentação mora **ao lado** do dado, não num arquivo à parte que
ninguém lê.

**Por que os valores começam em 0.** Decisão deliberada: os números reais (sua renda, seu
patrimônio) o usuário digita na tela e ficam **fora do git** (o `dados.json` está no
`.gitignore`). O código versiona a *estrutura*, nunca o dado financeiro real.

**Sintaxe — `0.10`.** É um `Number` (float). `taxaAnual: 0.10` = 10% ao ano. Guardar taxa como
fração (0.10) e não como "10" evita ambiguidade na conta (`valor * taxaAnual`).

```js
  regras: [], // regras de categorização do usuário (ver regras.js)
  // Textos que identificam VOCÊ no extrato (CPF, nome). Um Pix seu para você
  // mesmo (BTG -> Sicredi) não é ganho nem gasto: vira tipo "transferencia" e
  // fica fora dos totais, senão os dois lados incham.
  contasProprias: [],
  // Descrições de PAGAMENTO DE FATURA do cartão no extrato. Isso NÃO é gasto novo:
  // a parcela já conta como saída no mês da fatura (calculos.js). Se o pagamento do
  // extrato contasse também, o mesmo dinheiro sairia duas vezes. Na importação vira
  // "transferencia" (fora dos totais). Casa por trecho, sem acento/caixa; editável.
  padroesFaturaPagamento: ['pagamento de fatura', 'pagamento fatura', 'pagto fatura'],
};
```

**O que faz.** Três listas que ensinam o app a interpretar o extrato do banco — e repare que
cada uma carrega, literalmente ao lado do dado, o comentário que documenta *por que* ela existe
(o mesmo espírito do bloco `metas` acima):
- `regras`: regras de auto-categorização do usuário (ver `regras.js`) — ex.: "descrição que
  contém `IFOOD` → categoria Alimentação".
- `contasProprias`: textos que identificam **você** no extrato (CPF, nome). Um Pix seu → pra
  você mesmo (ex.: BTG → Sicredi) **não é** ganho nem gasto; vira `tipo: 'transferencia'` e
  fica fora dos totais, senão os dois lados incham.
- `padroesFaturaPagamento`: descrições de *pagamento de fatura* de cartão. Isso **não é gasto
  novo** — a parcela já entra como saída no mês da fatura (ver `calculos.js`). Se o pagamento
  do extrato também contasse, o mesmo dinheiro sairia **duas vezes** (foi um bug real, resolvido
  na sessão 12). Casa por *trecho*, sem acento/caixa; é editável.

**Conceito por trás — "dados como configuração".** Em vez de espalhar `if descrição inclui
"ifood"` pelo código, o comportamento vira uma *lista de dados* que o usuário controla. Isso é
uma forma leve de **motor de regras** (rules engine): a lógica é fixa ("casar padrão → aplicar
categoria"), mas os padrões são dado, não código.

---

<a id="4"></a>
## 4. `estadoInicial()` — o coração do modelo

```js
// Estado vazio (começar do zero: só estrutura + categorias, sem transações).
export function estadoInicial() {
  return {
    schemaVersion: SCHEMA_VERSION,
    config: structuredCloneSafe(CONFIG_PADRAO),
    cartoes: [],
    transacoes: [],
    pagamentosFatura: [],
    // faturas informadas pelo banco (quando você não lançou as compras uma a uma):
    // { id, cartaoId, mes: "2026-08", total, fonte: "banco" }
    faturas: [],
    // orçamento por mês/categoria (a aba "Planejamento PM" da planilha):
    // { id, mes: "2026-07", categoria: "Mercado", estimado: 800.00 }
    planejamentos: [],
    // reserva de emergência (a aba "Reservas PM"): movimentos de guardar/resgatar.
    // { id, mes: "2026-07", valor: 500.00 (>0 aporta, <0 resgata), obs, criadoEm }
    reservas: [],
  };
}
```

**O que faz.** Devolve um **estado vazio, porém válido** — só a estrutura e as categorias
padrão, sem nenhuma transação. É o que o app usa quando não existe `dados.json` ainda.

**Este objeto É o `dados.json`.** Serializado com `JSON.stringify`, este é exatamente o
formato salvo em disco. Cada chave:

| Chave | O que guarda |
|---|---|
| `schemaVersion` | a versão do formato (bloco 1) |
| `config` | a configuração editável (bloco 3) |
| `cartoes` | cartões de crédito cadastrados `{ id, nome, fechamento, vencimento }` |
| `transacoes` | **o histórico** — entradas, saídas, compras de cartão |
| `pagamentosFatura` | quando você pagou faturas (e adiantamentos) |
| `faturas` | totais de fatura informados pelo banco (quando não lançou compra a compra) |
| `planejamentos` | orçamento por mês/categoria |
| `reservas` | movimentos da reserva de emergência (guardar/resgatar) |

**Os comentários acima de `faturas`, `planejamentos` e `reservas` não são bobagem.** Cada um
mostra a **forma exata** do registro que vai morar naquele array — `{ id, cartaoId, mes,
total, fonte }` para fatura, `{ id, mes, categoria, estimado }` para planejamento, `{ id, mes,
valor, obs, criadoEm }` para reserva. Como o arquivo não tem TypeScript nem schema formal, esse
comentário **é** o contrato de campos: quem for ler ou escrever nesses arrays sabe o que
esperar sem precisar caçar em `index.js` onde cada um é criado.

**Por que uma *função* e não uma *constante*.** Se fosse `export const ESTADO_INICIAL = {...}`,
todos os que importassem apontariam pro **mesmo objeto**, e um `estado.transacoes.push(...)`
em um lugar contaminaria todos os outros (arrays/objetos são passados por **referência**). Uma
*factory function* devolve um objeto **novo** a cada chamada. Esse é o mesmo motivo pelo qual,
no React, `useState` recebe uma função ou um valor fresco.

**Por que `structuredCloneSafe(CONFIG_PADRAO)`.** Mesmo problema: se colocasse `config:
CONFIG_PADRAO` direto, o estado compartilharia o **mesmo** objeto de config da constante
global. Editar `estado.config.categorias` mutaria o `CONFIG_PADRAO` pra sempre (e pra todos).
O *clone profundo* (bloco 10) corta esse laço. **Cópia rasa não bastaria** aqui: `categorias`,
`metas`, etc. são aninhados — `{ ...CONFIG_PADRAO }` copiaria o objeto de cima, mas
`categorias` ainda seria o mesmo array compartilhado.

**Conceito por trás — imutabilidade e *shared mutable state*.** O bug mais traiçoeiro em JS é
dois lugares mexendo no mesmo objeto sem saber. O núcleo inteiro é escrito pra **nunca mutar**
o estado: cada operação devolve um estado novo (ver `index.js`). `estadoInicial` é a primeira
peça dessa disciplina.

---

<a id="5"></a>
## 5. `novoId()` — gerando identificadores

```js
// ---- IDs -------------------------------------------------------------
let _contador = 0;
export function novoId(prefixo = 'id') {
  _contador += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefixo}_${Date.now().toString(36)}${_contador.toString(36)}${rnd}`;
}
```

**O que faz.** Cria um ID textual único, tipo `tx_l4k2p3f8a9x1`. Cada transação, cartão,
pagamento etc. ganha o seu (ver as mutações em `index.js`: `novoId('tx')`, `novoId('card')`…).

**Como faz (peça por peça):**
- `prefixo = 'id'` — *default parameter*: se chamar `novoId()` sem argumento, `prefixo` vira
  `'id'`. Ajuda a ler o dado (`tx_…` é transação, `card_…` é cartão).
- `_contador += 1` — um contador que sobrevive entre chamadas (ver "conceito" abaixo). Garante
  que dois IDs criados **no mesmo milissegundo** ainda difiram.
- `Date.now().toString(36)` — o timestamp em milissegundos convertido pra **base 36**
  (dígitos `0-9a-z`). Base 36 encurta o número (fica mais curto que decimal) e ordena no tempo.
- `Math.random().toString(36).slice(2, 8)` — 6 caracteres aleatórios. `Math.random()` dá algo
  como `0.abcd…`; `.toString(36)` vira `"0.k3j…"`; `.slice(2, 8)` joga fora o `"0."` e pega 6.
- *Template literal* (crases) monta tudo: `prefixo_timestampcontadoraleatório`.

**Conceito por trás — *closure* / estado de módulo.** `_contador` é declarado **fora** da
função, no escopo do módulo, mas a função o **enxerga e altera**. Isso é uma *closure*: a
função "lembra" da variável do escopo onde foi criada. Como o `_contador` vive enquanto o
módulo estiver carregado, ele funciona como um **singleton** (um estado global privado do
módulo). O `_` no nome é convenção pra "interno, não mexa de fora" (JS não tem `private` de
módulo — só não exportar).

**Alternativas e trade-offs.**
- `crypto.randomUUID()` — nativo, padrão, colisão praticamente impossível. **Por que não aqui?**
  Provavelmente pra manter IDs curtos e legíveis, e porque a unicidade local (um usuário, um
  arquivo) não exige a força de um UUID. Trade-off: `novoId` **não** é criptograficamente seguro
  nem globalmente único — e não precisa ser.
- Um simples `_contador++` sem aleatório/tempo — quebraria se dois dispositivos gerassem IDs no
  mesmo arquivo (o autor usa duas máquinas). O tempo+random reduz a chance de colisão nesse caso.

**Armadilha.** `_contador` reinicia em 0 toda vez que o app recarrega (é memória, não disco).
A unicidade **entre sessões** vem do `Date.now()` + random, não do contador. O contador só
resolve o "mesmo milissegundo, mesma sessão".

---

<a id="6"></a>
## 6. Dinheiro: centavos × reais

```js
// ---- Dinheiro (evita erro de float somando em centavos) --------------
export function paraCentavos(reais) {
  return Math.round(Number(reais) * 100);
}
export function paraReais(centavos) {
  return centavos / 100;
}
export function somaCentavos(valores) {
  return valores.reduce((acc, v) => acc + paraCentavos(v), 0);
}
export function formatarBRL(reais) {
  const n = Number(reais) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
```

**O ponto mais importante do arquivo — leia com calma.** No `dados.json`, o dinheiro é guardado
em **reais** como `Number` (ex.: `valor: 5000` é R$ 5.000,00, e `formatarBRL(5000)` produz
`"R$ 5.000,00"`). O `CLAUDE.md` diz "dinheiro em centavos" — isso se refere à **disciplina na
hora de somar**, não ao armazenamento.

**Por que somar em centavos.** Float binário (IEEE-754) não representa `0,10` exatamente. O
exemplo canônico: `0.1 + 0.2 === 0.30000000000000004`. Numa planilha de finanças, isso vira
centavo fantasma. A defesa: converter cada valor pra **inteiro de centavos** (`Math.round(reais
* 100)`), somar inteiros (que são exatos), e só então voltar pra reais. É o que `somaCentavos`
faz — usado, por exemplo, para provar que **a soma das parcelas fecha o valor da compra** (uma
invariante sagrada do app).

**Como `somaCentavos` faz — `reduce`.** `valores.reduce((acc, v) => acc + paraCentavos(v), 0)`
percorre o array acumulando: começa em `0` (o segundo argumento), e pra cada `v` soma
`paraCentavos(v)` ao acumulador `acc`. `reduce` é o *pattern* de "dobrar uma lista num único
valor" (fold). Resultado: o total **em centavos** (inteiro).

**Sintaxe — `Number(reais) || 0` em `formatarBRL`.** `Number("abc")` é `NaN`; `NaN || 0` cai
pro `0` (NaN é *falsy*). É uma guarda defensiva: nunca formata `NaN`. Cuidado com a pegadinha
do `||`: `Number(0) || 0` também vira `0` — aqui tudo bem, mas em outros contextos `|| 0`
engole o zero legítimo (o operador moderno `??` só cairia no default se fosse `null`/`undefined`).

**`toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`** delega a formatação
monetária ao motor `Intl` do próprio JS: separador de milhar `.`, decimal `,`, prefixo `R$`.
Nada de montar string na mão.

**Armadilha central.** Como o **armazenamento é em reais float**, some sempre pelos helpers de
centavos quando o resultado precisar bater ao centavo. Somar `reais` cru com `+` acumula erro.

---

<a id="7"></a>
## 7. `normalizar()` — texto pra comparação

```js
// ---- Texto -----------------------------------------------------------
// Tira acento, caixa e espaço extra. Usado para comparar descrição de extrato
// com regra de categorização ("Farmácia" casa com "FARMACIA SAO JOAO").
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

**O que faz.** Reduz um texto a uma forma "canônica" pra **comparar sem esbarrar em acento,
caixa ou espaço**. Assim uma regra `"Farmácia"` casa com `"FARMACIA SAO JOAO"` no extrato.

**Como faz (encadeamento de transformações):**
- `String(s || '')` — se `s` for `null`/`undefined`, vira `''` (não quebra).
- `.normalize('NFD')` — decompõe cada letra acentuada em *letra base + acento separado*
  (`"á"` → `"a"` + `◌́`). É a normalização Unicode NFD.
- `.replace(/[\u0300-\u036f]/g, '')` — remove os acentos combinantes (a faixa `U+0300–U+036F`
  é o bloco "combining diacritical marks"). Sobra a letra base. **Este é o truque clássico de
  "remover acentos" em JS.**
- `.replace(/\s+/g, ' ')` — colapsa qualquer sequência de espaços/tabs em um espaço só.
- `.trim()` — tira espaço das pontas.
- `.toLowerCase()` — tudo minúsculo.

**Sintaxe — regex.** `/\s+/g`: `\s` = qualquer espaço, `+` = um ou mais, `g` = global (todas as
ocorrências, não só a primeira). `/[\u0300-\u036f]/g`: uma *classe de caracteres* por intervalo
de código Unicode.

**Conceito por trás — normalização/canonicalização.** Comparar entrada humana "suja" exige
reduzir variações irrelevantes a uma forma única antes de comparar. Todo sistema de busca faz
isso (*case-folding*, remoção de diacríticos).

**Armadilha.** NFD + remoção de combinantes funciona pro português, mas **não** transforma
caracteres especiais como `ç`→`c` em todos os casos (o cedilha às vezes é um caractere próprio,
não base+combinante — embora em NFD o `ç` normalmente decomponha). Pra este app (pt-BR de
extrato bancário) cobre o que precisa; num sistema i18n mais amplo você usaria uma lib.

---

<a id="8"></a>
## 8. Datas: `mesDe`, `rotuloMes`, `somaMeses`

```js
// ---- Datas -----------------------------------------------------------
// mesDe("2026-02-16") -> "2026-02"
export function mesDe(dataISO) {
  return String(dataISO).slice(0, 7);
}
```
**O que faz.** `mesDe("2026-02-16")` → `"2026-02"`. Como as datas são strings ISO
(`AAAA-MM-DD`), o mês é literalmente os 7 primeiros caracteres. Simples e à prova de fuso
(não cria `Date`, então não há surpresa de timezone).

```js
// rotuloMes("2026-02") -> "Fevereiro 2026"
export function rotuloMes(mesISO) {
  const [ano, mes] = String(mesISO).split('-').map(Number);
  return `${MESES_PT[(mes || 1) - 1]} ${ano || ''}`.trim();
}
```
**O que faz.** `rotuloMes("2026-02")` → `"Fevereiro 2026"` (pra mostrar na tela).
**Sintaxe — destructuring + `map(Number)`.** `"2026-02".split('-')` → `["2026","02"]`;
`.map(Number)` converte cada item pra número → `[2026, 2]`; `const [ano, mes] = ...`
*desestrutura* o array em duas variáveis. O `(mes || 1) - 1` traduz "mês 2" pro índice 1 de
`MESES_PT` (o `-1` do off-by-one; o `|| 1` protege contra `mes` inválido).

```js
// somaMeses("2026-11", 3) -> "2027-02"
export function somaMeses(mesISO, n) {
  let [ano, mes] = String(mesISO).split('-').map(Number);
  const total = (ano * 12 + (mes - 1)) + n;
  const nAno = Math.floor(total / 12);
  const nMes = (total % 12) + 1;
  return `${nAno}-${String(nMes).padStart(2, '0')}`;
}
```
**O que faz.** Anda `n` meses (`n` pode ser negativo). `somaMeses("2026-11", 3)` → `"2027-02"`.
**Como faz — aritmética em "meses absolutos".** O truque: converter (ano, mês) num **único
número** de meses desde o ano 0 → `ano*12 + (mes-1)`. Somar `n` nesse espaço linear é trivial e
**lida com a virada de ano de graça**. Depois desfaz: `Math.floor(total/12)` = ano,
`total % 12` = índice do mês (+1 pra voltar a "humano"). `padStart(2, '0')` garante `"02"` e
não `"2"`, mantendo o formato `AAAA-MM`.
**Por que não usar `Date`.** `new Date(2026, 10+3, 1)` até funcionaria, mas `Date` arrasta fuso
horário, horário de verão e mutabilidade. Para "só meses", a aritmética inteira é mais previsível
e testável. **Conceito:** representar o dado num espaço onde a operação fica linear — a mesma
ideia de converter dinheiro pra centavos antes de somar.

---

<a id="9"></a>
## 9. `migrar()` — migração versionada

```js
// ---- Migração --------------------------------------------------------
// Recebe qualquer JSON carregado e devolve um estado no schema atual.
export function migrar(dados) {
  const base = estadoInicial();
  if (!dados || typeof dados !== 'object') return base;
  const out = {
    // Preserva campos DESCONHECIDOS do arquivo. Sem isso, uma versão antiga do app
    // (o .exe do pendrive costuma ficar pra trás da máquina que buildou por último)
    // lê o dados.json novo, não reconhece os blocos que ainda não existiam nela e os
    // descarta em silêncio na primeira gravação. Aconteceria com planejamentos/reservas
    // se o build de 14/07/2026 abrisse este arquivo. Campo novo sobrevive a build velho.
    ...dados,
    schemaVersion: SCHEMA_VERSION,
    config: { ...base.config, ...(dados.config || {}) },
    cartoes: Array.isArray(dados.cartoes) ? dados.cartoes : [],
    transacoes: Array.isArray(dados.transacoes) ? dados.transacoes : [],
    pagamentosFatura: Array.isArray(dados.pagamentosFatura) ? dados.pagamentosFatura : [],
    faturas: Array.isArray(dados.faturas) ? dados.faturas : [],
    planejamentos: Array.isArray(dados.planejamentos) ? dados.planejamentos : [],
    reservas: Array.isArray(dados.reservas) ? dados.reservas : [],
  };
  // Futuras migrações por versão entram aqui (if dados.schemaVersion < N ...).
  return out;
}
```

**O que faz.** Recebe **qualquer** JSON carregado do disco e devolve um estado **garantidamente
válido** no schema atual: preenche o que falta, corrige tipos e marca a versão. É a fronteira
entre "arquivo não confiável" e "estado que o resto do código pode assumir como correto".

**Como faz, peça por peça:**
- `if (!dados || typeof dados !== 'object') return base;` — arquivo vazio, `null`, ou corrompido
  (não-objeto) → volta o estado inicial. Guarda de sanidade.
- `...dados` (espalha primeiro) — **copia todos os campos do arquivo**, inclusive os que este
  código nem conhece. Ver o "porquê" abaixo — é a parte mais importante.
- As chaves seguintes **sobrescrevem** o que veio de `...dados`, garantindo tipo certo:
  - `schemaVersion: SCHEMA_VERSION` — carimba a versão atual.
  - `config: { ...base.config, ...(dados.config || {}) }` — *merge* raso: começa dos defaults
    (`base.config`) e sobrepõe o que o arquivo tinha. Assim, uma `config` antiga que não tinha
    `padroesFaturaPagamento` **ganha** o default novo, mas mantém as categorias que o usuário
    editou.
  - cada array: `Array.isArray(x) ? x : []` — se o campo não for array (faltando, ou corrompido),
    usa `[]`. Blindagem de tipo.

**Por que `...dados` ANTES das chaves conhecidas (o caso real que motivou).** A ordem importa:
espalhar `dados` primeiro e depois fixar as chaves conhecidas significa **"preserve tudo que eu
não conheço; force o tipo do que eu conheço"**. Sem o `...dados`, um campo novo que ainda não
existisse *nesta versão do código* seria **descartado em silêncio** na primeira gravação.

Isso não é teórico: o `.exe` do pendrive costuma ficar **atrás** da máquina que buildou por
último. Se um build de 14/07/2026 (sem `planejamentos`/`reservas`) abrisse um `dados.json` novo
que já tem esses blocos, e o `migrar` **não** tivesse o `...dados`, ele apagaria
planejamentos e reservas na primeira gravação — perda de dado silenciosa. O `...dados` faz
**campo novo sobreviver a build velho**.

**Sintaxe — spread + shorthand + short-circuit.**
- `{ ...a, ...b, chave: valor }` — *object spread*; chaves posteriores vencem as anteriores.
- `dados.config || {}` — se `config` for *falsy*, usa objeto vazio (evita espalhar `undefined`).
- `Array.isArray(x)` — o jeito certo de checar array (`typeof [] === 'object'`, então `typeof`
  não serve).

**Conceito por trás — *tolerant reader* / *defensive parsing*.** "Seja rígido no que emite,
tolerante no que aceita" (robustness principle). A função assume que o arquivo pode estar
incompleto, velho ou torto, e **normaliza** tudo pra um formato confiável. O resto do app pode
então confiar que `estado.transacoes` é sempre um array. É a mesma ideia de um *anti-corruption
layer*: um ponto único onde o mundo externo é saneado.

**Onde entram migrações futuras.** O comentário `// Futuras migrações por versão entram aqui`
marca o lugar: quando o schema virar 2, você faz `if (dados.schemaVersion < 2) { …converte… }`
antes do `return`. Hoje só há a v1, então o trabalho é só normalizar.

**Armadilha.** O merge de `config` é **raso**. Se um dia `config.metas` mudar de forma (campo
aninhado renomeado), `{ ...base.config, ...dados.config }` traria o `metas` **inteiro** do
arquivo antigo, sem os campos novos de `metas`. Sub-objetos que evoluem exigem merge próprio —
algo a lembrar quando o schema crescer.

---

<a id="10"></a>
## 10. `structuredCloneSafe()`

```js
function structuredCloneSafe(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}
```

**O que faz.** Cópia **profunda** (deep clone) de um objeto — usado no `estadoInicial` pra clonar
`CONFIG_PADRAO`. Note que **não** tem `export`: é privado do módulo (detalhe interno).

**Como faz — com fallback.** `structuredClone` é uma função global moderna (Node 17+, browsers
atuais) que clona profundamente lidando com estruturas complexas. Se não existir (ambiente
antigo), cai no truque clássico `JSON.parse(JSON.stringify(obj))`: serializa pra texto e
re-parseia, o que naturalmente cria objetos novos em todos os níveis.

**Conceito por trás — deep clone × shallow clone.**
- *Shallow* (`{ ...obj }`, `Object.assign`): copia só o primeiro nível; sub-objetos continuam
  **compartilhados** (mesma referência).
- *Deep*: copia recursivamente; nada é compartilhado. Necessário aqui porque `CONFIG_PADRAO` tem
  arrays e objetos aninhados (`categorias`, `metas`) que **não** podem ser compartilhados entre
  o default global e o estado do usuário.

**Alternativas e trade-offs.**
- `JSON.parse(JSON.stringify(x))` sozinho: funciona pra dado "JSON puro" (que é o caso), mas
  **perde** `Date`, `Map`, `Set`, `undefined`, funções. Como `CONFIG_PADRAO` é só string/número/
  array/objeto, é seguro — por isso serve de fallback.
- `structuredClone`: mais robusto e rápido, mas nem todo runtime antigo tem. Daí o *feature
  detection* (`typeof structuredClone === 'function'`) escolher o melhor disponível.

**Padrão — *feature detection* com fallback.** Em vez de assumir a API nova, o código **testa**
se ela existe e degrada graciosamente. É o mesmo espírito do `storage.js` (usa `window.finanwise`
se houver, senão `localStorage`).

---

## Conceitos que este arquivo ensina (recapitulando)

| Conceito | Onde aparece |
|---|---|
| Versionamento de schema / migrations | `SCHEMA_VERSION`, `migrar` |
| Função pura / *functional core* | o arquivo todo (sem DOM/Node) |
| Factory function × constante compartilhada | `estadoInicial` |
| Imutabilidade e *shared mutable state* | `estadoInicial`, `structuredCloneSafe` |
| Deep clone × shallow clone | `structuredCloneSafe`, merge de `config` |
| Float de dinheiro → somar em centavos | `paraCentavos`/`somaCentavos` |
| Normalização Unicode (NFD, diacríticos) | `normalizar` |
| Aritmética em espaço linear (meses absolutos) | `somaMeses` |
| Closure / estado de módulo (singleton) | `novoId` (`_contador`) |
| *Tolerant reader* / parsing defensivo | `migrar` |
| Feature detection com fallback | `structuredCloneSafe` |
| Dados como configuração (rules engine leve) | `CONFIG_PADRAO.regras/contasProprias/…` |

## Se você fosse explicar este arquivo em uma frase
"É o **contrato de dados** do app: diz qual é a forma do estado, como nasce um estado vazio, como
transformar um arquivo velho num estado válido, e oferece os utilitários puros (dinheiro, texto,
data) que todo o resto reusa — tudo sem tocar em tela nem em disco."
