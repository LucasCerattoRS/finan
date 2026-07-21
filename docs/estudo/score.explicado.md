# `src/core/score.js` — explicado

> **O que é este arquivo:** o **Score de saúde financeira** (0–100), como na
> planilha (74 = "Saudável"). Ele resume, num número só, três perguntas: *sobra
> dinheiro? o gasto é essencial? o futuro está comprometido?* É um bom estudo de
> como se transforma "sensação" em métrica defensável.
>
> **Papel na arquitetura:** uma feature de leitura. Depende de
> [`calculos`](./calculos.explicado.md) (`resumoMes`, `essencialVsNao`) e de
> [`parcelas`](./parcelas.explicado.md). Alimenta o medidor (gauge) da tela Início.

---

## Bloco 0 — o cabeçalho: a fórmula em palavras

```js
// score.js — Score de saúde financeira (0–100), como na planilha (74 = "Saudável").
// Composto por 3 pilares, cada um 0..1, ponderados:
//   - saldo (40%): saldo do mês positivo em relação às entradas.
//   - essencialidade (35%): quanto das saídas é Essencial.
//   - comprometimento futuro (25%): quanto das entradas do mês já está
//     comprometido com parcelas futuras (quanto menor, melhor).

import { resumoMes, essencialVsNao } from './calculos.js';
import { todasParcelas } from './parcelas.js';
import { paraCentavos } from './model.js';
```

**O modelo:** o score é uma **média ponderada** de três pilares, cada um medido de
`0` a `1`:

| Pilar | Peso | Mede | Bom quando |
|---|---|---|---|
| Saldo | 40% | quanto sobra vs. o que entra | alto |
| Essencialidade | 35% | fração das saídas que é "Essencial" | alto |
| Comprometimento futuro | 25% | parcelas futuras vs. entradas | **baixo** (então: 1 − isso) |

**Conceito por trás — índice composto.** Nenhum número sozinho descreve "saúde
financeira". A técnica é escolher poucos indicadores, normalizar cada um para a
mesma escala (`0..1`), e combiná-los com pesos que refletem a importância relativa.
Os pesos (40/35/25) são um **juízo de valor explícito** — estão no código, à vista,
podendo ser discutidos e ajustados. É honesto: a "opinião" do app sobre o que é
saudável está escrita, não escondida.

---

## Bloco 1 — a faixa (rótulo do número)

```js
export function faixaScore(score) {
  if (score >= 80) return 'Excelente';
  if (score >= 65) return 'Saudável';
  if (score >= 45) return 'Atenção';
  return 'Crítico';
}
```

**O que faz.** Traduz o número numa palavra. `74` → `'Saudável'`.

**Sintaxe — a escada de `if` com `return`.** Os testes são feitos **do maior pro
menor** e cada um retorna na hora. Quando `score = 74`, o primeiro `if` (`>= 80`)
falha, o segundo (`>= 65`) passa e retorna — sem precisar escrever `74 >= 65 && 74 <
80`, porque chegar no segundo `if` **já garante** que não é `>= 80`. Essa ordem
decrescente é o que dispensa o limite superior de cada faixa.

**Conceito por trás — dar nome a faixas contínuas.** Um número de 0 a 100 é preciso
mas frio; a faixa dá **significado**. É o mesmo que um termômetro virar "febre".
Separar o *cálculo* do número da sua *interpretação* (duas funções) deixa cada um
mudar sem mexer no outro.

---

## Bloco 2 — o cálculo do score (o coração)

