# `test/core.test.mjs` — explicado

> **O que é este arquivo:** a suíte de testes do núcleo puro (`src/core`). 20 testes,
> um arquivo só, rodando com `node:test` — o runner **nativo** do Node, sem
> dependência externa nenhuma.
>
> **Papel na arquitetura:** é a **única rede de segurança** do núcleo. `src/core` não
> tem DOM, não abre janela, não toca em disco — por isso dá pra testar em
> milissegundos, sem Electron. Cada função de `calculos.js`, `model.js`, `index.js` etc.
> que este projeto documentou em `docs/estudo/*.explicado.md` tem, aqui, a prova de que
> **se comporta como o documento diz**. Se um teste quebra, ou o código mudou por
> engano, ou a documentação está desatualizada — os dois merecem investigação.
>
> **Como rodar:** `npm run test:core`. É rápido o bastante para rodar **antes de
> qualquer commit** que toque `src/core` — não há desculpa para pular.
>
> **Pré-requisitos:** o ideal é já ter lido pelo menos
> [`model.explicado.md`](./model.explicado.md) e [`calculos.explicado.md`](./calculos.explicado.md)
> (padrão-ouro deste conjunto de docs) — os testes deste arquivo cobrem, na mesma
> ordem, as funções que aqueles arquivos explicam linha a linha. Onde fizer diferença,
> este doc também aponta para [`faturas`](./faturas.explicado.md),
> [`parcelas`](./parcelas.explicado.md), [`score`](./score.explicado.md),
> [`planejamento`](./planejamento.explicado.md), [`reserva`](./reserva.explicado.md),
> [`metas`](./metas.explicado.md) e [`index.js`](./index.explicado.md) — é lá que mora
> a implementação; aqui mora a **prova** de que ela funciona.

---

## Preâmbulo — como ler um teste

### Por que `node:test` e não Jest/Vitest

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
```

Essas são as duas primeiras linhas do arquivo, e já ensinam uma decisão de
arquitetura: o projeto **não instala** um framework de teste. `node:test` e
`node:assert/strict` são módulos **embutidos** no Node (desde a v18), sem `npm install`,
sem `node_modules` extra, sem versão pra atualizar. Para um app **offline e portátil**
(roda do pendrive, `CLAUDE.md` é categórico sobre isso), cada dependência a menos é uma
fonte a menos de "funcionava na minha máquina". Jest ou Vitest trariam recursos a mais
(mocks embutidos, watch mode, snapshot testing) — recursos que este núcleo, sendo
**puro** e pequeno, não precisa. É o mesmo espírito de "vanilla JS" que rege
`src/ui/app.js`: menos peça móvel, mais previsibilidade.

### A anatomia de um teste: arrange — act — assert

Todo teste deste arquivo segue o mesmo esqueleto de três fases, mesmo sem comentário
marcando cada uma:

1. **Arrange** (organizar) — monta o cenário mínimo: um `estadoInicial()`, talvez um
   cartão, uma ou duas transações. Sempre os **dados mínimos** que provam o ponto —
   nunca uma fixture gigante "realista".
2. **Act** (agir) — chama a função sob teste com esse cenário.
3. **Assert** (verificar) — `assert.equal`/`assert.deepEqual`/`assert.ok` comparam o
   resultado com o que **deveria** ser.

```js
test('nome que documenta o comportamento', () => {
  // arrange: monta o cenário mínimo
  let e = estadoInicial();
  e = adicionarTransacao(e, { /* ... */ });
  // act: chama a função sob teste
  const r = resumoMes(e, '2026-02');
  // assert: compara com o esperado
  assert.equal(r.entradas, 3000);
});
```

### `assert` vs `assert/strict`

`node:assert/strict` usa `===` (igualdade estrita) e `deepStrictEqual` por baixo dos
panos, em vez do `assert` "solto" (que aceita `==` e coerção de tipo). Para um app que
lida com dinheiro, essa rigidez é bem-vinda: `assert.equal(200, '200')` **falharia**
aqui (tipos diferentes), enquanto no `assert` clássico passaria. Testar dinheiro exige
essa precisão de tipo, não só de valor.

### O que faz um bom teste (o padrão que se repete 20 vezes)

- **Um comportamento por teste.** Cada `test(...)` prova **uma coisa**: "a soma das
  parcelas fecha", "a fatura pula um mês depois do fechamento". Isso não é regra
  absoluta neste arquivo — alguns testes verificam vários ângulos do mesmo cenário
  (ex.: `resumoReserva`, com 8 assertivas) — mas cada um gira em torno de **um
  conceito central**, nunca dois assuntos não relacionados no mesmo `test(...)`.
- **Dados mínimos, escolhidos a dedo.** Nenhum teste usa 50 transações quando 2
  bastam. E os valores não são aleatórios: `100 / 3` aparece de propósito (força o
  resíduo de centavo); `2026-02-26` aparece de propósito (é o dia **depois** do
  fechamento). Um bom teste escolhe a **borda** que expõe o comportamento, não o meio
  do caminho confortável.
- **Nome que documenta.** `'parcelas somam exatamente o valor da compra (resíduo na
  última)'` já diz o que o teste garante, **antes** de ler uma linha de código. Rodar
  `npm run test:core` e ler só os nomes que passam já é uma lista de invariantes do
  sistema — uma forma de documentação viva.

### Por que teste trava regressão

Um comentário no meio do código (`// a soma tem que fechar`) é fácil de esquecer,
apagar sem querer, ou nunca ler. Um teste que **falha** quando o comportamento quebra
não depende de ninguém lembrar de nada: ele é executável. O `CLAUDE.md` deste projeto
diz "a soma das parcelas tem que fechar o valor da compra" — isso é uma **regra de
negócio**; o teste da linha 35 é o que a torna **impossível de violar em silêncio**.
Ao longo deste arquivo você vai ver vários testes nascidos de **bugs reais** já
corrigidos (o `PLANO.md` registra as sessões) — cada um é uma cicatriz que virou
vacina: o bug não pode voltar sem que `npm run test:core` grite.

---

## Bloco 0 — os imports

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoInicial, somaMeses, mesDe, rotuloMes,
  mesPrimeiraFatura, parcelasDaTransacao, todasParcelas,
  resumoMes, dinheiroEmConta, scoreSaude,
  resumoAno, anosComMovimento,
  adicionarCartao, adicionarTransacao, carregar,
  definirPlanejamento, removerPlanejamento, repetirPlanejamento, planejamentoDoMes,
  registrarReserva, removerReserva, definirMetaReserva,
  resumoReserva, reservaAcumulada, gastoMedioMensal,
  definirMetas, rendaMensal, resumoMetas, mesesParaAlvo,
} from '../src/core/index.js';
```

**O que faz.** Importa tudo o que os 20 testes vão precisar, num único bloco, de um
único caminho: `../src/core/index.js`.

**Como.** Repare que o import **não** vem de `'../src/core/model.js'`,
`'../src/core/calculos.js'`, `'../src/core/reserva.js'` etc. separadamente — vem todo
de `index.js`, a **fachada** (barrel) descrita em
[`index.explicado.md`](./index.explicado.md#1). O teste usa o núcleo exatamente como a
UI usaria: `import * as C from '../core/index.js'`. Isso é deliberado — testar pela
mesma porta que o app de verdade usa significa que, se algum dia uma função parar de
ser reexportada por engano no barrel, o teste **também** quebra (ele não tem um atalho
que a UI não tem).

**Armadilha que pegaria.** Se alguém, ao mover uma função de um arquivo do core para
outro, esquecesse de adicionar o `export * from` correspondente em `index.js`, o
import aqui falharia imediatamente (`SyntaxError`/`undefined` na desestruturação) —
antes mesmo de qualquer teste rodar. É uma checagem gratuita da integridade do barrel.

---

## Teste 1 — `somaMeses` vira o ano corretamente

```js
test('somaMeses vira o ano corretamente', () => {
  assert.equal(somaMeses('2026-11', 3), '2027-02');
  assert.equal(somaMeses('2026-01', 0), '2026-01');
  assert.equal(somaMeses('2026-12', 1), '2027-01');
});
```

**O que este teste trava.** Que "andar N meses" a partir de qualquer mês do ano
**atravessa a virada de ano** corretamente — a peça de aritmética mais usada do
núcleo inteiro (toda parcela, toda série mensal, todo `resumoAno` depende dela).

**Como.** Três casos, cada um testando uma fronteira diferente: `n=3` cruzando **duas**
viradas de dezembro-pra-janeiro no meio do caminho (nov→dez→jan→fev); `n=0` como
**identidade** (não anda nada — prova que a função não desloca por acidente quando não
deveria); `n=1` sobre a virada **exata** de dezembro. Ver
[`model.explicado.md §8`](./model.explicado.md#8): a técnica por trás é converter
`(ano, mês)` num único inteiro de "meses absolutos" (`ano*12 + (mes-1)`), somar `n`
nesse espaço linear, e desfazer — a virada de ano "acontece de graça" na divisão por
12, sem `if` de calendário.

**Armadilha que pegaria.** Qualquer implementação ingênua com `mes += n; if (mes > 12)
...` escrita à mão erra quando `n` cruza **mais de uma** virada (por isso o teste usa
`n=3`, não `n=1`) ou esquece o `%12` e devolve `"2027-14"`. O caso `n=0` pegaria um bug
sutil onde a função sempre soma pelo menos 1 mês por engano (off-by-one na fórmula).

---

## Teste 2 — `mesDe` e `rotuloMes`

```js
test('mesDe e rotuloMes', () => {
  assert.equal(mesDe('2026-02-16'), '2026-02');
  assert.equal(rotuloMes('2026-02'), 'Fevereiro 2026');
});
```

**O que este teste trava.** Duas conversões de data usadas em toda a UI: extrair o mês
de uma data completa (`mesDe`), e transformar um mês técnico (`"2026-02"`) num rótulo
legível em português (`rotuloMes`).

**Como.** `mesDe` é testado com uma data de meio de mês (dia 16) — não é a borda que
importa aqui, é confirmar que a função **fatia string**, não usa `Date` (ver
[`model.explicado.md §8`](./model.explicado.md#8): `mesDe` é `slice(0,7)`, imune a fuso
horário). `rotuloMes('2026-02')` prova o **mês 2 → "Fevereiro"** — a fronteira
clássica do off-by-one: `MESES_PT[0]` é Janeiro, então mês 2 tem que acessar o índice
1, não o 2.

**Armadilha que pegaria.** Um `MESES_PT[mes]` sem o `-1` devolveria `"Março"` para
`"2026-02"` — o erro de índice mais comum ao converter número-de-1 para índice-de-0.
`assert.equal` compara a **string exata**, então até um espaço a mais (`"Fevereiro
 2026"`) ou capitalização errada (`"fevereiro 2026"`) reprovaria.

