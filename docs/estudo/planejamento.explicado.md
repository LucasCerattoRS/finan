# `src/core/planejamento.js` — explicado

> **O que é este arquivo:** o **orçamento mensal** — você diz quanto *pretende*
> gastar em cada categoria, e o app põe isso lado a lado com o que *de fato* saiu.
> Era a aba "Planejamento PM" da planilha.
>
> **Papel na arquitetura:** feature de leitura. Cruza `estado.planejamentos` (o que
> você planejou) com `gastoPorCategoria` do [`calculos`](./calculos.explicado.md) (o
> real, já com parcelas de cartão somadas). As mutações
> (definir/repetir/remover) ficam no [`index.js`](./index.explicado.md), como as das
> outras entidades.

---

## Bloco 0 — o cabeçalho

```js
// planejamento.js — orçamento mensal (estimado × real por categoria).
// Era a aba "Planejamento PM" da planilha (macro salvarPlanejamentoPM): você diz
// quanto PRETENDE gastar em cada categoria no mês; aqui isso fica lado a lado com
// o REAL (gastoPorCategoria, que já soma as parcelas do cartão) e a diferença.
// Puro, sem DOM — as mutações (definir/repetir/remover) ficam no index.js, como
// as das outras entidades.

import { paraCentavos, paraReais } from './model.js';
import { gastoPorCategoria } from './calculos.js';
```

Duas fontes vão ser cruzadas: **estimado** (de `estado.planejamentos`) e **real** (de
`gastoPorCategoria`). O arquivo é só **leitura** — segue o contrato "calcula, não
grava" da camada de cálculos.

---

## Bloco 1 — juntar estimado e real (as duas primeiras metades)

```js
export function planejamentoDoMes(estado, mes) {
  const estimados = new Map();
  for (const p of estado.planejamentos || []) {
    if (p.mes === mes) {
      estimados.set(p.categoria, (estimados.get(p.categoria) || 0) + Number(p.estimado || 0));
    }
  }
  const reais = new Map();
  for (const { categoria, valor } of gastoPorCategoria(estado, mes)) {
    reais.set(categoria, valor);
  }
```

**O que faz.** Monta dois dicionários `categoria → valor`: um dos **estimados** do
mês, outro dos **reais**.

- **`estimados`** — percorre `planejamentos`, fica só com os do `mes`, e **acumula**
  por categoria (`(estimados.get(cat) || 0) + ...`). O acúmulo cobre o caso de haver
  mais de uma linha de planejamento pra mesma categoria no mês — soma em vez de a
  última sobrescrever.
- **`reais`** — reaproveita `gastoPorCategoria(estado, mes)`, que **já** soma saídas
  diretas **e** parcelas de cartão pela categoria. Aqui está o valor de compor:
  todo o trabalho de "parcela conta no mês da fatura" vem de graça, sem duplicar
  lógica.

**Sintaxe — `for (const { categoria, valor } of ...)`.** **Destructuring** no
cabeçalho do laço: cada item de `gastoPorCategoria` é `{categoria, valor}`, e o `for`
já desmonta os dois campos. Mais limpo que `item.categoria` / `item.valor`.

---

## Bloco 2 — a união de categorias e o item de cada uma

```js
  const categorias = new Set([...estimados.keys(), ...reais.keys()]);
  const itens = [...categorias].map((categoria) => {
    const estimado = estimados.get(categoria) || 0;
    const real = reais.get(categoria) || 0;
    return {
      categoria,
      estimado,
      real,
      // em centavos para não herdar erro de float na subtração
      diferenca: paraReais(paraCentavos(estimado) - paraCentavos(real)),
      planejado: estimados.has(categoria),
    };
  });
```

**O que faz.** Para **cada** categoria que aparece num lado **ou** no outro, monta um
item com estimado, real, diferença e a flag `planejado`.

**A união das chaves — a decisão importante:**
```js
const categorias = new Set([...estimados.keys(), ...reais.keys()]);
```
Junta as chaves dos **dois** mapas num `Set` (que deduplica). Por que a **união**, e
não só as categorias planejadas? O comentário do código original explica: mostrar
também categorias **sem meta que tiveram gasto** — senão o "estourei o mês num lugar
que nem planejei" ficaria **escondido**. Um orçamento que só mostra o que você
planejou mente por omissão. A união garante que todo gasto apareça.

**`estimado = estimados.get(categoria) || 0`** — categoria que só existe no lado real
(gastou sem planejar) entra com estimado `0`. E vice-versa: planejou e não gastou →
real `0`.

**A diferença em centavos (integridade do dinheiro):**
```js
diferenca: paraReais(paraCentavos(estimado) - paraCentavos(real)),
```
`estimado − real`: positivo = ainda **cabe** no orçamento; negativo = **estourou**.
Converte os dois para centavos **antes** de subtrair, e volta a reais no fim — o
mesmo cuidado de float de todo o app (`1.1 - 1.0` em float dá `0.10000000000000009`;
`110 - 100` dá `10`, exato). O comentário no código sinaliza essa intenção.