```js
export function scoreSaude(estado, mes) {
  const r = resumoMes(estado, mes);
  const entradasCent = paraCentavos(r.entradas);

  // Pilar 1: saldo. saldoMes/entradas, saturado em [0,1].
  let pSaldo;
  if (entradasCent <= 0) {
    pSaldo = r.saldoMes >= 0 ? 0.5 : 0;
  } else {
    pSaldo = clamp(paraCentavos(r.saldoMes) / entradasCent, 0, 1);
  }

  // Pilar 2: essencialidade das saídas.
  const { essencial, naoEssencial } = essencialVsNao(estado, mes);
  const totalCls = paraCentavos(essencial) + paraCentavos(naoEssencial);
  const pEssencial = totalCls > 0 ? paraCentavos(essencial) / totalCls : 0.7;

  // Pilar 3: comprometimento futuro (parcelas que vencem depois deste mês).
  const futurasCent = todasParcelas(estado)
    .filter((p) => p.mesFatura > mes)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  let pFuturo;
  if (entradasCent <= 0) {
    pFuturo = futurasCent > 0 ? 0.3 : 0.7;
  } else {
    pFuturo = clamp(1 - futurasCent / entradasCent, 0, 1);
  }

  const score = Math.round((pSaldo * 0.40 + pEssencial * 0.35 + pFuturo * 0.25) * 100);
  return {
    score,
    faixa: faixaScore(score),
    pilares: {
      saldo: Math.round(pSaldo * 100),
      essencialidade: Math.round(pEssencial * 100),
      comprometimentoFuturo: Math.round(pFuturo * 100),
    },
  };
}
```

**O que faz.** Calcula os três pilares (cada um `0..1`), combina com os pesos, e
devolve `{ score, faixa, pilares }` — o número, o rótulo, e a nota de cada pilar
(pra UI explicar *por que* o score está naquele valor).

### Pilar 1 — saldo

```js
if (entradasCent <= 0) {
  pSaldo = r.saldoMes >= 0 ? 0.5 : 0;
} else {
  pSaldo = clamp(paraCentavos(r.saldoMes) / entradasCent, 0, 1);
}
```
A ideia normal: `saldo / entradas`. Sobrou metade do que entrou → `0.5`. Sobrou tudo
→ `1`. Gastou mais do que entrou (saldo negativo) → o `clamp` prende em `0`.

**O `if (entradasCent <= 0)` trata um caso de canto: mês sem entradas.** Sem essa
guarda, `saldo / 0` daria `Infinity` ou `NaN` e envenenaria o score. A regra
escolhida: sem entradas mas sem ficar no vermelho → `0.5` (neutro); sem entradas e
no vermelho → `0`. É uma decisão de negócio para o mês atípico (começo de uso, mês
sem renda registrada).

### Pilar 2 — essencialidade

```js
const pEssencial = totalCls > 0 ? paraCentavos(essencial) / totalCls : 0.7;
```
Fração das saídas **classificadas** que é "Essencial". Repare que o denominador é
`essencial + naoEssencial` — só o que foi classificado (o `essencialVsNao` do
[`calculos`](./calculos.explicado.md) já ignora o não-classificado). Se nada foi
classificado (`totalCls == 0`), assume `0.7` — um padrão otimista-neutro, pra não
punir quem ainda não classificou nada.

### Pilar 3 — comprometimento futuro (o pilar invertido)

```js
const futurasCent = todasParcelas(estado)
  .filter((p) => p.mesFatura > mes)
  .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
let pFuturo;
if (entradasCent <= 0) {
  pFuturo = futurasCent > 0 ? 0.3 : 0.7;
} else {
  pFuturo = clamp(1 - futurasCent / entradasCent, 0, 1);
}
```
Soma as parcelas que vencem **depois** deste mês (o peso do futuro sobre você). Aqui
está a sutileza: comprometimento alto é **ruim**, mas o score é "quanto maior
melhor". Então **inverte-se**: `pFuturo = 1 − (futuras / entradas)`. Muitas parcelas
futuras → o pilar cai. Nenhuma → o pilar vai a `1`. O `clamp(…, 0, 1)` segura o caso
"deve mais de uma renda inteira em parcelas" (a razão passa de 1, `1 − razão` fica
negativo → prende em `0`). E de novo o `if (entradasCent <= 0)` trata o mês sem
entradas: sem isso, `futurasCent / 0` envenenaria a conta; com faturas futuras e sem
entrada, `0.3` (ruim); sem faturas e sem entrada, `0.7` (neutro-bom).

