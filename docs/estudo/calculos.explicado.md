# `src/core/calculos.js` — explicado

> **O que é este arquivo:** a camada que **lê** o estado e devolve números
> derivados (totais, saldos, séries, gastos por categoria). É o "Dashboard" da
> planilha original virado código.
>
> **Papel na arquitetura:** enquanto `index.js` tem as funções que **escrevem**
> (`(estado, dados) → novo estado`), `calculos.js` só **deriva** — recebe o
> `estado` e devolve resumos, **sem nunca alterá-lo**. É a metade "consulta" do
> par consulta/comando (veja o conceito CQS lá no fim).
>
> **Pré-requisitos:** ter lido [`model.explicado.md`](./model.explicado.md)
> (você vai reencontrar `paraCentavos`, `paraReais`, `mesDe`, `somaMeses`).

---

## Bloco 0 — o cabeçalho e a convenção-mãe

```js
// calculos.js — totais e saldos (o "Dashboard" da planilha).
// Convenção: quando chega o mês da fatura, as parcelas daquele mês contam
// como saída (é o que efetivamente sai da conta). Saídas diretas (pix,
// dinheiro, débito) contam no mês em que aconteceram.

import { paraCentavos, paraReais, mesDe, somaMeses } from './model.js';
import { todasParcelas } from './parcelas.js';
import { proximasFaturas } from './faturasPagas.js';
```

**O que faz.** Importa três grupos de ajuda: as funções de dinheiro/data do
`model.js`, o "explodidor" de parcelas (`todasParcelas`) e o consultor de faturas
futuras (`proximasFaturas`).

**Conceito por trás — a convenção temporal.** Todo o arquivo gira em torno de uma
decisão de negócio: **quando** um gasto "conta". A resposta não é óbvia porque um
cartão separa o momento da *compra* do momento em que o *dinheiro sai*:

- **Saída direta** (pix, dinheiro, débito) → conta no mês em que aconteceu.
- **Parcela de cartão** → conta no mês da **fatura** em que ela cai, não no mês da
  compra. É quando o dinheiro efetivamente deixa a conta.

Guarde isto: é a regra que faz `resumoMes`, `serieMensal` e `gastoPorCategoria`
somarem parcelas por `mesFatura` em vez de por `data`.

**Armadilha que essa convenção evita.** Se a compra e a parcela contassem no
mesmo mês, uma compra parcelada em 10x apareceria inteira em janeiro e de novo,
pedacinho por pedacinho, de fevereiro a novembro — **gasto contado duas vezes**.
A separação "compra ≠ saída de dinheiro" existe justamente para isso.

---

## Bloco 1 — todos os meses que têm movimento

```js
// Lista de todos os meses ("YYYY-MM") com algum movimento, em ordem.
export function mesesComMovimento(estado) {
  const set = new Set();
  for (const tx of estado.transacoes || []) {
    if (tx.tipo === 'entrada' || tx.tipo === 'saida') set.add(mesDe(tx.data));
  }
  for (const p of todasParcelas(estado)) set.add(p.mesFatura);
  return [...set].filter(Boolean).sort();
}
```

**O que faz.** Devolve a lista ordenada de meses (`"2026-01"`, `"2026-02"`…) em
que existe **qualquer** movimento: uma entrada, uma saída direta, ou uma parcela
de cartão caindo naquele mês.

**Sintaxe que vale destacar:**
- `new Set()` — coleção que **ignora duplicatas** automaticamente. Se três
  transações são de janeiro, `set.add('2026-01')` três vezes deixa `'2026-01'`
  uma vez só. É o jeito idiomático de responder "quais valores distintos existem?"
- `estado.transacoes || []` — **guarda contra `undefined`**. Se `transacoes`
  ainda não existe, o `for...of` receberia `undefined` e quebraria; o `|| []` faz
  ele iterar sobre uma lista vazia. Esse padrão se repete no arquivo inteiro.
- `[...set]` — **spread** de um `Set` para um array comum (Set não tem `.sort()`).
- `.filter(Boolean)` — remove os valores "falsy" (`''`, `null`, `undefined`).
  `Boolean` é usado aqui como **função de teste**: `filter` chama `Boolean(x)` em
  cada item e mantém só os que dão `true`. Tira um mês vazio que tenha escapado.
