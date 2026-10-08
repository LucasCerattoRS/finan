# `src/core/parcelas.js` — explicado

> **O que é este arquivo:** o "explodidor". Pega **uma** compra parcelada no cartão
> e a transforma em **N parcelas**, cada uma no seu mês de fatura. Aqui mora a regra
> mais delicada de integridade do app: **a soma das parcelas tem que fechar o valor
> da compra**, ao centavo.
>
> **Papel na cadeia do cartão:** [`faturas`](./faturas.explicado.md) (mês da 1ª
> fatura) → **`parcelas`** (explode em N) → [`faturasPagas`](./faturasPagas.explicado.md)
> (custo e pagamento).

---

## Bloco 0 — o cabeçalho e as duas dependências

```js
// parcelas.js — explode compras no cartão (tipo "cartao") em parcelas.
// Herdado da aba "Parcelas": N parcelas de valor/N, distribuídas nas faturas.
// A última parcela absorve o resíduo do arredondamento -> a soma fecha o total.

import { paraCentavos, paraReais, somaMeses } from './model.js';
import { mesPrimeiraFatura } from './faturas.js';
```

**O que faz.** Traz as três ferramentas de dinheiro e data de [`model.js`](./model.explicado.md)
e a regra do mês da 1ª fatura de [`faturas.js`](./faturas.explicado.md). Nada de DOM, nada de
disco: só funções puras, e por isso o arquivo inteiro é testável com `node --test`.

**Por que cada uma:**
- `paraCentavos` / `paraReais` — a divisão em N parcelas é feita em **centavos inteiros**
  (Bloco 1); só no fim volta para reais. Com `float`, `100 / 3` deixaria um centavo sobrando ou faltando.
- `somaMeses` — a parcela `k` cai `k - 1` meses depois da primeira fatura.
- `mesPrimeiraFatura` — decide se a compra entra na fatura deste mês ou da próxima, pelo dia
  de fechamento do cartão. É a única dependência entre os dois arquivos da cadeia do cartão.

---

## Bloco 1 — explodir uma compra em parcelas

```js
// Gera as parcelas de UMA transação de cartão.
// Retorna [] se não for compra de cartão. Cada parcela:
// { transacaoId, cartaoId, categoria, descricao, classificacao,
//   n, de, valor, dataCompra, mesFatura }
export function parcelasDaTransacao(tx, cartao) {
  if (!tx || tx.tipo !== 'cartao') return [];
  const n = Math.max(1, Math.floor(Number(tx.parcelas) || 1));
  const totalCent = paraCentavos(tx.valor);
  const baseCent = Math.floor(totalCent / n);
  const resto = totalCent - baseCent * n; // vai na última parcela
  const mes1 = cartao ? mesPrimeiraFatura(tx.data, cartao) : (tx.data || '').slice(0, 7);

  const out = [];
  for (let k = 1; k <= n; k += 1) {
    const cent = baseCent + (k === n ? resto : 0);
    out.push({
      transacaoId: tx.id,
      cartaoId: tx.cartaoId,
      categoria: tx.categoria,
      descricao: tx.descricao || '',
      classificacao: tx.classificacao || '',
      n: k,
      de: n,
      valor: paraReais(cent),
      dataCompra: tx.data,
      mesFatura: somaMeses(mes1, k - 1),
    });
  }
  return out;
}
```

### O que faz

Recebe uma transação `tx` e o `cartao` dela, e devolve um **array de parcelas**. Se
`tx` não for do tipo `cartao`, devolve `[]` (nada a explodir).

### A guarda de entrada

```js
if (!tx || tx.tipo !== 'cartao') return [];
```

**Early return** (retorno antecipado): trata o caso "não me interessa" na primeira
linha e sai. O resto da função pode então assumir, sem re-verificar, que `tx` existe
e é de cartão. Devolver `[]` (e não `null`) é uma gentileza: quem chama pode fazer
`...parcelasDaTransacao(...)` num spread sem checar nada — array vazio espalha nada.

### Quantas parcelas, com sanidade

```js
const n = Math.max(1, Math.floor(Number(tx.parcelas) || 1));
```

Lida em três camadas com um `tx.parcelas` que pode vir torto:
- `Number(tx.parcelas) || 1` — converte; se vier vazio/`NaN`, assume 1.
- `Math.floor(...)` — corta casas decimais (2.7 parcelas não existe → 2).
- `Math.max(1, ...)` — piso 1 (protege contra 0 ou negativo, que fariam o laço
  nem rodar ou rodar errado).