---

## Teste 3 — `mesPrimeiraFatura` respeita o fechamento

```js
test('mesPrimeiraFatura respeita o fechamento', () => {
  const cartao = { fechamento: 25, vencimento: 10 };
  // dia 16 <= 25 -> fatura do mês seguinte
  assert.equal(mesPrimeiraFatura('2026-02-16', cartao), '2026-03');
  // dia 26 > 25 -> pula um mês seguinte
  assert.equal(mesPrimeiraFatura('2026-02-26', cartao), '2026-04');
});
```

**O que este teste trava.** A regra de negócio mais "bancária" do app: uma compra feita
**até** o dia de fechamento do cartão cai na fatura do mês seguinte; uma compra feita
**depois** do fechamento pula mais um mês. Ver
[`faturas.explicado.md`](./faturas.explicado.md) — é a única função daquele arquivo, e
é o alicerce de toda a cadeia do cartão.

**Como.** O cartão fecha dia **25**. O teste escolhe as duas datas mais próximas
possíveis da fronteira sem cair exatamente nela: dia **16** (claramente antes) e dia
**26** (um dia **depois** do fechamento — a borda mais apertada que existe). Não testa
o dia 25 exato aqui (isso é coberto de forma implícita pela regra `<=` documentada no
comentário do fonte), mas testa os dois lados imediatamente vizinhos da fronteira.

**Armadilha que pegaria.** Trocar `<=` por `<` no código-fonte (`faturas.js`) — o erro
de fronteira mais silencioso que existe — não mudaria o resultado do dia 16 nem do dia
26 neste teste específico, mas mudaria o resultado do dia **25** exato (não coberto
aqui). Isso é uma lacuna real: o teste prova "antes" e "depois" do fechamento, mas não
prova o **próprio dia** do fechamento — vale como exercício (ver EXERCICIOS.md) pensar
em que teste fecharia essa lacuna.

---

## Teste 4 — parcelas somam exatamente o valor da compra (resíduo na última)

```js
test('parcelas somam exatamente o valor da compra (resíduo na última)', () => {
  const cartao = { id: 'c1', fechamento: 25, vencimento: 10 };
  const tx = {
    id: 't1', tipo: 'cartao', data: '2026-02-16',
    categoria: 'Notebook', valor: 100, cartaoId: 'c1', parcelas: 3,
  };
  const ps = parcelasDaTransacao(tx, cartao);
  assert.equal(ps.length, 3);
  const soma = ps.reduce((a, p) => a + Math.round(p.valor * 100), 0);
  assert.equal(soma, 10000); // R$ 100,00 em centavos
  // meses consecutivos a partir da 1ª fatura
  assert.deepEqual(ps.map((p) => p.mesFatura), ['2026-03', '2026-04', '2026-05']);
  // 100/3 = 33,33 + 33,33 + 33,34
  assert.equal(ps[2].valor, 33.34);
});
```

**O que este teste trava.** A regra mais sagrada do `CLAUDE.md`: **"a soma das
parcelas tem que fechar o valor da compra"**. E, junto, que as parcelas caem em meses
**consecutivos** a partir da primeira fatura.