- `.sort()` — sem argumento, ordena como **texto**. Por sorte `"YYYY-MM"` foi
  desenhado pra que a ordem alfabética *seja* a ordem cronológica (`"2026-01"` <
  `"2026-02"`). Esse é o motivo de o formato ter zero à esquerda no mês.

**Conceito por trás — o eixo do tempo é derivado, não guardado.** Em vez de manter
uma lista fixa de meses, o app **calcula** quais meses existem a partir dos dados.
Adicionou uma transação num mês novo? Ele aparece sozinho. Apagou a última do mês?
Ele some. O tempo é uma *projeção* dos dados, não um campo à parte que poderia
ficar dessincronizado.

**Alternativa e trade-off.** Poderíamos guardar `estado.meses` explicitamente e ir
mantendo. Seria O(1) para ler, mas abre a porta pra bug clássico: a lista e as
transações discordarem. A escolha aqui troca um pouco de CPU (recalcular) por
**uma verdade só**. Como a base é pessoal (centenas/milhares de linhas, não
milhões), o custo é irrelevante.

---

## Bloco 2 — o resumo de um mês (a peça central)

```js
// Resumo de um mês ("YYYY-MM").
export function resumoMes(estado, mes) {
  const txs = estado.transacoes || [];
  const entradasCent = somaCent(txs.filter((t) => t.tipo === 'entrada' && mesDe(t.data) === mes), 'valor');
  const saidasDiretasCent = somaCent(txs.filter((t) => t.tipo === 'saida' && mesDe(t.data) === mes), 'valor');
  const faturasCent = somaCent(todasParcelas(estado).filter((p) => p.mesFatura === mes), 'valor');
  const saidasCent = saidasDiretasCent + faturasCent;
  return {
    mes,
    entradas: paraReais(entradasCent),
    saidasDiretas: paraReais(saidasDiretasCent),
    faturas: paraReais(faturasCent),
    saidas: paraReais(saidasCent),
    saldoMes: paraReais(entradasCent - saidasCent),
  };
}
```

**O que faz.** Recebe um mês e devolve um objeto com entradas, saídas (separadas em
"diretas" e "faturas"), o total de saídas e o saldo do mês. É a função que quase
todo o resto do arquivo reutiliza.

**Como faz, passo a passo:**
1. `entradasCent` — filtra as transações que são `entrada` **e** cujo mês bate,
   e soma o campo `valor` (em centavos).
2. `saidasDiretasCent` — o mesmo para `saida` (pix/dinheiro/débito).
3. `faturasCent` — pega **todas as parcelas** do estado e mantém as que caem
   **neste mês de fatura**; soma. Aqui a convenção do Bloco 0 vira código.
4. `saidasCent` — a saída total do mês é diretas **+** faturas.
5. Devolve tudo já convertido de volta pra reais com `paraReais`.

**Conceito por trás — somar em centavos, expor em reais.** Repare no padrão que se
repete: os cálculos intermediários usam sufixo `Cent` (centavos, número inteiro), e
só na hora de **montar o objeto de saída** é que `paraReais` converte. Isso é a
regra de ouro do dinheiro em ponto flutuante:

```js
0.1 + 0.2            // 0.30000000000000004  ❌ (float binário)
(10 + 20) / 100      // 0.3                   ✅ (soma inteiros, divide no fim)
```

Somar reais direto acumula erro de arredondamento; somar centavos (inteiros) é
exato, e a divisão por 100 acontece **uma vez**, no fim. Veja `paraCentavos`/
`paraReais` em [`model.explicado.md`](./model.explicado.md).

**Sintaxe — `.filter(...)` encadeado com `&&`.** `t.tipo === 'entrada' && mesDe(t.data) === mes`
é um predicado com duas condições: só passa quem satisfaz as duas. `filter`
devolve um **novo array** (não altera `txs`) — coerente com "esta camada não
muta nada".

