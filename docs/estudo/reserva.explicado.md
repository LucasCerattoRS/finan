# `src/core/reserva.js` — explicado

> **O que é este arquivo:** a **reserva de emergência**. O ponto conceitual: um
> aporte de reserva **não é um gasto** — é um *earmark* (uma etiqueta) sobre
> dinheiro que **já está** na sua conta. Você não perdeu o dinheiro; só marcou "isto
> aqui é intocável". Era a aba "Reservas PM" da planilha.
>
> **Papel na arquitetura:** feature de leitura. Depende de
> [`calculos`](./calculos.explicado.md) (`resumoMes`, `mesesComMovimento`,
> `dinheiroEmConta`). As mutações (registrar aporte/resgate, definir meta) ficam no
> [`index.js`](./index.explicado.md).

---

## Bloco 0 — o cabeçalho e o conceito de *earmark*

```js
// reserva.js — reserva de emergência (a aba "Reservas PM" da planilha).
// Um aporte é um valor que você separa e que NÃO conta como gasto: é um earmark
// sobre o dinheiro que já está em conta, não uma transação. Por isso o
// "Disponível para gastar" = dinheiro em conta − reserva acumulada (nada é
// contado duas vezes). Valor negativo num movimento = resgate (usou a reserva).
// As mutações (registrar/remover/definir meta) ficam no index.js.

import { paraCentavos, paraReais } from './model.js';
import { resumoMes, mesesComMovimento, dinheiroEmConta } from './calculos.js';
```

**O conceito central — *earmark* (dinheiro carimbado).** Guardar R$ 500 pra
emergência **não** diminui seu patrimônio; o dinheiro continua na conta. O que muda
é que ele deixa de estar "livre". Então a reserva é modelada como uma **etiqueta**,
não como uma saída:

```
Disponível para gastar = dinheiro em conta − reserva acumulada
```

Se um aporte contasse como gasto (saída), ele apareceria **duas vezes**: sumiria do
"dinheiro em conta" **e** ainda seria subtraído como reserva. A modelagem por
earmark garante que cada real seja contado **uma vez** — a mesma obsessão anti-dupla-
contagem que rege o cartão em [`faturasPagas`](./faturasPagas.explicado.md).

**O *ledger* com sinal.** Um movimento de reserva é `{ mes, valor }`. `valor`
positivo = aporte (guardou); `valor` **negativo** = resgate (usou a reserva). A
"reserva acumulada" é a **soma** desses movimentos. Um único campo com sinal cobre
os dois sentidos — não há tipo "aporte" vs "resgate" separado, só o sinal. Isso é um
*razão contábil* (ledger) em miniatura.

---

## Bloco 1 — a reserva acumulada

```js
// Reserva acumulada (soma de todos os aportes e resgates), em reais.
export function reservaAcumulada(estado) {
  const cent = (estado.reservas || []).reduce((s, r) => s + paraCentavos(r.valor), 0);
  return paraReais(cent);
}
```

**O que faz.** Soma todos os movimentos de reserva (aportes positivos, resgates
negativos) e devolve o saldo atual reservado.

Um `reduce` em centavos — o idioma de sempre. Como resgates são negativos, eles
**abatem** naturalmente na mesma soma; não precisa de `if`. É a beleza do ledger com
sinal: `+500 −200 +100 = 400`, uma linha, sem ramificação.

---

## Bloco 2 — o gasto médio mensal

```js
// Gasto médio mensal — média das saídas dos últimos `n` meses com movimento
// (parcelas incluídas, como no resto do app). É a base da meta "X meses de gasto".
export function gastoMedioMensal(estado, n = 12) {
  const meses = mesesComMovimento(estado).slice(-n);
  if (!meses.length) return 0;
  const cent = meses.reduce((s, m) => s + paraCentavos(resumoMes(estado, m).saidas), 0);
  return paraReais(Math.round(cent / meses.length));
}
```

**O que faz.** Calcula quanto você gasta por mês, em média, nos últimos `n` meses com
movimento. É a régua da meta de reserva ("quero 6 **meses de gasto** guardados").

**Sintaxe:**
- `mesesComMovimento(estado).slice(-n)` — `.slice(-12)` pega os **últimos 12** itens
  do array (índice negativo conta do fim). Só meses com movimento entram, então
  meses vazios não puxam a média pra baixo artificialmente.
- `if (!meses.length) return 0` — guarda contra divisão por zero (usuário novo, sem
  histórico).
- `Math.round(cent / meses.length)` — média em centavos, arredondada ao centavo
  antes de virar reais. Arredondar em centavos (inteiro) evita cauda de float.