Três defesas empilhadas para garantir que `n` seja **sempre** um inteiro ≥ 1. Sem
isso, `totalCent / n` poderia dividir por zero (→ `Infinity`) e envenenar tudo.

### O coração: repartir centavos sem perder um tostão

```js
const totalCent = paraCentavos(tx.valor);   // ex.: 10000 (R$ 100,00)
const baseCent = Math.floor(totalCent / n); // ex.: n=3 -> 3333
const resto = totalCent - baseCent * n;      // 10000 - 9999 = 1
```

Este é **o** ponto do arquivo. R$ 100,00 em 3x não divide certo: 100/3 = 33,333…
Se cada parcela fosse R$ 33,33, a soma daria R$ 99,99 — **sumiu um centavo**.

A solução:
1. Cada parcela recebe o **piso** da divisão inteira: `baseCent = floor(10000/3) = 3333`.
2. O que sobra (`resto = 10000 − 3333×3 = 1` centavo) vai **inteiro na última
   parcela**.

Resultado: `33,33 + 33,33 + 33,34 = 100,00`. **Fecha exato.** A última parcela
absorve o resíduo do arredondamento.

```js
const cent = baseCent + (k === n ? resto : 0);
```

Dentro do laço: toda parcela leva `baseCent`; só a última (`k === n`) leva o `resto`
a mais. O ternário embutido faz exatamente isso.

**Conceito por trás — conservação (invariante de soma).** A regra do CLAUDE.md diz
"a soma das parcelas tem que fechar o valor da compra". Isso é um **invariante**:
uma propriedade que tem que ser verdadeira **sempre**, faça o que fizer. Trabalhar
em centavos inteiros + jogar o resto na última parcela é a técnica clássica de
*rateio que conserva o total*. É o mesmo problema de dividir a conta do bar em 3:
alguém paga um centavo a mais.

**Armadilha clássica que isto evita.** O jeito ingênuo — `valor / n` arredondado em
cada parcela — perde ou cria centavos conforme o arredondamento. Em float ainda por
cima (`33.33 * 3 = 99.99000000000001`). Centavo inteiro + resíduo na ponta é exato e
determinístico.

### Onde começa a primeira parcela

```js
const mes1 = cartao ? mesPrimeiraFatura(tx.data, cartao) : (tx.data || '').slice(0, 7);
```

- **Com cartão**: usa a regra de fechamento do arquivo `faturas.js`.
- **Sem cartão** (fallback): usa o próprio mês da compra (`"YYYY-MM"`).

Um ternário escolhendo a origem. O fallback existe para a função **nunca** depender
de o cartão estar presente — degrada com elegância em vez de quebrar.

### Espalhar pelos meses

```js
mesFatura: somaMeses(mes1, k - 1),
```

A parcela `k` cai `k-1` meses depois da primeira: parcela 1 → `mes1`, parcela 2 →
`mes1 + 1`, e assim por diante. De novo, a aritmética de calendário é delegada a
`somaMeses`.

### Os campos copiados (`categoria`, `descricao`, `classificacao`…)

Cada parcela **carrega** a categoria/classificação da compra. Por quê? Porque lá no
`calculos.js` o `gastoPorCategoria` e o `essencialVsNao` percorrem parcelas e
precisam saber a que categoria cada pedaço pertence. Sem copiar, a parcela seria um
valor órfão, sem a que atribuir o gasto.

- `n: k` (qual parcela) e `de: n` (de quantas) permitem a UI mostrar "3/10".
- `descricao: tx.descricao || ''` e `classificacao: tx.classificacao || ''` —
  normalizam ausência para string vazia (nunca `undefined` no objeto de saída).

**Conceito por trás — parcelas são dados DERIVADOS, não guardados.** Note que a
função **calcula** as parcelas na hora, a partir da transação. Elas **não** ficam
salvas no `dados.json`. Muda o valor da compra? As parcelas são recalculadas do
zero na próxima leitura, sempre coerentes. É o mesmo princípio de "derivar em vez de
guardar" do `calculos.js` — uma fonte de verdade (a compra), o resto é projeção.

---

## Bloco 2 — todas as parcelas do estado

```js
// Todas as parcelas do estado (todas as compras de cartão explodidas).
export function todasParcelas(estado) {
  const porId = new Map((estado.cartoes || []).map((c) => [c.id, c]));
  const out = [];
  for (const tx of estado.transacoes || []) {
    if (tx.tipo !== 'cartao') continue;
    out.push(...parcelasDaTransacao(tx, porId.get(tx.cartaoId)));
  }
  return out;
}
```