**Armadilha — objeto de retorno rico é de propósito.** Poderíamos devolver só
`{entradas, saidas}`. Devolver também `saidasDiretas` e `faturas` separadas deixa a
UI mostrar o *porquê* de uma saída alta ("R$ 3.000, sendo R$ 2.000 de fatura") sem
recalcular. É o princípio de **calcular uma vez, no lugar certo**.

---

## Bloco 3 — saldo acumulado e "dinheiro em conta"

```js
// Saldo acumulado até um mês (inclusive). Se ateMes for omitido, soma tudo.
export function saldoAcumulado(estado, ateMes) {
  return mesesComMovimento(estado)
    .filter((m) => !ateMes || m <= ateMes)
    .reduce((acc, m) => acc + paraCentavos(resumoMes(estado, m).saldoMes), 0) / 100;
}

// "Dinheiro em conta" total (entradas - saídas de todos os meses).
export function dinheiroEmConta(estado) {
  return saldoAcumulado(estado);
}
```

**O que faz.** `saldoAcumulado` soma os saldos de todos os meses até um limite
(inclusive), respondendo "quanto sobrou no total até aqui?". `dinheiroEmConta` é só
um **apelido legível** para "acumulado até sempre" (sem limite de mês).

**Sintaxe — `reduce`, o canivete das agregações:**
```js
lista.reduce((acumulador, item) => novoAcumulador, valorInicial)
```
Ele "dobra" a lista num valor só. Aqui: começa em `0`, e para cada mês soma o saldo
daquele mês (convertido pra centavos). O `/ 100` no fim volta pra reais **uma vez**
— de novo o padrão "some inteiros, divida no fim".

- `!ateMes || m <= ateMes` — se `ateMes` não foi passado (`undefined`, falsy),
  `!ateMes` é `true` e **todo** mês passa. Se foi passado, mantém só `m <= ateMes`.
  É um filtro opcional em uma linha.

**Conceito por trás — "apelido semântico".** `dinheiroEmConta` não faz nada além de
chamar `saldoAcumulado`. Por que existir? Porque **o nome comunica intenção**. Onde
a UI escreve `dinheiroEmConta(estado)`, o leitor entende o negócio; `saldoAcumulado(estado)`
sem argumento pareceria um esquecimento. Nomear é documentar.

**Armadilha — custo escondido.** `saldoAcumulado` chama `resumoMes` para *cada*
mês, e `resumoMes` chama `todasParcelas` (que varre todas as transações). Isso é
O(meses × transações): elegante e correto, mas não seria de graça numa base
gigante. Para finanças pessoais está ótimo — é o tipo de decisão "simples e claro
vence rápido e obscuro" que só se revisita se o profiler apontar.

---

## Bloco 4 — o comprometido futuro

```js
// Dinheiro já comprometido com faturas que só vencem DEPOIS de `mes`.
// É o "Dinheiro comprometido" da planilha: não saiu da conta ainda, mas já está
// prometido. Desconta o que você já adiantou — pagar antes é justamente reduzir isto.
export function comprometidoFuturo(estado, mes) {
  const cents = proximasFaturas(estado, somaMeses(mes, 1), 36)
    .reduce((acc, f) => acc + paraCentavos(f.restante), 0);
  return paraReais(cents);
}
```

**O que faz.** Soma o que ainda falta pagar (`restante`) de todas as faturas que
vencem **depois** do mês atual — o dinheiro que já está prometido ao cartão mas
ainda não saiu.

**Como faz:**
- `somaMeses(mes, 1)` — começa no mês **seguinte** (por isso "futuro", exclui o mês
  corrente).
- `proximasFaturas(estado, ..., 36)` — pega até 36 meses de faturas à frente (3
  anos cobrem qualquer parcelamento realista).
- soma o `restante` de cada uma. Usa `restante`, não `total`, de propósito: **o que
  você já adiantou não está mais comprometido**. Adiantar uma fatura reduz este
  número — que é exatamente o incentivo que a métrica quer dar.

**Conceito por trás — dinheiro comprometido ≠ dinheiro gasto.** Esta é uma métrica
de *fluxo de caixa futuro*, não de saldo. Ela responde "de tudo que já tenho em
conta, quanto já tem dono?". Separar "tenho em conta" (Bloco 3) de "já tem dono"
(este) é o que permite a UI dizer "sobra livre = em conta − comprometido".