**Como.** `R$ 100,00 em 3x` é escolhido a dedo — não é um valor "bonito" como R$ 90 ou
R$ 120, que dividiriam exato. `100 / 3 = 33,333…` **força** o resíduo de centavo a
aparecer: se cada parcela fosse arredondada isoladamente (`33,33`), a soma daria
`99,99` — sumiria um centavo. Ver
[`parcelas.explicado.md`](./parcelas.explicado.md#bloco-1--explodir-uma-compra-em-parcelas):
a técnica correta é somar em **centavos inteiros**, dar o **piso** da divisão para cada
parcela, e jogar o **resto** inteiro na **última**. O teste verifica isso em três
camadas: (1) `ps.length === 3` — nasceram as parcelas certas; (2) a soma em centavos
bate exatamente `10000`, não `9999` nem `10001`; (3) `ps[2].valor === 33.34` — a
**terceira** parcela (índice 2, a última) é a que leva o centavo extra, não a
primeira nem a segunda. E ainda confere que os meses de fatura são consecutivos
(`somaMeses(mes1, k-1)` para `k = 1, 2, 3`).

**Armadilha que pegaria.** Qualquer implementação que arredonde `valor/n` parcela a
parcela (em vez de trabalhar em centavos com resto na última) faria a soma dar
`99.99` em vez de `100.00` — o teste pegaria isso na segunda assertiva
(`assert.equal(soma, 10000)`). Se o resto fosse colocado na **primeira** parcela em vez
da última, a quarta assertiva (`ps[2].valor === 33.34`) falharia sozinha, mesmo com a
soma batendo — por isso o teste checa os dois ângulos.

**Histórico do PLANO.md.** O comentário "resíduo na última" já aparece na
**sessão 1** (13/07/2026) descrevendo `parcelas.js` desde a primeira versão do núcleo
(`PLANO.md`, log da sessão 1: *"`parcelas.js` (explode compra em N parcelas, resíduo na
última)"*) — não é uma correção posterior, é uma decisão de design **desde o início**,
que este teste garante que nunca regrida.

---

## Teste 5 — `resumoMes`: entradas, saídas diretas e fatura

```js
test('resumoMes: entradas, saídas diretas e fatura', () => {
  let e = estadoInicial();
  e = adicionarCartao(e, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartaoId = e.cartoes[0].id;
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-02-06', categoria: 'Salário', valor: 3000, classificacao: 'Essencial' });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 200, forma: 'Pix', classificacao: 'Essencial' });
  e = adicionarTransacao(e, { tipo: 'cartao', data: '2026-02-16', categoria: 'Fone', valor: 300, cartaoId, parcelas: 3, classificacao: 'Não essencial' });

  const fev = resumoMes(e, '2026-02');
  assert.equal(fev.entradas, 3000);
  assert.equal(fev.saidasDiretas, 200);
  assert.equal(fev.faturas, 0); // fatura do fone só cai em março
  assert.equal(fev.saldoMes, 2800);

  const mar = resumoMes(e, '2026-03');
  assert.equal(mar.faturas, 100); // 1ª parcela de 300/3
  assert.equal(todasParcelas(e).length, 3);
});
```

**O que este teste trava.** A **convenção temporal** que rege todo o `calculos.js`: um
gasto no pix/dinheiro/débito conta **no mês em que aconteceu**; uma compra de cartão
conta **no mês da fatura**, não no mês da compra. É o comportamento mais importante do
arquivo mais importante do núcleo — ver
[`calculos.explicado.md`, Bloco 0](./calculos.explicado.md#bloco-0--o-cabeçalho-e-a-convenção-mãe).

**Como.** Monta um cenário com **os três tipos de movimento no mesmo mês**: uma
entrada, uma saída direta e uma compra de cartão — todos em fevereiro. A compra de
cartão é feita no dia 16, com fechamento dia 25 (regra do Teste 3: cai na fatura de
**março**, não fevereiro). É essa distância de um mês que o teste explora: `fev.faturas
=== 0` (a compra existe, mas ainda não virou saída — dinheiro nenhum saiu ainda) e
`mar.faturas === 100` (a 1ª parcela de `300/3` aparece exatamente um mês depois). O
`fev.saldoMes === 2800` (`3000 − 200`, e **não** `3000 − 200 − 300`) é a prova final:
se a compra contasse no mês da compra, o saldo de fevereiro estaria errado.

**Armadilha que pegaria.** Se `resumoMes` somasse as compras de cartão por `mesDe(tx.data)`
em vez de por `p.mesFatura` das parcelas explodidas, `fev.faturas` daria `300` (a
compra inteira, no mês errado) e, pior, a mesma compra **reapareceria** em março via
`todasParcelas` — um gasto de R$ 300 seria contado como se fossem R$ 400 (200 diretos +
300 na compra + 100 na fatura). É exatamente a "compra dupla" que
[`calculos.explicado.md`](./calculos.explicado.md#bloco-0--o-cabeçalho-e-a-convenção-mãe)
descreve como a armadilha que a convenção existe para evitar.

**Histórico do PLANO.md.** Esta convenção — "parcela conta como saída no mês da
fatura; pagamento nunca é saída" — é descrita como regra fixa desde a sessão 4
(*"a regra que evita contar duas vezes está documentada no topo do arquivo"*,
`PLANO.md`) e voltou a ser o centro de um bug real na **sessão 12** (o autor: *"os 2
bugs de cartão, corrigidos"*): ali o bug era num andar acima (o extrato importado
contando o *pagamento* da fatura como se fosse uma saída nova, dobrando o gasto na
camada de importação) — um sintoma diferente, mas da mesma doença de fundo que este
teste, na camada de `calculos.js`, garante que nunca aconteça aqui.

---

## Teste 6 — `resumoAno` soma o ano e a parcela cai no ano da fatura

```js
test('resumoAno soma o ano e a parcela cai no ano da fatura', () => {
  let e = estadoInicial();
  e = adicionarCartao(e, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartaoId = e.cartoes[0].id;
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-03-05', categoria: 'Salário', valor: 5000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-04-10', categoria: 'Mercado', valor: 1200, forma: 'Pix' });
  // compra em dez/2026 em 2x: 1ª fatura jan/2027, 2ª fev/2027 -> cai no ano seguinte
  e = adicionarTransacao(e, { tipo: 'cartao', data: '2026-12-26', categoria: 'Fone', valor: 400, cartaoId, parcelas: 2 });

  const r2026 = resumoAno(e, '2026');
  assert.equal(r2026.entradas, 5000);
  assert.equal(r2026.saidas, 1200); // as parcelas do fone NÃO estão em 2026
  assert.equal(r2026.reservaAno, 3800);

  const r2027 = resumoAno(e, '2027');
  assert.equal(r2027.entradas, 0);
  assert.equal(r2027.saidas, 400); // as 2 parcelas do fone caem em jan+fev/2027
  assert.equal(r2027.reservaAno, -400);

  assert.deepEqual(anosComMovimento(e), ['2026', '2027']);
});
```

**O que este teste trava.** Que a convenção temporal do Teste 5 **atravessa a virada de
ano** sem quebrar: uma compra feita em dezembro pode ter suas parcelas caindo
inteiramente no **ano seguinte**, e `resumoAno` tem que refletir isso — nunca contar a
compra no ano em que ela foi feita se a fatura cai depois.

**Como.** A escolha de data é a borda mais apertada possível: compra em **26/12/2026**,
com fechamento dia 25 — um dia **depois** do fechamento (regra do Teste 3: pula para a
fatura de fevereiro... na verdade aqui a 1ª fatura cai em **janeiro/2027**, porque
`26 > 25` empurra +2 meses a partir de dezembro = janeiro; a 2ª parcela cai em
fevereiro). O resultado: as **duas** parcelas caem em 2027, **nenhuma** em 2026, mesmo
a compra tendo sido feita em 2026. `r2026.saidas === 1200` (só o Pix; nada do Fone) e
`r2027.saidas === 400` (as duas parcelas, 200+200) provam isso nos dois lados da
virada. `anosComMovimento` fecha o teste confirmando que os dois anos aparecem, na
ordem certa.

**Armadilha que pegaria.** Se `resumoAno` filtrasse transações direto por
`tx.data.slice(0,4) === ano` (em vez de reusar `resumoMes`/`mesesComMovimento`, que já
sabem que parcela usa `mesFatura`), a compra do Fone apareceria inteira em **2026**
(ano da compra) e nunca em 2027 — exatamente o erro que
[`calculos.explicado.md`, Bloco 5](./calculos.explicado.md#bloco-5--anos-e-a-visão-anual)
chama de "armadilha evitada". O teste prova isso comparando **os dois anos ao mesmo
tempo**: um erro assim faria `r2026.saidas` dar `1600` (1200+400) e `r2027.saidas` dar
`0` — o oposto exato do esperado.

**Histórico do PLANO.md.** A "Visão anual" foi implementada na **sessão 6**
(*"resumoAno(estado, ano) e anosComMovimento(estado) em calculos.js (reaproveitam
resumoMes, então parcela cai no ano da fatura e nada soma duas vezes)"*, `PLANO.md`), e
o próprio log registra: *"teste novo cobre parcela de dez/26 que só aparece em 2027"*
— este teste, palavra por palavra, é aquele teste.

---

## Teste 7 — `dinheiroEmConta` acumula todos os meses

```js
test('dinheiroEmConta acumula todos os meses', () => {
  let e = estadoInicial();
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-01-05', categoria: 'Salário', valor: 1000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-05', categoria: 'Mercado', valor: 300, forma: 'Pix' });
  assert.equal(dinheiroEmConta(e), 700);
});
```

**O que este teste trava.** Que `dinheiroEmConta` soma os saldos de **todos** os meses
com movimento, não só do mês mais recente — é o saldo acumulado da vida inteira do
app. Ver [`calculos.explicado.md`, Bloco 3](./calculos.explicado.md#bloco-3--saldo-acumulado-e-dinheiro-em-conta).

**Como.** O cenário é deliberadamente **espalhado em dois meses diferentes**
(entrada em janeiro, saída em fevereiro) — se `dinheiroEmConta` olhasse só o mês
corrente, ele veria só um lado da conta (ou os R$ 1.000 de janeiro, ou os −R$ 300 de
fevereiro), nunca os dois juntos. `700 = 1000 − 300` só bate se a função **atravessar**
os meses.

**Armadilha que pegaria.** Uma implementação que chamasse `resumoMes` só para o "mês
atual" (em vez de `mesesComMovimento(estado).reduce(...)` sobre **todos** os meses)
devolveria `1000` ou `−300` isoladamente — nunca `700`. É o tipo de bug que só aparece
quando o usuário tem histórico em mais de um mês, o que é sempre.

---

## Teste 8 — `scoreSaude` devolve 0..100 e faixa

```js
test('scoreSaude devolve 0..100 e faixa', () => {
  let e = estadoInicial();
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-02-06', categoria: 'Salário', valor: 3000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 500, classificacao: 'Essencial' });
  const s = scoreSaude(e, '2026-02');
  assert.ok(s.score >= 0 && s.score <= 100);
  assert.ok(typeof s.faixa === 'string');
});
```

**O que este teste trava.** Que o score de saúde financeira — a média ponderada de
três pilares descrita em
[`score.explicado.md`](./score.explicado.md#bloco-2--o-cálculo-do-score-o-coração) —
**nunca escapa** da faixa `[0, 100]`, e que sempre vem acompanhado de uma `faixa`
textual (`'Excelente'`/`'Saudável'`/`'Atenção'`/`'Crítico'`).

**Como.** Este é o único teste do arquivo que usa `assert.ok` com uma **faixa**
(`>= 0 && <= 100`) em vez de um valor exato — de propósito. O score é uma fórmula com
três pilares e pesos (40/35/25); testar um valor exato aqui seria re-implementar a
fórmula inteira no teste (frágil: qualquer ajuste fino de peso quebraria o teste sem
que o comportamento estivesse realmente errado). O que **importa** garantir é o
**contrato**: um número dentro da faixa e uma faixa-rótulo válida — os `clamp(...,0,1)`
de cada pilar (ver [`score.explicado.md`, Bloco 3](./score.explicado.md#bloco-3--o-clamp))
é que fazem essa garantia valer mesmo com entradas atípicas.

**Armadilha que pegaria.** Um bug num dos três pilares que devolvesse um valor fora de
`[0,1]` sem o `clamp` (por exemplo, saldo muito maior que as entradas fazendo
`saldoMes/entradas > 1`) faria o `score` final passar de 100 — o `assert.ok(s.score <=
100)` pegaria isso na hora. Um `NaN` escapando de uma divisão por zero (mês sem
entradas) também falharia aqui, porque `NaN >= 0` é `false` em JavaScript.

---

## Teste 9 — `carregar` migra JSON cru e ignora lixo

```js
test('carregar migra JSON cru e ignora lixo', () => {
  const e = carregar('{"transacoes":[{"id":"x","tipo":"entrada","data":"2026-02-01","valor":10}],"lixo":123}');
  assert.equal(e.schemaVersion, 1);
  assert.equal(e.transacoes.length, 1);
  assert.ok(Array.isArray(e.cartoes));
  assert.ok(Array.isArray(e.planejamentos)); // campo novo entra vazio em dados antigos
});
```

**O que este teste trava.** Que `carregar` (a ponte entre o `dados.json` cru do disco e
o estado que o app confia — ver
[`index.explicado.md §7`](./index.explicado.md#7--carregar--a-ponte-com-a-migração`))
faz `JSON.parse` de uma **string**, e que o `migrar` por trás dela (ver
[`model.explicado.md §9`](./model.explicado.md#9)) preenche os campos **que faltam**
com o tipo certo — sem quebrar por causa de um campo desconhecido (`"lixo":123`)
solto no arquivo.

**Como.** O JSON de entrada é **deliberadamente incompleto e sujo**: só tem
`transacoes`, não tem `cartoes`, `faturas`, `planejamentos` nem `schemaVersion` — e
ainda carrega um campo `"lixo"` que não existe em nenhuma versão do schema. Cada
assertiva prova um ângulo: `schemaVersion === 1` (carimbado mesmo sem estar no
arquivo), `transacoes.length === 1` (o que veio, sobrevive), `Array.isArray(cartoes)`
e `Array.isArray(planejamentos)` (o que **não** veio nasce como array vazio, nunca
`undefined`). O comentário do próprio teste já entrega a intenção: `planejamentos` é
**"campo novo"** que precisa nascer vazio em dado antigo, sem derrubar o app.

**Armadilha que pegaria.** Se `migrar` não tivesse a blindagem `Array.isArray(x) ? x :
[]` para cada campo, `e.cartoes` viria `undefined`, e o primeiro `estado.cartoes.map(...)`
em qualquer parte da UI **quebraria o app inteiro** ao abrir um `dados.json` velho. O
campo `"lixo"` existe no teste para provar que sobreviver a "campo desconhecido" (ver
Teste 19) não significa que o arquivo precisa ser **limpo** — ele só precisa não
**quebrar** a leitura dos campos conhecidos.

---

## Teste 10 — `definirPlanejamento` faz upsert e `estimado<=0` apaga a meta

```js
test('definirPlanejamento faz upsert e estimado<=0 apaga a meta', () => {
  let e = estadoInicial();
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Mercado', estimado: 800 });
  assert.equal(e.planejamentos.length, 1);
  assert.equal(e.planejamentos[0].estimado, 800);
  // redefinir a mesma categoria/mês substitui (não duplica)
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Mercado', estimado: 900 });
  assert.equal(e.planejamentos.length, 1);
  assert.equal(e.planejamentos[0].estimado, 900);
  // outra categoria coexiste
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Lazer', estimado: 200 });
  assert.equal(e.planejamentos.length, 2);
  // estimado 0 remove a meta
  e = definirPlanejamento(e, { mes: '2026-07', categoria: 'Mercado', estimado: 0 });
  assert.equal(e.planejamentos.length, 1);
  assert.equal(e.planejamentos[0].categoria, 'Lazer');
  // remover explicitamente
  e = removerPlanejamento(e, '2026-07', 'Lazer');
  assert.equal(e.planejamentos.length, 0);
});
```

**O que este teste trava.** Três regras de negócio do orçamento mensal, encadeadas no
mesmo estado: (1) definir a mesma categoria/mês **substitui**, nunca duplica; (2)
categorias diferentes **coexistem**; (3) `estimado <= 0` **apaga** a meta em vez de
guardar zero. Ver [`index.explicado.md §4`](./index.explicado.md#4-planejamento-guarda-apaga-e-repete).

**Como.** O teste é uma **sequência de cinco chamadas** sobre o mesmo `e`, cada uma
conferida antes da próxima — um "filme" do upsert em ação, não um instantâneo isolado.
A escolha de valores (800 → 900 na mesma categoria; depois 200 numa categoria nova;
depois 0 na primeira) percorre exatamente as três regras, uma por vez, na ordem mais
natural de uso real: orça, reajusta, adiciona outra categoria, zera uma, remove a
outra. `e.planejamentos.length` é conferido a cada passo — 1, 1 (não virou 2!), 2, 1
(voltou a cair!), 0 — provando que nenhuma chamada duplica nem esquece de remover.

**Armadilha que pegaria.** Se `definirPlanejamento` fizesse só `push` sem o
`filter(fora da chave mes+categoria)` que precede (o upsert de
[`index.explicado.md`](./index.explicado.md#4-planejamento-guarda-apaga-e-repete)), a
segunda chamada (estimado 900) criaria uma **segunda** entrada de Mercado em vez de
substituir a primeira — `e.planejamentos.length` daria `2` onde o teste espera `1`,
pegando o bug na hora. Se `estimado <= 0` não removesse a entrada (guardasse `0`
literalmente), a quarta chamada deixaria `e.planejamentos.length === 2` (Mercado com
estimado 0 + Lazer) em vez do esperado `1` — um orçamento zerado ficaria poluindo a
lista para sempre.

**Histórico do PLANO.md.** A tela de Planejamento foi fechada na **sessão 6** (a outra
metade da paridade, feita em paralelo no Windows): o log descreve exatamente esta
regra — *"`definirPlanejamento` (upsert por mês+categoria; `estimado ≤ 0` apaga a
meta, não guarda zero)"* (`PLANO.md`) — texto quase idêntico ao comentário deste
teste, prova de que o teste nasceu junto com a feature, não depois.

---

## Teste 11 — `planejamentoDoMes` compara estimado x real (parcelas incluídas)

```js
test('planejamentoDoMes compara estimado x real (parcelas incluídas)', () => {
  let e = estadoInicial();
  e = adicionarCartao(e, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartaoId = e.cartoes[0].id;
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 500, forma: 'Pix' });
  e = adicionarTransacao(e, { tipo: 'cartao', data: '2026-02-16', categoria: 'Fone', valor: 300, cartaoId, parcelas: 3 });
  e = definirPlanejamento(e, { mes: '2026-02', categoria: 'Mercado', estimado: 800 });

  const fev = planejamentoDoMes(e, '2026-02');
  const merc = fev.itens.find((i) => i.categoria === 'Mercado');
  assert.equal(merc.estimado, 800);
  assert.equal(merc.real, 500);        // só a saída direta; a fatura do Fone cai em março
  assert.equal(merc.diferenca, 300);   // ainda cabe 300
  assert.equal(merc.planejado, true);
  assert.equal(fev.totalEstimado, 800);
  assert.equal(fev.totalReal, 500);
  assert.equal(fev.diferenca, 300);

  // março: a 1ª parcela do Fone vira REAL sem meta (aparece, diferença negativa)
  const mar = planejamentoDoMes(e, '2026-03');
  const fone = mar.itens.find((i) => i.categoria === 'Fone');
  assert.equal(fone.real, 100);
  assert.equal(fone.planejado, false);
  assert.equal(fone.diferenca, -100);
});
```

**O que este teste trava.** Dois comportamentos de `planejamentoDoMes` ao mesmo tempo:
(1) o **real** vem de `gastoPorCategoria`, que já embute a convenção temporal
(parcela conta no mês da fatura) — então uma compra parcelada **não** aparece no
orçamento do mês da compra; (2) categorias que gastaram **sem meta** aparecem mesmo
assim (`planejado: false`), com diferença **negativa** — o orçamento nunca esconde um
estouro só porque a categoria não tinha meta definida. Ver
[`planejamento.explicado.md`, Bloco 2](./planejamento.explicado.md#bloco-2--a-união-de-categorias-e-o-item-de-cada-uma).

**Como.** O mesmo cenário de cartão do Teste 5 é reaproveitado (compra de Fone dia 16,
fechamento dia 25, cai na fatura de março). Só o Mercado tem meta (`estimado: 800`) —
o Fone é deixado **sem meta de propósito**, para testar o ramo "gastou sem planejar".
Em fevereiro: `merc.real === 500` (não 800, e não conta o Fone, que ainda nem virou
fatura) prova a convenção temporal dentro do planejamento. Em março: `fone.real ===
100` (a 1ª parcela) com `fone.planejado === false` e `fone.diferenca === -100` prova
que uma categoria sem orçamento **aparece** no relatório assim que gasta — e a
diferença negativa é o sinal visual de "isto não foi planejado".

**Armadilha que pegaria.** Se `planejamentoDoMes` usasse **só** as categorias com meta
(em vez da **união** de estimados e reais — ver
[`planejamento.explicado.md`](./planejamento.explicado.md#a-união-das-chaves--a-decisão-importante)),
o item `fone` simplesmente **não existiria** em `mar.itens` — o `.find(...)` devolveria
`undefined`, e a linha seguinte (`fone.real`) estouraria com "Cannot read property
'real' of undefined". É o tipo de bug que esconderia um estouro de orçamento real do
usuário: gastar numa categoria nova sem meta pareceria "invisível" no relatório.

**Histórico do PLANO.md.** Mesma sessão 6: *"`planejamentoDoMes(estado, mes)` junta o
estimado ... com o real por categoria — o real vem do `gastoPorCategoria`, então já
inclui as parcelas do cartão"* (`PLANO.md`) — a frase descreve, quase literalmente, a
primeira metade deste teste.

---

## Teste 12 — `repetirPlanejamento` leva o orçamento para os outros meses sem duplicar

```js
test('repetirPlanejamento leva o orçamento para os outros meses sem duplicar', () => {
  let e = estadoInicial();
  e = definirPlanejamento(e, { mes: '2026-01', categoria: 'Mercado', estimado: 800 });
  e = definirPlanejamento(e, { mes: '2026-01', categoria: 'Lazer', estimado: 200 });
  e = repetirPlanejamento(e, '2026-01', ['2026-02', '2026-03']);
  assert.equal(planejamentoDoMes(e, '2026-02').totalEstimado, 1000);
  assert.equal(planejamentoDoMes(e, '2026-03').totalEstimado, 1000);
  assert.equal(planejamentoDoMes(e, '2026-01').totalEstimado, 1000); // origem intacta

  // repetir de novo com Mercado alterado substitui no destino, não soma em cima
  e = definirPlanejamento(e, { mes: '2026-01', categoria: 'Mercado', estimado: 900 });
  e = repetirPlanejamento(e, '2026-01', ['2026-02']);
  assert.equal(planejamentoDoMes(e, '2026-02').totalEstimado, 1100); // 900 + 200
  assert.equal(e.planejamentos.filter((p) => p.mes === '2026-02').length, 2);
});
```

**O que este teste trava.** Que "repetir o orçamento para os demais meses" **substitui**
as categorias da origem no destino (nunca soma em cima de uma repetição anterior), e
que a **origem nunca é alterada** por um repetir. É o comportamento mais fácil de
errar em qualquer "copiar para vários lugares": duplicação silenciosa ao repetir duas
vezes.

**Como.** Duas metas em janeiro (Mercado 800, Lazer 200) são repetidas para
fevereiro **e** março de uma vez — `totalEstimado` de 1000 nos três meses prova que a
cópia chegou aos dois destinos e que o total bate. Depois, o teste faz a parte mais
sutil: **muda** o Mercado na origem (800→900) e repete **de novo**, só para fevereiro.
Se a repetição **somasse** em vez de substituir, fevereiro teria Mercado 800 (da
primeira repetição) + Mercado 900 (da segunda) = 1700 + Lazer 200 = 1900. O teste
espera `1100` (900 + 200) — a prova de que a repetição nova **substitui** só a
categoria que veio da origem (Mercado), preservando o resto. A última linha
(`e.planejamentos.filter(p => p.mes === '2026-02').length === 2`) fecha o caso:
mesmo depois de duas repetições, fevereiro tem exatamente **duas** entradas (Mercado
e Lazer), não três ou quatro.

**Armadilha que pegaria.** Ver
[`index.explicado.md`](./index.explicado.md#4-planejamento-guarda-apaga-e-repete): a
implementação filtra o destino por `(destinos.has(mes) && catsOrigem.has(categoria))`
antes de reinserir. Sem esse filtro — um `push` cru para cada mês de destino, sempre —
a segunda repetição **duplicaria** Mercado em fevereiro em vez de substituir, e o
`totalEstimado` de fevereiro passaria a somar as duas entradas de Mercado junto com o
Lazer: `800 + 900 + 200 = 1900`, não `1100`. O `.filter(...).length === 2` no fim é o
que pega essa duplicação mesmo que, por acaso, os totais batessem.

**Histórico do PLANO.md.** Este é o caso mais direto de todo o arquivo: a
**sessão 6** descreve `repetirPlanejamento` como *"copia o orçamento de um mês pros
outros — substitui só as categorias da origem, não apaga o resto"* e fecha a frase
dizendo, textualmente: *"tem teste de que não duplica"* (`PLANO.md`). Este é
exatamente aquele teste.

---

## Teste 13 — reserva: aportes e resgates acumulam (resgate é valor negativo)

```js
test('reserva: aportes e resgates acumulam (resgate é valor negativo)', () => {
  let e = estadoInicial();
  e = registrarReserva(e, { mes: '2026-01', valor: 500 });
  e = registrarReserva(e, { mes: '2026-02', valor: 300, obs: 'sobrou do mês' });
  assert.equal(reservaAcumulada(e), 800);
  // resgate: valor negativo tira da reserva (usou o dinheiro guardado)
  e = registrarReserva(e, { mes: '2026-03', valor: -200 });
  assert.equal(reservaAcumulada(e), 600);
  assert.equal(e.reservas.length, 3);
  assert.equal(e.reservas[1].obs, 'sobrou do mês');
  assert.ok(e.reservas[0].id && e.reservas[0].criadoEm); // carimba id e data
  // remover um movimento pelo id
  const idJan = e.reservas[0].id;
  e = removerReserva(e, idJan);
  assert.equal(reservaAcumulada(e), 100); // 300 - 200
  assert.equal(e.reservas.length, 2);
});
```

**O que este teste trava.** O modelo de **ledger com sinal** da reserva de emergência:
um único array `reservas` guarda tanto aportes (`valor > 0`) quanto resgates
(`valor < 0`), e o total é só a **soma**. E que cada campo do movimento — `mes`,
`valor`, `obs`, `id`, `criadoEm` — vai **exatamente** para onde deveria, sem se
misturar. Ver
[`reserva.explicado.md`, Bloco 0](./reserva.explicado.md#bloco-0--o-cabeçalho-e-o-conceito-de-earmark).

**Como.** Três movimentos, dois aportes e um resgate: `500 + 300 − 200 = 600`.
`reservaAcumulada` é conferida **duas vezes** (depois dos dois aportes, e de novo
depois do resgate) — provando que o resgate **abate** naturalmente, sem `if`
separando "tipo aporte" de "tipo resgate" (não existe esse campo; só o sinal do
`valor`). O `obs: 'sobrou do mês'` no segundo movimento é conferido no campo certo
(`e.reservas[1].obs`), e `id`/`criadoEm` são conferidos como **carimbados
automaticamente** (a UI não precisa fornecer isso). Por fim, remove o movimento de
janeiro pelo `id` e confere que o acumulado recalcula certo (`300 − 200 = 100`) e que
a lista encolhe para 2 itens.

**Armadilha que pegaria.** Se `valor` de um movimento fosse gravado na coluna errada
— por exemplo, se `registrarReserva` guardasse os campos **na ordem de chegada** em
vez de nomeados explicitamente (`{ mes: dados.mes, valor: ..., obs: ... }` — ver
[`index.explicado.md`](./index.explicado.md#5-reserva-e-metas)) — o `obs` de um
movimento poderia acabar armazenado onde o `valor` deveria estar, e
`e.reservas[1].obs` falharia ou `reservaAcumulada` daria um número sem sentido (soma
incluindo texto). Esse é exatamente o formato de bug que a nota do PLANO.md abaixo
descreve — só que na planilha original, não no app.

**Histórico do PLANO.md.** Este teste é a **vacina direta** contra um bug real —
**da planilha, não do app**, mas que motivou o cuidado aqui. A **sessão 4** registra:
*"Bug na planilha (dele, não nosso): `salvarReservaPM` grava 4 valores nas colunas
1–4, mas `Reservas PM` tem 5 colunas (Mês | Ação | Valor | Obs | Criado em) — o valor
da reserva cai na coluna 'Ação'"* (`PLANO.md`). Ao reconstruir a feature na
**sessão 7**, o log confirma explicitamente que o app **não** reproduziu o defeito:
*"Não reproduzi o bug da macro (`salvarReservaPM` jogava o valor na coluna 'Ação'):
no app o valor grava no campo certo"* (`PLANO.md`). Este teste — que confere `obs` e
`valor` em campos distintos e corretos — é a prova executável dessa promessa.

---

## Teste 14 — `resumoReserva`: disponível = conta − reserva; meta = meses × gasto médio

```js
test('resumoReserva: disponível = conta − reserva; meta = meses × gasto médio', () => {
  let e = estadoInicial();
  // dois meses com gasto (média 1500) — base da meta "X meses de gasto"
  e = adicionarTransacao(e, { tipo: 'entrada', data: '2026-01-05', categoria: 'Salário', valor: 5000 });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-01-10', categoria: 'Mercado', valor: 1000, forma: 'Pix' });
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-02-10', categoria: 'Mercado', valor: 2000, forma: 'Pix' });
  assert.equal(gastoMedioMensal(e), 1500);

  e = registrarReserva(e, { mes: '2026-01', valor: 500 });
  e = registrarReserva(e, { mes: '2026-06', valor: 300 });
  e = registrarReserva(e, { mes: '2027-01', valor: 1000 }); // aporte de outro ano

  const r = resumoReserva(e, '2026');
  assert.equal(r.total, 1800);      // 500 + 300 + 1000 (acumulado, todos os anos)
  assert.equal(r.noAno, 800);       // só 2026: 500 + 300 (a "Reserva Anual" da planilha)
  // reserva é earmark, não transação: NÃO muda o dinheiro em conta (5000 − 3000 = 2000)
  assert.equal(r.disponivel, 200);  // 2000 − 1800
  assert.equal(r.metaMeses, 6);     // default do CONFIG_PADRAO
  assert.equal(r.gastoMedio, 1500);
  assert.equal(r.meta, 9000);       // 6 × 1500
  assert.equal(r.faltam, 7200);     // 9000 − 1800

  // mudar a meta recalcula; negativa vira 0 (= sem meta, sem progresso)
  e = definirMetaReserva(e, 3);
  assert.equal(e.config.reservaMetaMeses, 3);
  assert.equal(resumoReserva(e, '2026').meta, 4500);
  e = definirMetaReserva(e, -5);
  assert.equal(e.config.reservaMetaMeses, 0);
  const semMeta = resumoReserva(e, '2026');
  assert.equal(semMeta.meta, 0);
  assert.equal(semMeta.progresso, 0);
  assert.equal(semMeta.faltam, 0);
});
```

**O que este teste trava.** O conceito central de `reserva.js`: guardar dinheiro é um
**earmark**, não um gasto — `disponível = dinheiroEmConta − reservaAcumulada`, e a
reserva **nunca** aparece descontada do dinheiro em conta em si (senão contaria duas
vezes). E, junto, que a meta (`N meses × gasto médio`) nunca fica negativa mesmo que
alguém passe `-5`. Ver
[`reserva.explicado.md`, Bloco 3](./reserva.explicado.md#bloco-3--o-resumo-da-reserva).

**Como.** O cenário separa deliberadamente **reserva** de **movimento financeiro**:
entradas e saídas somam `dinheiroEmConta = 2000` (5000 − 1000 − 2000); os aportes de
reserva (500+300+1000 = 1800) são registrados **à parte**, em meses e até **anos**
diferentes (um deles em 2027, de propósito, para testar que `total` soma **tudo** mas
`noAno` filtra só 2026). A prova do earmark está na linha central:
`r.disponivel === 200` — se um aporte de reserva fosse tratado como gasto, o
`dinheiroEmConta` teria caído para `200` (2000−1800) **e** `disponivel` subtrairia
`1800` de novo, dando `-1600` — um erro de dupla contagem. O teste também confere o
**default** da meta (`6` meses, do `CONFIG_PADRAO`), o recálculo dinâmico ao mudar a
meta (`3` meses → meta `4500`), e o **clamp negativo**: definir a meta como `-5`
resulta em `0` — sem meta, sem progresso, sem "faltam" negativo.

**Armadilha que pegaria.** Se `resumoReserva` calculasse `disponivel` a partir de um
`dinheiroEmConta` que **já** descontasse os aportes de reserva na camada de
`calculos.js` (por exemplo, se `registrarReserva` criasse também uma transação de
saída), `r.disponivel` daria `200` **por acidente** só na primeira leitura, mas
`dinheiroEmConta(e)` sozinho já estaria errado (`200` em vez de `2000`) — um teste
adicional pegaria isso, e a "Reserva Anual" (`noAno`) ficaria inconsistente com o
total assim que houvesse aportes em anos diferentes. O `definirMetaReserva(e, -5)` sem
o `Math.max(0, ...)` (ver
[`index.explicado.md`](./index.explicado.md#5-reserva-e-metas)) deixaria `metaMeses`
negativo, e a meta em reais (`gastoMedio × metaMeses`) viraria **negativa** — o
`assert.equal(semMeta.meta, 0)` pegaria isso na hora.

**Histórico do PLANO.md.** A reserva foi fechada na **sessão 7** com esta descrição
quase idêntica ao teste: *"disponível = dinheiro em conta − reserva acumulada e nada
conta duas vezes. Valor negativo = resgate. Progresso clampado em `[0,1]`"*
(`PLANO.md`). O default de 6 meses também vem de lá — `reservaMetaMeses: 6` no
`CONFIG_PADRAO` (ver [`model.explicado.md §3`](./model.explicado.md#3)).

---

## Teste 15 — `rendaMensal` soma os componentes; `definirMetas` faz merge raso

```js
test('rendaMensal soma os componentes; definirMetas faz merge raso', () => {
  let e = estadoInicial();
  assert.equal(rendaMensal(e), 0); // default neutro (sem dado real no repo)
  e = definirMetas(e, { rendaComponentes: [
    { nome: 'Salário', valor: 3250 },
    { nome: 'Vale alimentação', valor: 250 },
    { nome: 'Mensalidade curso', valor: 400 },
  ] });
  assert.equal(rendaMensal(e), 3900);
  // merge raso: mexer no patrimônio não apaga rendaComponentes
  e = definirMetas(e, { patrimonioInvestido: 2000 });
  assert.equal(rendaMensal(e), 3900);
  assert.equal(e.config.metas.patrimonioInvestido, 2000);
});
```

**O que este teste trava.** Que `rendaMensal` soma **componentes** de renda (não um
número fixo — o modelo permite salário + vale + bico, cada um numa linha), e que
`definirMetas` faz um **merge raso**: mudar `patrimonioInvestido` **não apaga**
`rendaComponentes` que já estava lá. Ver
[`metas.explicado.md`, Bloco 1](./metas.explicado.md#bloco-1--a-renda-mensal) e
[`index.explicado.md`](./index.explicado.md#5-reserva-e-metas) (`definirMetas`).

**Como.** Começa confirmando o `estadoInicial()` puro dá renda **zero** — o
`CONFIG_PADRAO` nasce zerado de propósito (números reais nunca vão pro repo, ver
[`model.explicado.md §3`](./model.explicado.md#3)). Depois define **três**
componentes de renda numa única chamada de `definirMetas`, e confere a soma. A parte
que realmente testa o "merge raso" é a **segunda** chamada de `definirMetas`: ela
manda **só** `{ patrimonioInvestido: 2000 }` — sem repetir `rendaComponentes` — e o
teste confirma que a renda continua `3900` (não zerou) **e** que o patrimônio novo
entrou. Se o merge fosse **fundo em vez de raso** ou, pior, uma **substituição**
completa do objeto `metas` (`config.metas = patch`, sem espalhar o que já existia),
`rendaComponentes` teria sumido na segunda chamada.

**Armadilha que pegaria.** Trocar `{ ...(estado.config?.metas || {}), ...patch }` (ver
[`index.explicado.md`](./index.explicado.md#5-reserva-e-metas)) por
`{ ...patch }` sozinho faria a segunda chamada **apagar** `rendaComponentes` — a linha
`assert.equal(rendaMensal(e), 3900)` (depois da segunda chamada) cairia para `0`,
denunciando a perda silenciosa. É o clássico bug de "editei um campo e outro sumiu"
que só um merge raso correto evita.

**Histórico do PLANO.md.** Os valores `3250 + 250 + 400 = 3900` não são números
aleatórios: são as **premissas reais** do autor, documentadas na **sessão 8**:
*"renda R$ 3.900/mês (salário 3.250 + vale 250 + 'mensalidade curso técnico' 400)"*
(`PLANO.md`) — o teste usa a mesma composição para provar a soma, embora (como
sempre) nenhum dado financeiro real fique no `dados.json` versionado; aqui é só
fixture de teste.

---

## Teste 16 — `mesesParaAlvo`: já atingiu = 0; sem aporte nem juros = null; com aporte conta

```js
test('mesesParaAlvo: já atingiu = 0; sem aporte nem juros = null; com aporte conta', () => {
  assert.equal(mesesParaAlvo(1000, 1000, 0, 0), 0);   // já no alvo
  assert.equal(mesesParaAlvo(1200, 1000, 0, 0), 0);   // passou do alvo
  assert.equal(mesesParaAlvo(0, 5000, 0, 0), null);   // parado: nunca chega
  assert.equal(mesesParaAlvo(0, 1000, 100, 0), 10);   // 10 aportes de 100, sem juros
  assert.equal(mesesParaAlvo(500, 1000, 100, 0), 5);  // já tinha 500
  // com juros compostos chega mais rápido que o linear (500 → 1000, 100/mês, 12% a.a.)
  assert.ok(mesesParaAlvo(500, 1000, 100, 0.12) <= 5);
});
```

**O que este teste trava.** O **contrato de três estados** da simulação de juros
compostos: `0` (já alcançou), um número de meses (alcança), ou `null` (nunca alcança).
E que **juros ajudam** — a mesma jornada com rendimento chega **no máximo** no mesmo
tempo que sem rendimento, nunca depois. Ver
[`metas.explicado.md`, Bloco 2](./metas.explicado.md#bloco-2--a-simulação-de-juros-compostos-a-peça-chave).

**Como.** Seis casos, cada um isolando uma célula da tabela-verdade da função:
`atual === alvo` → `0` (borda exata, não "quase lá"); `atual > alvo` → `0` também
(passou, não é erro); `atual = 0`, sem aporte, sem juros → `null` (o caso mais
importante de detectar: **nunca vai chegar**, e a função tem um teto de 1200 meses
para não entrar em loop infinito tentando provar isso — ver
[`metas.explicado.md`](./metas.explicado.md#os-três-retornos--um-contrato-de-três-estados)).
Os dois últimos casos usam números **redondos de propósito**: `0 → 1000` com aportes
de `100`/mês e **zero** juros dá exatamente `10` (`1000/100`) — uma divisão exata que
funciona como "cálculo de referência" sem ruído de arredondamento. `500 → 1000` com o
mesmo aporte dá `5` — a mesma conta, só com um saldo inicial. A última linha é a mais
sutil: **mesmo** cenário (500→1000, aporte 100), mas com `taxaAnual = 0.12` — o teste
não exige um número exato aqui (a matemática de juros compostos com poucos meses tem
efeitos de arredondamento por centavo), só que o resultado seja **`<= 5`**: juros
**nunca pioram** o prazo, na pior das hipóteses empatam.

**Armadilha que pegaria.** A "intuição errada" clássica descrita em
[`metas.explicado.md`](./metas.explicado.md#a-conversão-de-taxa-anual--mensal-o-ponto-que-mais-confunde)
é fazer `taxaMes = taxaAnual / 12` em vez de `(1+taxaAnual)^(1/12) - 1`. Com
`taxaAnual = 0.12`, a divisão ingênua dá exatamente `1%` ao mês, enquanto a raiz-12
correta dá `~0,9489%` — **mais devagar**. Se o código estivesse com a fórmula errada
(super ou subestimando o rendimento mensal), o teste `<= 5` ainda poderia passar por
sorte num caso tão curto — é uma limitação honesta deste teste específico: ele prova
"juros ajudam, não atrapalham", mas não fixa o número exato de meses, então uma fórmula
levemente errada **passaria despercebida** aqui. O que ele pega com certeza: se juros
fizessem o prazo **aumentar** (bug grosseiro, tipo taxa negativa por engano), o
`<= 5` falharia na hora. Os casos `0` e `null` são os que travam o contrato mais duro:
trocar a condição `saldo >= alvo` por `saldo > alvo` faria o primeiro caso (`1000,
1000`) devolver `1` em vez de `0` — um mês de atraso por engano de fronteira.

---

## Teste 17 — `resumoMetas`: alvos de reserva (gasto), liberdade (renda) e dividendos (yield)

```js
test('resumoMetas: alvos de reserva (gasto), liberdade (renda) e dividendos (yield)', () => {
  let e = estadoInicial();
  // gasto médio de 1000/mês (base da reserva); reserva já com 600 guardados
  e = adicionarTransacao(e, { tipo: 'saida', data: '2026-01-10', categoria: 'Mercado', valor: 1000, forma: 'Pix' });
  e = registrarReserva(e, { mes: '2026-01', valor: 600 });
  // renda 3900/mês, patrimônio 2000, dividendos a 10% a.a., liberdade = 6 meses de renda
  e = definirMetas(e, {
    rendaComponentes: [{ nome: 'Salário', valor: 3900 }],
    patrimonioInvestido: 2000,
    aporteMensal: 500,
  });

  const m = resumoMetas(e);
  assert.equal(m.renda, 3900);

  // reserva: 6 × gasto médio (1000) = 6000; já tem 600 (o earmark), faltam 5400
  assert.equal(m.reserva.metaMeses, 6);
  assert.equal(m.reserva.gastoMedio, 1000);
  assert.equal(m.reserva.alvo, 6000);
  assert.equal(m.reserva.atual, 600);
  assert.equal(m.reserva.faltam, 5400);

  // liberdade: 6 meses de renda = 23400; atual = patrimônio 2000
  assert.equal(m.liberdade.metaMeses, 6);
  assert.equal(m.liberdade.alvo, 23400);
  assert.equal(m.liberdade.atual, 2000);
  assert.equal(m.liberdade.faltam, 21400);

  // dividendos: renda anual (46800) / 10% = 468000; atual = patrimônio 2000
  assert.equal(m.dividendos.yield, 0.10);
  assert.equal(m.dividendos.alvo, 468000);
  assert.equal(m.dividendos.atual, 2000);
  assert.equal(m.dividendos.faltam, 466000);
  assert.ok(m.dividendos.progresso > 0 && m.dividendos.progresso < 1);

  // yield 0 não divide por zero: alvo 0
  e = definirMetas(e, { dividendosYield: 0 });
  assert.equal(resumoMetas(e).dividendos.alvo, 0);
});
```

**O que este teste trava.** As **três fórmulas de negócio** da calculadora de metas,
lado a lado no mesmo estado: reserva = `gastoMedio × N meses`; liberdade financeira =
`renda × M meses`; viver de dividendos = `renda anual ÷ yield`. E que cada meta usa o
`atual` certo — reserva compara com o **earmark** guardado (`reservaAcumulada`), as
outras duas com o **patrimônio investido**. Ver
[`metas.explicado.md`, Bloco 3](./metas.explicado.md#bloco-3--o-resumo-das-três-metas).

**Como.** Um gasto de `1000` (único mês) fixa o `gastoMedio` em `1000` sem
ambiguidade — a base da meta de reserva. Uma reserva de `600` já guardada testa que
`atual` da reserva vem do earmark (`reservaAcumulada`), **não** do patrimônio. A renda
(`3900`) e o patrimônio (`2000`) são os mesmos números "reais" do Teste 15 e da
sessão 8 do PLANO — reaproveitados aqui para testar as duas metas que usam **renda**
em vez de gasto como régua. As contas são conferidas **por fórmula, não por
coincidência**: `6000 = 6 × 1000` (reserva), `23400 = 6 × 3900` (liberdade — 6 meses
de **renda**, não de gasto: outra régua, mesmo formato), `468000 = (3900×12) / 0.10`
(dividendos — o cálculo mais elaborado, isolando o patrimônio necessário para que a
renda passiva cubra a renda anual a 10% ao ano). Por fim, `dividendosYield: 0` prova
a guarda contra divisão por zero: sem yield informado, o alvo cai para `0` em vez de
`Infinity`.

**Armadilha que pegaria.** Se `m.reserva.atual` usasse `m.patrimonioInvestido` (2000)
em vez de `reservaAcumulada(estado)` (600) — um erro fácil de cometer, já que as
outras duas metas usam patrimônio — o teste pegaria na hora
(`assert.equal(m.reserva.atual, 600)` falharia com `2000`). Se a fórmula de dividendos
esquecesse de multiplicar a renda mensal por **12** antes de dividir pelo yield (usando
renda mensal em vez de anual), o alvo daria `39000` em vez de `468000` — um erro de
ordem de grandeza que nenhum usuário deixaria de notar, mas que só um teste **exato**
(não um "está na faixa") pegaria com certeza.

**Histórico do PLANO.md.** As três metas e os defaults usados aqui (**6 meses** de
renda para liberdade, **10% a.a.** para dividendos) nasceram na **sessão 8**, junto
com as mesmas premissas reais do autor: *"liberdade = 6 meses de renda, dividendos a
10% a.a. (alvo R$ 468.000)"* (`PLANO.md`) — o `R$ 468.000` do log é **exatamente** o
`m.dividendos.alvo` deste teste, calculado com a mesma renda de R$ 3.900/mês. Os
defaults `libFinanceiraMeses: 6` e `dividendosYield: 0.10` vêm do `CONFIG_PADRAO` (ver
[`model.explicado.md §3`](./model.explicado.md#3)) e não precisam ser definidos
explicitamente no teste — só a renda e o patrimônio são.

---

## Teste 18 — migrar preserva campos que a versão atual ainda não conhece

```js
test('migrar preserva campos que a versão atual ainda não conhece (build velho não apaga dado novo)', () => {
  // Cenário real: o Finan.exe do pendrive fica pra trás da máquina que buildou por
  // último. Se ele reconstruísse o estado só com a lista de campos que conhece, os
  // blocos mais novos sumiriam na primeira gravação — sem erro nenhum.
  const doFuturo = {
    ...estadoInicial(),
    transacoes: [{ id: 'a', tipo: 'saida', valor: 10, data: '2026-07-01', descricao: 'x' }],
    investimentos: [{ id: 'i1', ticker: 'XPTO', cotas: 3 }], // bloco que ainda não existe
  };

  const e = carregar(JSON.stringify(doFuturo));

  assert.deepEqual(e.investimentos, doFuturo.investimentos, 'bloco desconhecido tem que sobreviver');
  assert.equal(e.transacoes.length, 1, 'o que já é conhecido continua funcionando');
  // e o round-trip (carregar → salvar → carregar) não pode perder nada
  assert.deepEqual(carregar(JSON.stringify(e)).investimentos, doFuturo.investimentos);
});
```

**O que este teste trava.** A regra mais crítica de integridade de dados do projeto:
`migrar` **preserva** qualquer campo que o código **atual** não conhece —
`investimentos`, neste teste, é um bloco **inventado**, que nenhuma versão real do
schema tem, simulando "um build futuro adicionou uma feature nova". Ver
[`model.explicado.md §9`](./model.explicado.md#9--migrar--migração-versionada), a
seção **"Por que `...dados` ANTES das chaves conhecidas"**.

**Como.** O nome do teste já é a explicação do cenário: um app **velho** rodando num
pendrive, aberto **depois** de um `dados.json` ter sido gravado por uma versão **mais
nova** do código (rodando na outra máquina do autor). `doFuturo` simula esse arquivo
"do futuro": tem tudo que `estadoInicial()` tem, mais um campo (`investimentos`) que
não existe em nenhuma lista fixa de campos conhecidos. `carregar` (que chama `migrar`
por baixo) é aplicado, e o teste confere três ângulos: o campo desconhecido
**sobrevive** intacto (`deepEqual`, não só "existe" — os valores exatos batem); o que
**já** era conhecido (`transacoes`) continua funcionando normalmente; e um **round-trip**
completo (carregar → serializar de novo → carregar de novo) **não perde nada** —
simulando o ciclo real de "abre o app, grava de novo" que aconteceria na prática.

**Armadilha que pegaria.** A implementação de `migrar` monta o objeto de saída com
`{ ...dados, schemaVersion: ..., cartoes: ..., transacoes: ..., ... }` — o `...dados`
espalhado **primeiro** é o que faz campos desconhecidos sobreviverem (ver
[`model.explicado.md`](./model.explicado.md#por-que-dados-antes-das-chaves-conhecidas-o-caso-real-que-motivou)).
Se alguém reescrevesse `migrar` para montar o objeto **só** com a lista de campos que
o código conhece (`{ schemaVersion, config, cartoes, transacoes, ... }`, sem o
`...dados` inicial) — um jeito, aliás, mais "limpo" à primeira vista — `investimentos`
**desapareceria em silêncio** na primeira chamada de `migrar`. Não haveria erro, não
haveria log: só um dado perdido para sempre na próxima gravação. É exatamente esse
silêncio que torna o bug perigoso, e exatamente esse silêncio que o `assert.deepEqual`
torna impossível de ignorar.

**Histórico do PLANO.md.** Este não é um cenário hipotético de aula — é um bug **real**
que aconteceu, documentado em detalhe na **sessão 9** e resolvido no commit `c9ad1e1`:
*"`migrar()` preserva campo desconhecido (`c9ad1e1`). Ele reconstruía o estado a
partir de uma lista fixa, então app velho abrindo dado novo descartava os blocos que
não conhecia, em silêncio, na primeira gravação. Com o `.exe` de 14/07 no pendrive,
isso apagaria `planejamentos` e `reservas`"* (`PLANO.md`). A urgência do fix aparece
de novo na **sessão 10**, que registra o risco em detalhe antes de finalmente
rebuildar o `.exe` do pendrive: *"até o `c9ad1e1` o `migrar()` descartava campo fora
da lista fixa — abrir o `dados.json` atual naquele build apagaria `planejamentos` e
`reservas` na primeira gravação, calado"* (`PLANO.md`). Este teste é a garantia de que
esse bug específico — perda silenciosa de campo novo por build antigo — **nunca mais
volta a acontecer sem que `npm run test:core` denuncie**.

---

## Teste 19 — migrar continua saneando campo conhecido com lixo

```js
test('migrar continua saneando campo conhecido com lixo (o preserve não abriu buraco)', () => {
  const e = carregar(JSON.stringify({ transacoes: 'nao é array', faturas: null, config: { moeda: 'BRL' } }));
  assert.deepEqual(e.transacoes, []);
  assert.deepEqual(e.faturas, []);
  assert.equal(e.config.moeda, 'BRL');
  assert.equal(e.schemaVersion, estadoInicial().schemaVersion);
});
```

**O que este teste trava.** Que a blindagem do Teste 18 (preservar campo
**desconhecido**) não abriu uma brecha para campos **conhecidos e corrompidos**
passarem sem tratamento. É o par complementar do teste anterior: um garante "o que eu
não conheço sobrevive"; este garante "o que eu conheço continua sendo **validado**,
mesmo vindo torto".

**Como.** O nome do teste entrega a intenção — "**o preserve não abriu buraco**". O
arquivo de entrada é hostil de propósito: `transacoes` vem como uma **string**
(`'nao é array'`), não um array; `faturas` vem `null`; `config` vem **parcial** (só
`moeda`, sem `categorias`, `formasPagamento` etc.). O teste confere que, mesmo assim,
`transacoes` e `faturas` nascem como arrays **vazios** (não a string nem o `null`
crus), que `config.moeda` sobrevive (o *merge* com os defaults não sobrescreve o que
veio), e que `schemaVersion` é sempre carimbado com a versão atual, nunca ausente.

**Armadilha que pegaria.** Se, ao corrigir o bug do `c9ad1e1` (Teste 18), alguém
tivesse simplificado demais e trocado toda a blindagem por um `...dados` cru sem as
checagens `Array.isArray(x) ? x : []` que vêm depois (ver
[`model.explicado.md §9`](./model.explicado.md#9--migrar--migração-versionada)),
`e.transacoes` sairia como a **string** `'nao é array'` — e o primeiro `.filter(...)`
ou `.map(...)` que qualquer parte do núcleo tentasse rodar sobre "transações" quebraria
com um erro de tipo, derrubando o app ao abrir um arquivo corrompido em vez de abrir
vazio graciosamente. Este teste é o que garante que a correção de um bug (preservar
campo novo) não **reintroduziu** outro (parar de sanear campo velho).

---

## Mapa mental da suíte

```
                    node:test + assert/strict (zero dependência)
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                          ▼
  model.js (1-4)         calculos.js (5-8)          index.js / features (9-19)
  somaMeses, mesDe,       resumoMes, resumoAno,      carregar/migrar,
  rotuloMes,              dinheiroEmConta,           planejamento, reserva,
  mesPrimeiraFatura,      scoreSaude                 metas
  parcelasDaTransacao
        │                       │                          │
        └──── convenção temporal (parcela conta no mesFatura) ────┘
                     atravessa TODOS os blocos acima

  Teste 4 (resíduo)  → guarda a invariante do CLAUDE.md
  Teste 12 (repetir) → guarda contra duplicação (citado no PLANO.md)
  Teste 13 (reserva) → guarda contra o bug da coluna "Ação" da planilha
  Teste 18 (migrar)  → guarda contra o bug real do c9ad1e1 (perda silenciosa)
```

## Conceitos que apareceram (recapitulando)

| Conceito | Onde aparece | Ideia de uma frase |
|---|---|---|
| **Runner nativo, zero dependência** | imports do arquivo | `node:test`/`node:assert/strict` — coerente com "offline, sem build" |
| **`assert/strict`** | todo o arquivo | `===` e `deepStrictEqual` — rigor de tipo ao comparar dinheiro |
| **Arrange-Act-Assert** | todo teste | monta cenário → chama função → compara resultado |
| **Fixture mínima** | todo teste | só os dados que provam o ponto, nunca uma base "realista" |
| **Borda escolhida a dedo** | Testes 3, 4, 6, 16 | `100/3`, dia 26, dez/26, `atual===alvo` — nunca o meio confortável |
| **Nome que documenta** | todo `test(...)` | ler só os títulos já lista as invariantes do sistema |
| **Regressão travada por teste, não por comentário** | Testes 12, 13, 18 | comportamento vira executável, não só memória de quem escreveu |
| **`assert.deepEqual` vs `assert.equal`** | Testes 4, 6, 18, 19 | objeto/array inteiro vs valor escalar |
| **Faixa em vez de valor exato** | Testes 8, 16 (último caso) | `assert.ok(x >= a && x <= b)` quando o exato seria frágil demais |
| **Sequência de mutações no mesmo estado** | Testes 10, 12, 13, 17 | um "filme" de chamadas, cada uma conferida antes da próxima |
| **Determinismo** | todo o arquivo | mesma entrada, mesma saída sempre — pré-condição para testar |
| **Round-trip** | Teste 18 | carregar → salvar → carregar não pode perder dado |

---

**Quer praticar?** [`EXERCICIOS.md`](./EXERCICIOS.md) seção H pede pra escrever testes
novos — inclusive um para a lacuna que o Teste 3 deixa em aberto (o dia **exato** do
fechamento, não só antes/depois dele).