### O que faz

Percorre **todas** as transações de cartão do estado e as explode, devolvendo uma
lista única com todas as parcelas de todos os cartões. É a função que `calculos.js`
tanto usa.

### O índice por id — do O(n²) ao O(n)

```js
const porId = new Map((estado.cartoes || []).map((c) => [c.id, c]));
```

Monta um **Map de `id → cartão`** de uma vez. Depois, `porId.get(tx.cartaoId)` acha
o cartão de cada transação em tempo constante.

**Por que isto importa (o conceito).** A alternativa ingênua seria, dentro do laço,
`estado.cartoes.find(c => c.id === tx.cartaoId)` — uma busca linear **para cada**
transação. Com T transações e C cartões isso é O(T×C). Pré-indexar num Map troca por
O(T+C): monta o índice uma vez (C), consulta em O(1) por transação (T). É o padrão
**"index once, look up many"** — o mesmo que um banco de dados faz com um índice.

- `.map((c) => [c.id, c])` produz pares `[chave, valor]`; o construtor `new Map([...])`
  os transforma em dicionário.

### O laço e o spread

```js
if (tx.tipo !== 'cartao') continue;
out.push(...parcelasDaTransacao(tx, porId.get(tx.cartaoId)));
```

- `continue` — pula transações que não são de cartão (entradas, saídas diretas).
- `out.push(...arr)` — o **spread** desempacota o array de parcelas e empurra os
  itens **um a um** em `out`. Sem os `...`, empurraria *um array dentro do array*,
  criando uma lista de listas. Com eles, `out` fica plano (achatado). É o idioma de
  "concatenar sem criar array intermediário".

---

## Bloco 3 — as parcelas de uma fatura específica

```js
// Parcelas que compõem a fatura de um cartão num mês ("YYYY-MM").
export function parcelasDaFatura(estado, cartaoId, mesFatura) {
  return todasParcelas(estado).filter(
    (p) => p.cartaoId === cartaoId && p.mesFatura === mesFatura,
  );
}
```

### O que faz

Filtra, de todas as parcelas, as que pertencem **àquele cartão** e caem **naquele
mês de fatura**. É o que `faturasPagas.js` usa para somar quanto custa uma fatura
calculada.

### Simplicidade honesta vs. desempenho

Repare: chama `todasParcelas(estado)` (explode **tudo**) e só então filtra por
cartão e mês. Recalcula o mundo inteiro para pegar um pedacinho.

**É "ineficiente" de propósito?** É uma escolha consciente: **legibilidade e uma
fonte única de verdade** acima de micro-otimização. `todasParcelas` é o único lugar
que sabe explodir; todo mundo passa por ele. Numa base pessoal (o `todasParcelas`
roda em milissegundos), o custo é invisível e o código fica trivial de entender e
impossível de dessincronizar. Se algum dia a base crescer a ponto de doer, aí sim
se cacheia — mas só depois de **medir**, não por palpite ("otimização prematura é a
raiz de todo mal").

---

## Mapa mental

```
  tx (compra de cartão)  +  cartao
             │
             ▼
   parcelasDaTransacao ──── reparte centavos (resto na última) + espalha por mesFatura
             │
   ┌─────────┴──────────┐
   ▼                    ▼
todasParcelas      parcelasDaFatura
(explode tudo)     (filtra 1 cartão/mês)
   │
   ▼
usado por calculos.js e faturasPagas.js
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Early return / guarda** | `if (!tx …) return []` | trata o caso trivial e sai; simplifica o resto |
| **Sanear entrada em camadas** | `Math.max(1, Math.floor(Number(...) \|\| 1))` | garantir inteiro ≥ 1 contra dado torto |
| **Rateio que conserva o total** | `resto` na última parcela | soma das partes = todo, ao centavo |
| **Invariante** | soma das parcelas = compra | propriedade que vale sempre, por design |
| **Dados derivados** | parcelas não são salvas | uma fonte de verdade (a compra), resto é projeção |
| **Index once, look up many** | `porId = new Map(...)` | pré-indexar troca O(n²) por O(n) |
| **Spread em `push`** | `out.push(...arr)` | achatar/concatenar sem array intermediário |
| **Otimização prematura** | `parcelasDaFatura` | clareza vence velocidade até o profiler discordar |

**Próximo:** [`faturasPagas`](./faturasPagas.explicado.md) — dado que sabemos
explodir parcelas, quanto uma fatura **custa**, quanto já foi **pago**, e por que
um pagamento **nunca** é contado como saída.