---

## Bloco 5 — anos e a visão anual

```js
// Anos ("YYYY") com algum movimento, em ordem.
export function anosComMovimento(estado) {
  return [...new Set(mesesComMovimento(estado).map((m) => m.slice(0, 4)))]
    .filter(Boolean)
    .sort();
}

// Resumo de um ano ("YYYY") — a "Visão Anual" da planilha (Entrada, Saída e a
// Reserva do ano = o que sobrou). Reaproveita resumoMes, então parcelas/faturas
// contam no mês certo e nada é somado duas vezes.
export function resumoAno(estado, ano) {
  const alvo = String(ano);
  let entradasCent = 0; let saidasCent = 0;
  for (const m of mesesComMovimento(estado)) {
    if (m.slice(0, 4) !== alvo) continue;
    const r = resumoMes(estado, m);
    entradasCent += paraCentavos(r.entradas);
    saidasCent += paraCentavos(r.saidas);
  }
  return {
    ano: alvo,
    entradas: paraReais(entradasCent),
    saidas: paraReais(saidasCent),
    reservaAno: paraReais(entradasCent - saidasCent),
  };
}
```

**O que faz.** `anosComMovimento` extrai os anos distintos (os 4 primeiros
caracteres de cada mês). `resumoAno` soma as entradas e saídas de todos os meses
daquele ano e chama a sobra de `reservaAno` ("o que sobrou no ano").

**Sintaxe:**
- `m.slice(0, 4)` — `"2026-07".slice(0, 4)` → `"2026"`. Fatiar string por posição
  fixa é seguro aqui porque o formato `"YYYY-MM"` tem largura garantida.
- `[...new Set(...)]` de novo — o combo "mapeia → deduplica → array" para extrair
  valores distintos.
- `String(ano)` — **normalização de tipo**. `ano` pode chegar como número (`2026`)
  ou string (`"2026"`); forçar para string faz a comparação `m.slice(0,4) !== alvo`
  ser sempre texto-com-texto. Comparar `"2026" !== 2026` daria `true` por diferença
  de tipo — bug silencioso que essa linha previne.

**Conceito por trás — composição e uma fonte de verdade.** `resumoAno` **não**
recalcula do zero somando transações; ele reusa `resumoMes`. Assim, a regra "parcela
conta no mês da fatura" mora num lugar só. Se ela mudar, ano e mês mudam juntos,
sem risco de divergirem. É composição: funções pequenas montando funções maiores.

**Armadilha evitada.** Se `resumoAno` filtrasse transações por `data.slice(0,4)`
direto, as **parcelas** (que dependem de `mesFatura`, não de `data`) seriam
contadas no ano errado. Reusar `resumoMes` herda a convenção temporal de graça.

---

## Bloco 6 — a série mensal (para o gráfico)

```js
// Série dos últimos N meses até `mes` (inclusive), para o gráfico de evolução.
// Sempre devolve N pontos — mês sem movimento entra zerado, senão o gráfico mente
// sobre o intervalo de tempo (buraco vira reta).
export function serieMensal(estado, mes, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = somaMeses(mes, -i);
    const r = resumoMes(estado, m);
    out.push({ mes: m, entradas: r.entradas, saidas: r.saidas, saldoMes: r.saldoMes });
  }
  return out;
}
```

**O que faz.** Monta a lista de pontos para o gráfico de evolução: N meses
terminando em `mes`, cada ponto com entradas/saídas/saldo.

**Sintaxe — o laço de trás pra frente.** `for (let i = n - 1; i >= 0; i -= 1)` com
`somaMeses(mes, -i)`: quando `i = n-1` estamos no mês mais **antigo**; quando `i = 0`,
no mais recente (`mes`). Resultado: `out` sai em ordem cronológica crescente,
pronto pra plotar da esquerda pra direita.

- `n = 6` — **parâmetro com valor padrão**. Chamar `serieMensal(estado, mes)`
  assume 6 meses; quem quiser 12 passa `serieMensal(estado, mes, 12)`.

