# `src/core/metas.js` — explicado

> **O que é este arquivo:** a **calculadora de metas de longo prazo**. A partir da
> sua renda mensal e do patrimônio investido (informado à mão — o Finan é offline,
> não puxa cotação), calcula três alvos e, para cada um, **em quantos meses** você
> chega no seu ritmo de aporte. Aqui entra o conceito mais "matemático" do núcleo:
> **juros compostos**.
>
> **Papel na arquitetura:** feature de leitura, no topo da pilha. Reusa
> [`reserva`](./reserva.explicado.md) (`gastoMedioMensal`, `reservaAcumulada`).

---

## Bloco 0 — o cabeçalho: as três metas

```js
// metas.js — calculadora de metas financeiras. A partir da RENDA MENSAL (soma dos
// componentes em config.metas.rendaComponentes) e do PATRIMÔNIO INVESTIDO (informado
// à mão — o Finan é offline e não puxa cotação de banco/corretora), calcula três alvos:
//
//   • Reserva de emergência — N meses de GASTO médio (reusa o motor da reserva).
//   • Liberdade financeira — M meses de RENDA guardados como patrimônio.
//   • Viver de dividendos — patrimônio cuja renda passiva (yield a.a.) cobre a renda anual.

import { paraCentavos, paraReais } from './model.js';
import { gastoMedioMensal, reservaAcumulada } from './reserva.js';
```

Três metas de horizontes crescentes:
1. **Reserva de emergência** — N meses de **gasto**. Curto prazo, líquida (não rende).
2. **Liberdade financeira** — M meses de **renda** acumulados. Médio/longo prazo.
3. **Viver de dividendos** — patrimônio grande o bastante pra que a renda passiva
   (dividendos) cubra sua renda anual. O objetivo final.

Note a diferença de régua: reserva mede em **gasto**, as outras duas em **renda**. Faz
sentido — reserva é "sobreviver X meses parado"; liberdade é "ter X meses de renda no
banco".

---

## Bloco 1 — a renda mensal

```js
// Renda mensal = soma dos componentes (salário, benefícios, bolsa...), em reais.
export function rendaMensal(estado) {
  const comps = estado.config?.metas?.rendaComponentes || [];
  const cent = comps.reduce((s, c) => s + paraCentavos(c.valor), 0);
  return paraReais(cent);
}
```

**O que faz.** Soma os componentes de renda (salário + benefícios + bolsa…) num total
mensal. Um `reduce` em centavos.

**Sintaxe — `estado.config?.metas?.rendaComponentes || []`.** Optional chaining
**encadeado**: se `config` **ou** `metas` faltar, a expressão para em `undefined`
sem quebrar, e o `|| []` entrega um array vazio pro `reduce`. Descer três níveis num
objeto que pode ter buracos, com segurança, numa linha. Modelar renda como **soma de
componentes** (em vez de um número só) permite mostrar de onde ela vem e recalcular
quando uma parte muda.

---

## Bloco 2 — a simulação de juros compostos (a peça-chave)

```js
// Quantos meses, ao ritmo de `aporteMensal` e com juros compostos à `taxaAnual`, até o
// patrimônio `atual` alcançar o `alvo`. 0 se já alcançou; null se nunca chega (sem aporte
// e sem rendimento que faça o saldo crescer, ou levaria mais de 100 anos — na prática,
// "não chega"). Tudo em centavos por dentro, para não acumular erro de float.
export function mesesParaAlvo(atualReais, alvoReais, aporteMensalReais, taxaAnual = 0) {
  const alvo = paraCentavos(alvoReais);
  let saldo = paraCentavos(atualReais);
  const aporte = paraCentavos(aporteMensalReais);
  if (saldo >= alvo) return 0;
  const taxaMes = taxaAnual > 0 ? Math.pow(1 + taxaAnual, 1 / 12) - 1 : 0;
  for (let m = 1; m <= 1200; m += 1) {
    saldo = Math.round(saldo * (1 + taxaMes)) + aporte;
    if (saldo >= alvo) return m;
  }
  return null; // > 100 anos: sem aporte e sem saldo que renda, o alvo nunca é atingido.
}
```

**O que faz.** Responde "em quantos meses eu chego no alvo?", simulando **mês a mês**:
o saldo rende juros e recebe o aporte, até bater o alvo.

**A conversão de taxa anual → mensal (o ponto que mais confunde):**
```js
const taxaMes = taxaAnual > 0 ? Math.pow(1 + taxaAnual, 1 / 12) - 1 : 0;
```
A intuição errada é `taxaMes = taxaAnual / 12`. **Está errado** com juros compostos,
porque juros rendem sobre juros. A conta certa é a **raiz 12** (a taxa que, composta
12 vezes, dá a anual):

$$(1 + \text{taxaMes})^{12} = 1 + \text{taxaAnual} \;\Rightarrow\; \text{taxaMes} = (1+\text{taxaAnual})^{1/12} - 1$$

