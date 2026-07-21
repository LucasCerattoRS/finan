# `src/core/faturas.js` — explicado

> **O que é este arquivo:** a regra que decide, para **uma compra no cartão**, em
> qual fatura (qual mês) ela vai cair. É pequeno — uma função só — mas é o
> alicerce de todo o resto do cartão.
>
> **Papel na arquitetura:** primeiro elo da cadeia do cartão.
> `faturas.js` (em que mês cai) → `parcelas.js` (quantas parcelas, em que meses) →
> `faturasPagas.js` (quanto custa e o que falta pagar).
>
> **Por que começar por aqui:** é a peça mais isolada e a regra de negócio mais
> "de banco" do app. Entendê-la sozinha deixa as próximas fáceis.

---

## Bloco único — `mesPrimeiraFatura`

```js
// faturas.js — em que fatura (mês) cai uma compra no cartão.
// Regra herdada da planilha: compra ATÉ o dia de fechamento entra na fatura
// que vence no mês seguinte; DEPOIS do fechamento, pula um mês a mais.

import { mesDe, somaMeses } from './model.js';

// Retorna o "YYYY-MM" da 1ª fatura de uma compra feita em dataISO com o cartão.
export function mesPrimeiraFatura(dataISO, cartao) {
  const fechamento = Number(cartao?.fechamento) || 1;
  const dia = Number(String(dataISO).slice(8, 10)) || 1;
  const mesCompra = mesDe(dataISO);
  // compra até o fechamento -> fatura do mês seguinte; depois -> +2 meses.
  const offset = dia <= fechamento ? 1 : 2;
  return somaMeses(mesCompra, offset);
}
```

### O que faz

Dada a **data** da compra e o **cartão** (que tem um dia de `fechamento`),
devolve o mês (`"YYYY-MM"`) da **primeira** fatura em que essa compra aparece.

### O conceito de negócio: dia de fechamento

Todo cartão tem um **dia de fechamento**: a data em que o banco "fecha" a conta do
mês e emite a fatura. A regra herdada da planilha é:

- Comprou **no dia do fechamento ou antes** → entra na fatura que vence **no mês
  seguinte** (offset +1).
- Comprou **depois do fechamento** → já era; essa compra só entra na fatura do
  **mês seguinte ao seguinte** (offset +2).

Exemplo, cartão com fechamento no dia 10:

| Data da compra | dia | `dia <= 10`? | offset | 1ª fatura |
|---|---|---|---|---|
| 05/03/2026 | 5  | sim  | +1 | 2026-04 |
| 10/03/2026 | 10 | sim  | +1 | 2026-04 |
| 11/03/2026 | 11 | não  | +2 | 2026-05 |
| 28/03/2026 | 28 | não  | +2 | 2026-05 |

É por isso que uma compra no fim do mês parece "sumir" e só aparecer na fatura
retrasada — não é bug, é o fechamento.

### A sintaxe, linha a linha

- **`cartao?.fechamento`** — o `?.` é o **optional chaining** (encadeamento
  opcional). Se `cartao` for `null`/`undefined`, a expressão inteira vira
  `undefined` em vez de estourar `Cannot read property 'fechamento' of null`. É
  um cinto de segurança: a função não quebra se chamarem sem cartão.
- **`Number(cartao?.fechamento) || 1`** — converte pra número e, se der `NaN`,
  `0`, `undefined` (todos falsy), assume `1` como padrão. Cartão sem dia de
  fechamento configurado vira "fecha dia 1".
- **`String(dataISO).slice(8, 10)`** — extrai o **dia** de uma data `"YYYY-MM-DD"`.
  As posições 8 e 9 são o dia (`"2026-03-11"` → índice 8=`'1'`, 9=`'1'` → `"11"`).
  O `String(...)` em volta protege caso `dataISO` venha como outro tipo.
- **`Number(...) || 1`** de novo — dia inválido cai pra 1.
- **`dia <= fechamento ? 1 : 2`** — **operador ternário**: `condição ? seVerdadeiro
  : seFalso`. É um `if/else` que devolve um valor. Aqui escolhe o offset.
- **`somaMeses(mesCompra, offset)`** — soma meses respeitando a virada de ano
  (dezembro + 1 = janeiro do ano seguinte). Essa aritmética de calendário mora no
  `model.js`, então aqui não se mexe em ano na mão.

### Conceito por trás — "programação defensiva" com padrões sensatos

Repare quantos `|| 1` e `?.` há em 6 linhas. A função assume que **os dados podem
vir sujos** (cartão faltando, data malformada) e, em vez de quebrar, escolhe um
padrão razoável e segue. Isso se chama *programação defensiva* / *tolerant reader*:
a função é rígida no que **devolve** (sempre um `"YYYY-MM"` válido) e tolerante no
que **aceita**. É o mesmo espírito do `migrar` do `model.js`.

**Trade-off honesto.** Tolerância demais pode **esconder** bug de dado ruim (uma
data quebrada vira "dia 1" caladinho, em vez de gritar). A escolha aqui pende para
"nunca travar o app do usuário por um dado torto" — coerente com um app pessoal
offline, onde travar é pior que assumir um padrão.

### Armadilha — por que `<=` e não `<`

O comparador é `dia <= fechamento`: comprar **no próprio dia** do fechamento ainda
entra na fatura mais cedo. Trocar por `<` empurraria as compras do dia do
fechamento um mês pra frente — um "erro de um" (*off-by-one*) que muda o resultado
de milhares de compras. Bugs de fronteira (`<` vs `<=`, `+1` vs `+2`) são dos mais
comuns e dos mais silenciosos; aqui a regra da planilha define a fronteira e o
código a copia exatamente.

---

## Conceitos que apareceram

| Conceito | Ideia de uma frase |
|---|---|
| **Optional chaining `?.`** | acessa propriedade sem quebrar se o objeto for nulo |
| **`Number(x) \|\| padrão`** | converte e cai num default se der falsy/`NaN` |
| **`.slice(início, fim)` em data** | extrair pedaço por posição fixa do `"YYYY-MM-DD"` |
| **Operador ternário** | `cond ? a : b` — um `if/else` que devolve valor |
| **Programação defensiva** | aceitar dado torto e assumir padrão em vez de travar |
| **Erro de fronteira (off-by-one)** | `<=` vs `<` muda o mês de milhares de compras |
| **Aritmética de calendário delegada** | virada de ano mora em `somaMeses`, não aqui |

**Próximo:** [`parcelas`](./parcelas.explicado.md) — como uma compra vira N parcelas
espalhadas pelas faturas, usando este `mesPrimeiraFatura` como ponto de partida.