**Conceito por trás — não deixe o gráfico mentir sobre o tempo.** A parte mais
importante está no comentário: **sempre N pontos**, mês parado entra **zerado**. Se
a função pulasse meses sem movimento, o eixo X ficaria com passos irregulares e o
gráfico insinuaria uma continuidade que não existe (um buraco de dois meses viraria
uma linha reta enganosa). Preencher com zero mantém o eixo do tempo honesto — um
princípio de visualização de dados, não só de código.

---

## Bloco 7 — gasto por categoria

```js
// Gasto por categoria num mês (ou em tudo, se mes omitido). Considera saídas
// diretas e parcelas (pela categoria da compra). Retorna [{categoria, valor}] desc.
export function gastoPorCategoria(estado, mes) {
  const acc = new Map();
  const add = (cat, valor) => acc.set(cat || 'Sem categoria', (acc.get(cat || 'Sem categoria') || 0) + paraCentavos(valor));
  for (const t of estado.transacoes || []) {
    if (t.tipo === 'saida' && (!mes || mesDe(t.data) === mes)) add(t.categoria, t.valor);
  }
  for (const p of todasParcelas(estado)) {
    if (!mes || p.mesFatura === mes) add(p.categoria, p.valor);
  }
  return [...acc.entries()]
    .map(([categoria, cent]) => ({ categoria, valor: paraReais(cent) }))
    .sort((a, b) => b.valor - a.valor);
}
```

**O que faz.** Agrupa os gastos por categoria e devolve `[{categoria, valor}]`
ordenado do maior pro menor. Considera saídas diretas **e** parcelas (pela categoria
da compra).

**Sintaxe e padrões:**
- `new Map()` — dicionário chave→valor. Diferente de um objeto `{}`, aceita
  qualquer chave e preserva ordem de inserção. Aqui a chave é o nome da categoria e
  o valor é o total acumulado em centavos.
- `add` é um **acumulador local**: `acc.get(chave) || 0` pega o total atual (ou 0 se
  a categoria é nova) e soma. Esse é o **padrão group-by**: percorrer, e para cada
  item somar no balde da sua chave.
- `cat || 'Sem categoria'` — transação sem categoria cai num balde nomeado, em vez
  de virar chave `undefined` (que apareceria feio na UI).
- `[...acc.entries()]` — transforma o Map em array de pares `[chave, valor]`.
- `.map(([categoria, cent]) => ...)` — **destructuring** do par direto no parâmetro:
  `[categoria, cent]` desmonta cada `[chave, valor]`.
- `.sort((a, b) => b.valor - a.valor)` — comparador numérico **decrescente**.
  `b - a` (em vez de `a - b`) inverte a ordem: maior valor primeiro. É o que faz o
  gráfico de categorias já sair rankeado.

**Conceito por trás — group-by + rank em memória.** É um "GROUP BY categoria SUM(valor)
ORDER BY total DESC" de SQL, feito à mão com `Map` e `sort`. Reconhecer esse padrão
ajuda: sempre que você precisa "somar por chave e ordenar", é este esqueleto.

---

## Bloco 8 — essencial vs. não essencial

```js
// Proporção Essencial vs Não essencial (em centavos) das saídas de um mês/tudo.
export function essencialVsNao(estado, mes) {
  let ess = 0; let nao = 0;
  const add = (cls, valor) => {
    if (cls === 'Essencial') ess += paraCentavos(valor);
    else if (cls === 'Não essencial') nao += paraCentavos(valor);
  };
  for (const t of estado.transacoes || []) {
    if (t.tipo === 'saida' && (!mes || mesDe(t.data) === mes)) add(t.classificacao, t.valor);
  }
  for (const p of todasParcelas(estado)) {
    if (!mes || p.mesFatura === mes) add(p.classificacao, p.valor);
  }
  return { essencial: paraReais(ess), naoEssencial: paraReais(nao) };
}
```

**O que faz.** Soma quanto das saídas foi "Essencial" vs "Não essencial" — o
insumo pra métrica de qualidade do gasto (usada no score de saúde financeira).