`Math.pow(1 + taxaAnual, 1/12)` é exatamente essa raiz décima-segunda (elevar a
`1/12` = tirar a raiz 12). Ex.: 12% a.a. **não** é 1% a.m., e sim ~0,949% a.m. — que
composto 12× dá os 12%. Confundir os dois superestima o rendimento.

**O laço de simulação:**
```js
for (let m = 1; m <= 1200; m += 1) {
  saldo = Math.round(saldo * (1 + taxaMes)) + aporte;
  if (saldo >= alvo) return m;
}
```
Cada volta é **um mês**: o saldo primeiro **rende** (`× (1 + taxaMes)`) e depois
**recebe o aporte**. Quando alcança o alvo, retorna o número do mês. Isto é
*simulação iterativa*: em vez de resolver a fórmula fechada da anuidade (que existe,
mas tem casos chatos quando `taxaMes = 0`), a gente **avança o relógio** e observa.
Mais simples de ler, e naturalmente correto no caso sem juros (`taxaMes = 0` → só
soma o aporte).

**Os três retornos — um contrato de três estados:**
- `return 0` — **já alcançou** (`saldo >= alvo` de cara). Curto-circuito antes do laço.
- `return m` — alcança no mês `m`.
- `return null` — **nunca alcança** (passou de 1200 meses = 100 anos). Acontece se não
  há aporte **nem** rendimento suficiente pra crescer. O teto de 1200 evita **laço
  infinito** e serve de "na prática, não chega". Devolver `null` (em vez de um número
  gigante) obriga a UI a tratar o caso "inatingível" honestamente ("∞" / "aumente o
  aporte").

**Tudo em centavos.** `saldo`, `alvo`, `aporte` são inteiros; `Math.round` a cada mês
mantém o saldo inteiro. Numa simulação de **1200 iterações**, erro de float
acumularia visivelmente — arredondar ao centavo por mês trava isso.

**Conceito por trás — simulação vs. fórmula fechada.** Existe fórmula direta pra
tempo de uma anuidade com juros (envolve logaritmo). A escolha aqui foi **simular** —
mais linhas, porém: (a) trivial de entender; (b) sem divisão por zero quando não há
juros; (c) fácil de estender (mudar aporte no meio, taxa variável…). Trade-off
clássico: um laço barato e claro no lugar de uma fórmula esperta e frágil. Como são
≤1200 passos, o custo é nada.

---

## Bloco 3 — o resumo das três metas

```js
export function resumoMetas(estado) {
  const cfg = estado.config || {};
  const m = cfg.metas || {};
  const renda = rendaMensal(estado);
  const rendaCent = paraCentavos(renda);
  const aporte = Math.max(0, Number(m.aporteMensal) || 0);
  const patrimonio = Math.max(0, Number(m.patrimonioInvestido) || 0);
  const taxaAnual = Math.max(0, Number(m.taxaAnual) || 0);

  // monta o bloco comum de uma meta (alvo/atual/faltam/progresso/prazo).
  const meta = (nome, alvoReais, atualReais, rende) => {
    const alvoCent = paraCentavos(alvoReais);
    const atualCent = paraCentavos(atualReais);
    return {
      nome,
      alvo: paraReais(alvoCent),
      atual: paraReais(atualCent),
      faltam: paraReais(Math.max(alvoCent - atualCent, 0)),
      progresso: alvoCent > 0 ? Math.max(0, Math.min(atualCent / alvoCent, 1)) : 0,
      prazoMeses: mesesParaAlvo(atualReais, alvoReais, aporte, rende ? taxaAnual : 0),
    };
  };

  const reservaMetaMeses = Math.max(0, Number(cfg.reservaMetaMeses) || 0);
  const gastoMedio = gastoMedioMensal(estado);
  const reservaAlvo = paraReais(paraCentavos(gastoMedio) * reservaMetaMeses);

  const libMetaMeses = Math.max(0, Number(m.libFinanceiraMeses) || 0);
  const libAlvo = paraReais(rendaCent * libMetaMeses);

  const yieldAnual = Math.max(0, Number(m.dividendosYield) || 0);
  const divAlvo = yieldAnual > 0 ? paraReais(Math.round((rendaCent * 12) / yieldAnual)) : 0;

  return {
    renda, aporteMensal: aporte, patrimonioInvestido: patrimonio, taxaAnual,
    reserva: { metaMeses: reservaMetaMeses, gastoMedio, ...meta('Reserva de emergência', reservaAlvo, reservaAcumulada(estado), false) },
    liberdade: { metaMeses: libMetaMeses, ...meta('Liberdade financeira', libAlvo, patrimonio, true) },
    dividendos: { yield: yieldAnual, ...meta('Viver de dividendos', divAlvo, patrimonio, true) },
  };
}
```

**O que faz.** Lê a config, calcula o **alvo** de cada uma das três metas, e monta o
resumo (alvo/atual/faltam/progresso/prazo) para cada. É o que a UI de Metas desenha.

**A *factory* `meta(...)` — não repetir o "bloco de progresso".** As três metas têm a
mesma forma (alvo, atual, faltam, progresso, prazo). Em vez de escrever isso três
vezes, define-se **uma função local** `meta(nome, alvo, atual, rende)` que monta o
bloco. Cada meta chama ela com seus valores. É **DRY** (*Don't Repeat Yourself*): a
regra de "como se mede progresso" mora num lugar só; corrigiu ali, corrigiu nas três.

- `rende` (booleano) decide se aquela meta cresce com juros: `mesesParaAlvo(..., rende
  ? taxaAnual : 0)`. A **reserva** passa `false` (fica líquida, não rende); as duas de
  investimento passam `true`. Um parâmetro que liga/desliga o rendimento na simulação.
- `...meta(...)` — **spread do objeto** retornado, misturado com campos específicos:
  `{ metaMeses, gastoMedio, ...meta(...) }`. Junta o comum (do helper) com o
  particular (de cada meta) num objeto só.

**Os três alvos, cada um com sua fórmula de negócio:**

- **Reserva:** `gastoMedio × reservaMetaMeses`. (Mesma régua da
  [`reserva`](./reserva.explicado.md).) Atual = `reservaAcumulada` (o earmark).
- **Liberdade financeira:** `renda × libMetaMeses` — M meses de renda em patrimônio.
  Atual = `patrimonio`.
- **Viver de dividendos:** o mais interessante. Você "vive de dividendos" quando
  `patrimônio × yield ≥ renda anual`. Isolando o patrimônio necessário:

$$\text{alvo} = \frac{\text{renda anual}}{\text{yield}} = \frac{\text{renda mensal} \times 12}{\text{yield}}$$

  No código: `Math.round((rendaCent * 12) / yieldAnual)`. Ex.: renda R$ 5.000/mês (R$
  60.000/ano) com yield 6% a.a. → alvo = 60.000 / 0,06 = **R$ 1.000.000**. O
  `yieldAnual > 0 ? ... : 0` evita **divisão por zero** (yield não informado → alvo 0).

**Saneamento de toda entrada numérica:** repare no `Math.max(0, Number(x) || 0)`
repetido em `aporte`, `patrimonio`, `taxaAnual`, `*MetaMeses`, `yield`. Toda entrada
vinda da config passa pelo mesmo filtro: **converte, cai pra 0 se inválido, nunca
negativa**. Metas se alimentam de números digitados pelo usuário; blindar cada um na
porta de entrada evita que um campo em branco vire `NaN` e contamine a simulação.

**Conceito por trás — traduzir objetivo de vida em fórmula.** Cada meta é uma frase
("viver de dividendos") virando uma equação (`patrimônio = renda_anual / yield`). O
trabalho do arquivo é justamente essa tradução — e mantê-la explícita e comentada,
pra qualquer um conferir a matemática.

---

## Mapa mental

```
  config.metas ──► renda (soma componentes), aporte, patrimônio, taxa, yield
        │                         (todos saneados: max(0, Number|0))
        ▼
  alvos:  reserva = gastoMedio × N
          liberdade = renda × M
          dividendos = renda×12 / yield
        │
        ▼   para cada: meta(nome, alvo, atual, rende?)
   ┌────────────────────────────────────────────┐
   │ alvo, atual, faltam, progresso(clamp 0..1), │
   │ prazoMeses = mesesParaAlvo(...)  ───────────┼─► simula mês a mês
   └────────────────────────────────────────────┘   (juros compostos: raiz 12)
        │                                             0 / m / null
        ▼
  resumoMetas ──► UI de Metas
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Juros compostos** | `mesesParaAlvo` | saldo rende sobre o próprio rendimento |
| **Taxa anual→mensal (raiz 12)** | `(1+a)^(1/12)−1` | **não** é dividir por 12 |
| **Simulação iterativa** | laço de 1200 meses | avançar o relógio em vez de fórmula fechada |
| **Contrato de 3 estados** | `0 / m / null` | já-chegou / chega-em-m / nunca-chega |
| **Teto anti-loop-infinito** | `m <= 1200` | limite que também significa "inatingível" |
| **Centavos na iteração** | `Math.round` por mês | 1200 passos sem acumular erro de float |
| **DRY via factory local** | `meta(...)` | o "bloco de progresso" escrito uma vez, usado 3× |
| **Flag de comportamento** | `rende` | liga/desliga o rendimento por meta |
| **Optional chaining encadeado** | `config?.metas?.rendaComponentes` | descer em objeto com buracos, seguro |
| **Objetivo → equação** | os três alvos | traduzir uma frase de vida em fórmula explícita |

**Fim do bloco de features.** Você já entende os quatro "produtos" que o núcleo
oferece além do básico: [`score`](./score.explicado.md), planejamento,
[`reserva`](./reserva.explicado.md) e metas. **Próximo bloco do roteiro:** a **ponte**
com o mundo externo — `storage.js` (persistência) e `electron/main.js` + `preload.js`
(o processo Electron). É aí que o núcleo puro finalmente encosta em disco e tela.