**`planejado: estimados.has(categoria)`** — flag booleana que diz se aquela linha
**tinha** meta. A UI usa pra separar "planejadas" de "apareceu sem meta".

---

## Bloco 3 — a ordenação (o comparador de três níveis)

```js
  // planejadas primeiro (maior orçamento no topo); depois o que gastou sem meta.
  itens.sort((a, b) => (
    a.planejado === b.planejado
      ? (b.estimado - a.estimado) || (b.real - a.real)
      : (a.planejado ? -1 : 1)
  ));
```

**O que faz.** Ordena os itens com três critérios em cascata:
1. **Planejadas antes das não-planejadas.**
2. Entre as planejadas, **maior orçamento no topo**.
3. Empate no orçamento? **maior gasto real** desempata.

**Como o comparador expressa isso.** Um comparador devolve negativo (a antes de b),
positivo (b antes de a) ou zero (tanto faz). Lendo de dentro pra fora:

- `a.planejado === b.planejado ? (...) : (a.planejado ? -1 : 1)` — **primeiro
  critério**: se os dois têm o mesmo status de "planejado", cai no desempate interno;
  se **não**, a planejada (`a.planejado` verdadeiro → `-1`, vem antes) ganha.
- `(b.estimado - a.estimado) || (b.real - a.real)` — **segundo e terceiro critérios**:
  compara orçamentos (decrescente, `b - a`). Se der `0` (empate), o `||` cai pro
  desempate por gasto real. **Truque:** `0` é falsy, então `0 || (próximo critério)`
  usa o próximo. É o idioma de "comparadores em cadeia" — desempatar sem `if`
  aninhado.

**Conceito por trás — ordenação por múltiplas chaves.** "Ordene por X, depois por Y,
depois por Z" é comuníssimo (é o `ORDER BY a, b, c` do SQL). Em JS se expressa com um
comparador que **retorna o primeiro critério não-zero**. Reconhecer o padrão
`(criterioA) || (criterioB) || ...` deixa esse tipo de ordenação trivial de ler e
escrever.

---

## Bloco 4 — os totais

```js
  const totalEstimadoCent = itens.reduce((s, i) => s + paraCentavos(i.estimado), 0);
  const totalRealCent = itens.reduce((s, i) => s + paraCentavos(i.real), 0);
  return {
    mes,
    itens,
    totalEstimado: paraReais(totalEstimadoCent),
    totalReal: paraReais(totalRealCent),
    diferenca: paraReais(totalEstimadoCent - totalRealCent),
  };
}
```

**O que faz.** Soma os estimados e os reais (em centavos, claro) e devolve o pacote
completo: o mês, a lista de itens já ordenada, e os três totais (estimado, real,
diferença geral).

**Por que somar do `itens` e não recalcular.** Os totais vêm da **mesma** lista que a
UI vai desenhar. Assim, o rodapé ("planejou R$ 3.000, gastou R$ 3.240, estourou R$
240") **sempre** bate com a soma das linhas visíveis — não há como a tabela e o total
divergirem. É a coerência "o todo é a soma exata das partes mostradas".

---

## Mapa mental

```
  estado.planejamentos (do mês) ──► Map estimados[categoria]
  gastoPorCategoria(estado,mes) ──► Map reais[categoria]   (já com parcelas)
                    │
       união das chaves (Set)  ← mostra até gasto SEM meta (não esconde estouro)
                    │
        item por categoria: {estimado, real, diferenca(centavos), planejado}
                    │
        sort: planejadas 1º · maior orçamento · desempata por real
                    │
        + totais (estimado/real/diferença) ──► UI de orçamento
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Cruzar duas fontes por chave** | `estimados` × `reais` | dois `Map` categoria→valor, juntados na comparação |
| **União de chaves** | `new Set([...a.keys(), ...b.keys()])` | não esconder o que existe só de um lado |
| **`get(k) \|\| 0`** | estimado/real ausente | lado faltante entra como zero |
| **Subtrair em centavos** | `diferenca` | evitar erro de float na conta que o usuário vê |
| **Comparador multi-chave** | `sort(...)` | `(critA) \|\| (critB)`: primeiro não-zero decide |
| **`0` é falsy no `\|\|`** | desempate | empate (0) cai automaticamente pro próximo critério |
| **Composição** | reusa `gastoPorCategoria` | "parcela conta no mês certo" vem de graça |
| **Totais a partir da lista mostrada** | `reduce` no fim | rodapé nunca diverge das linhas |

**Próximo:** [`reserva`](./reserva.explicado.md) — a reserva de emergência como um
"earmark" (dinheiro reservado que não é gasto), com meta em meses de gasto médio.