**Detalhe importante — o `else if` que ignora o resto.** Só classifica quem é
**exatamente** `'Essencial'` ou `'Não essencial'`. Uma transação com classificação
vazia ou desconhecida **não entra em nenhum dos dois**. É proposital: a proporção é
entre o que foi de fato classificado; o não-classificado não polui a conta nem
force um chute.

**Conceito por trás — a mesma varredura dupla.** Repare que Blocos 2, 7 e 8 têm a
mesma estrutura: percorre `transacoes` (saídas do mês) **e** `todasParcelas` (do
mesFatura), aplicando uma operação. Muda só o que se faz com cada item (somar total,
somar por categoria, somar por classificação). É o mesmo molde preenchido com
regras diferentes.

---

## Bloco 9 — o ajudante privado

```js
function somaCent(lista, campo) {
  return lista.reduce((acc, item) => acc + paraCentavos(item[campo]), 0);
}
```

**O que faz.** Soma um `campo` de uma lista, em centavos. `somaCent(txs, 'valor')`
= soma dos `valor` de `txs`, sem erro de float.

**Por que existe / por que NÃO é exportada.** Aparece só dentro deste arquivo
(usado por `resumoMes`), então **não** leva `export`. Isso é encapsulamento:
o mundo de fora enxerga `resumoMes`, `gastoPorCategoria` etc.; `somaCent` é detalhe
interno que pode mudar sem quebrar ninguém. **Exportar é assumir compromisso** — só
se expõe o que é contrato.

- `item[campo]` — **acesso dinâmico por colchete**. `campo` é uma string (`'valor'`);
  `item[campo]` é o mesmo que `item.valor`, mas com o nome do campo vindo de
  variável. É o que deixa a função genérica.

---

## Mapa mental deste arquivo

```
                    estado (dados brutos)
                          │
         ┌────────────────┼───────────────────┐
         ▼                ▼                     ▼
  mesesComMovimento   todasParcelas        transacoes
         │            (parcelas.js)             │
         └──────┬─────────┴──────────┬──────────┘
                ▼                     ▼
            resumoMes  ◄─────── convenção temporal
             │  │  │            (parcela conta no mesFatura)
     ┌───────┘  │  └────────┐
     ▼          ▼           ▼
 saldoAcumulado resumoAno  serieMensal
     │
     ▼
 dinheiroEmConta          gastoPorCategoria / essencialVsNao (varredura dupla)
                          comprometidoFuturo (usa proximasFaturas)
```

`resumoMes` é o coração: quase tudo passa por ele, e por isso a convenção temporal
mora num lugar só.

## Conceitos que apareceram (recapitulando)

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Consulta vs. comando (CQS)** | arquivo todo | esta camada só lê/deriva; escrever é com `index.js` |
| **Somar em centavos** | `somaCent`, todos os `*Cent` | inteiros são exatos; divida por 100 uma vez no fim |
| **`Set` para distintos** | `mesesComMovimento`, `anosComMovimento` | coleção que ignora duplicata |
| **`Map` + group-by** | `gastoPorCategoria` | somar no balde de cada chave |
| **`reduce`** | `saldoAcumulado`, `somaCent` | "dobrar" uma lista num valor só |
| **Guarda `\|\| []` / `\|\| 0`** | toda função | tolerar campo ausente sem quebrar |
| **Composição** | `resumoAno` reusa `resumoMes` | regra num lugar só, funções que se montam |
| **Derivar em vez de guardar** | `mesesComMovimento` | o tempo é projeção dos dados, uma verdade só |
| **Não deixar o gráfico mentir** | `serieMensal` | mês vazio entra zerado, eixo do tempo honesto |
| **Encapsulamento (sem `export`)** | `somaCent` | expõe contrato, esconde detalhe |
| **Parâmetro padrão** | `serieMensal(…, n = 6)` | valor sensato quando o argumento é omitido |

**Próximo passo natural:** os três arquivos que `calculos.js` importa para lidar com
cartão — [`faturas`](./faturas.explicado.md) (em que mês cai a compra) →
[`parcelas`](./parcelas.explicado.md) (como a compra vira parcelas) →
[`faturasPagas`](./faturasPagas.explicado.md) (quanto custa, quanto foi pago).