**Conceito por trás — a meta em unidade relativa.** A reserva não é uma meta fixa em
reais ("junte R$ 10.000"); é **relativa ao seu custo de vida** ("junte 6 meses de
gasto"). Quem gasta mais precisa de mais reserva. Por isso a base é o gasto médio,
não um número mágico. `gastoMedioMensal` é o que traduz "meses" em "reais".

---

## Bloco 3 — o resumo da reserva

```js
// Resumo da reserva para um ano ("YYYY"): total acumulado, o que entrou no ano
// (a "Reserva Anual" da planilha), o disponível para gastar e o progresso da meta
// (metaMeses × gasto médio mensal).
export function resumoReserva(estado, ano) {
  const alvo = String(ano);
  const reservas = estado.reservas || [];
  const totalCent = reservas.reduce((s, r) => s + paraCentavos(r.valor), 0);
  const noAnoCent = reservas
    .filter((r) => String(r.mes).slice(0, 4) === alvo)
    .reduce((s, r) => s + paraCentavos(r.valor), 0);

  const metaMeses = Math.max(0, Number(estado.config?.reservaMetaMeses) || 0);
  const gastoMedio = gastoMedioMensal(estado);
  const metaCent = paraCentavos(gastoMedio) * metaMeses;
  const disponivelCent = paraCentavos(dinheiroEmConta(estado)) - totalCent;

  return {
    ano: alvo,
    total: paraReais(totalCent),
    noAno: paraReais(noAnoCent),
    disponivel: paraReais(disponivelCent),
    metaMeses,
    gastoMedio,
    meta: paraReais(metaCent),
    progresso: metaCent > 0 ? Math.max(0, Math.min(totalCent / metaCent, 1)) : 0,
    faltam: paraReais(Math.max(metaCent - totalCent, 0)),
  };
}
```

**O que faz.** Junta tudo: total reservado, o que foi reservado **neste ano**, o
disponível pra gastar, a meta (em reais) e o progresso até ela.

**As contas-chave:**

`metaCent = paraCentavos(gastoMedio) * metaMeses` — a meta em reais é "gasto médio ×
número de meses". `metaMeses` vem da config (`reservaMetaMeses`), com
`Math.max(0, Number(...) || 0)` sanitizando (nunca negativa).

`disponivelCent = dinheiroEmConta − totalCent` — **o earmark em ação.** O disponível
é o que está na conta **menos** o que está reservado. É esta linha que materializa a
frase do cabeçalho e impede a dupla contagem.

`progresso: metaCent > 0 ? Math.max(0, Math.min(totalCent / metaCent, 1)) : 0` — o
mesmo *clamp* `[0,1]` do resto do app, com a guarda de divisão por zero (meta zero →
progresso 0). Reservou além da meta? Trava em `1` (100%).

`faltam: Math.max(metaCent - totalCent, 0)` — quanto falta, nunca negativo (já bateu
a meta → falta `0`, não um valor negativo estranho).

**`noAno` — a fatia anual.** `.filter((r) => String(r.mes).slice(0, 4) === alvo)`
soma só os movimentos do ano pedido. O `String(...)` protege caso `mes` venha como
número; o `.slice(0,4)` pega o ano do `"YYYY-MM"`. É a "Reserva Anual" da planilha:
quanto você conseguiu guardar naquele ano específico.

**Conceito por trás — o mesmo esqueleto de "resumo de progresso".** Compare este
`resumoReserva` com o `resumoFatura` (cartão) e o `meta(...)` que você verá em
[`metas`](./metas.explicado.md): todos têm **alvo, atual, faltam, progresso (clamp
0–1)**. É um *padrão* recorrente no app — "medir avanço rumo a um alvo" — e vale
reconhecê-lo: sempre `atual/alvo` saturado em `[0,1]`, com `faltam = max(alvo−atual,
0)`, protegendo divisão por zero. Aprendeu um, aprendeu todos.

---

## Mapa mental

```
  estado.reservas [{mes, valor(+aporte/−resgate)}]
        │  soma (ledger com sinal)
        ▼
  reservaAcumulada = total reservado
        │
  dinheiroEmConta − total ─► disponível para gastar   (earmark: conta 1x só)
        │
  gastoMedioMensal × metaMeses ─► meta (em reais)
        │
  resumoReserva: total, noAno, disponível, meta, progresso(clamp), faltam
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Earmark (dinheiro carimbado)** | `disponivel = conta − total` | reservar não é gastar; conta o real uma vez só |
| **Ledger com sinal** | `valor` +/− | aporte e resgate no mesmo campo, soma resolve |
| **Meta relativa** | `gastoMedio × metaMeses` | alvo em "meses de gasto", não número fixo |
| **`.slice(-n)`** | últimos n meses | índice negativo conta do fim do array |
| **Média em centavos** | `Math.round(cent/len)` | evitar cauda de float na média |
| **Clamp + guarda ÷0** | `progresso` | proporção sã mesmo com meta zero |
| **Padrão "resumo de progresso"** | alvo/atual/faltam/progresso | o mesmo esqueleto de fatura e metas |

**Próximo:** [`metas`](./metas.explicado.md) — as metas de longo prazo (reserva,
liberdade financeira, viver de dividendos), onde entra a **simulação de juros
compostos** para estimar o prazo.