**Conceito por trás — normalizar o "sentido" antes de somar.** Numa média ponderada,
**todos** os pilares têm que apontar pro mesmo lado ("maior = melhor"). Um indicador
que é naturalmente "menor = melhor" precisa ser invertido (`1 − x`) antes de entrar
na conta. Misturar sentidos é um erro clássico de índice composto — aqui evitado de
propósito.

### A combinação final

```js
const score = Math.round((pSaldo * 0.40 + pEssencial * 0.35 + pFuturo * 0.25) * 100);
```
Média ponderada dos três (os pesos somam `1.0`), multiplicada por 100 e arredondada.
Como cada pilar está em `[0,1]` e os pesos somam 1, o resultado cai naturalmente em
`[0,100]` — não precisa de outro clamp aqui.

**Retorno rico.** Além do `score`, devolve os `pilares` (cada um em 0–100). Isso é
**transparência**: a UI mostra "seu score é 62 porque essencialidade está em 40". Um
número sozinho é um veredito; os pilares são a **explicação**. Sempre que possível,
uma métrica composta deve poder se abrir.

---

## Bloco 3 — o `clamp`

```js
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
```

**O que faz.** Prende `v` no intervalo `[min, max]`. `clamp(1.3, 0, 1)` → `1`;
`clamp(-0.2, 0, 1)` → `0`; `clamp(0.5, 0, 1)` → `0.5`.

**Como funciona o truque `max(min, min(max, v))`:**
- `Math.min(max, v)` — corta o **teto**: nada passa de `max`.
- `Math.max(min, ...)` — corta o **piso**: nada fica abaixo de `min`.
Aplicados em sequência, prendem dos dois lados. É o idioma canônico de *clamp* em
JS (que não tem `Math.clamp` nativo).

**Por que aparece tanto.** Toda razão "parte/todo" pode estourar `[0,1]` quando os
dados são atípicos (saldo maior que entradas, dívida maior que renda). O `clamp` é a
**rede de segurança** que garante que cada pilar respeite sua escala antes de virar
peso. É o mesmo `Math.min(1, …)`/`Math.max(0, …)` que você viu no `resumoFatura` do
[`faturasPagas`](./faturasPagas.explicado.md), agora empacotado num helper nomeado —
porque aqui ele se repete e o nome comunica a intenção ("saturar em faixa").

---

## Mapa mental

```
  resumoMes ─► saldoMes, entradas ─┐
                                    ├─► Pilar saldo (40%)  ─┐
  essencialVsNao ─► essencial ──────► Pilar essenc. (35%) ─┼─► média ponderada ×100
                                                            │      → score (0–100)
  todasParcelas (mesFatura>mes) ────► 1 − comprometido (25%)┘      → faixaScore → rótulo
                                                                   → pilares (explicação)
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Índice composto** | `scoreSaude` | vários indicadores normalizados e ponderados num número |
| **Pesos explícitos** | `0.40/0.35/0.25` | o juízo de valor mora no código, à vista |
| **Normalizar para `[0,1]`** | cada pilar | pôr indicadores diferentes na mesma escala |
| **Inverter o sentido** | `1 − comprometido` | "menor é melhor" vira "maior é melhor" antes de somar |
| **`clamp` (saturação)** | helper | prender razões atípicas dentro da faixa válida |
| **Guardar caso de canto** | `entradasCent <= 0` | mês sem renda não vira `NaN`/`Infinity` |
| **Padrão neutro na ausência** | `0.7` sem classificação | não punir dado que ainda não existe |
| **Escada de `if` decrescente** | `faixaScore` | a ordem dispensa o limite superior de cada faixa |
| **Retorno explicável** | `pilares` no retorno | o número vem com o porquê |

**Próximo:** [`planejamento`](./planejamento.explicado.md) — orçamento do mês
(estimado × real por categoria), outra leitura que cruza planejado com o que
`gastoPorCategoria` apurou.
