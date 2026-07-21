# `src/core/faturasPagas.js` — explicado

> **O que é este arquivo:** o fecho da cadeia do cartão. Responde: quanto uma
> fatura **custa**, quanto já foi **pago**, o que **falta**, e trata o
> **adiantamento** (pagar antes do mês). Aqui moram as regras de negócio mais
> sutis do app — e as que mais deram bug (ver histórico no `PLANO.md`).
>
> **Cadeia:** [`faturas`](./faturas.explicado.md) → [`parcelas`](./parcelas.explicado.md)
> → **`faturasPagas`** → consumido por [`calculos`](./calculos.explicado.md) e pela UI.

---

## Bloco 0 — o cabeçalho (leia com atenção, é a alma do arquivo)

```js
// faturasPagas.js — quanto cada fatura custa, quanto já foi pago, o que falta,
// e o adiantamento (pagar uma fatura antes do mês dela).
//
// Duas origens para o valor de uma fatura:
//  1) CALCULADA — a soma das parcelas das compras que você lançou no app.
//  2) INFORMADA  — o total que o banco mostra (`estado.faturas`). É o que temos
//     quando as compras não foram lançadas uma a uma, só a fatura. A informada
//     manda, porque é o número do banco.
//
// Dinheiro (a regra que evita contar duas vezes):
//  - PARCELA conta como saída no mês da fatura (é quando sai da conta).
//  - FATURA INFORMADA **não** conta como saída: ela é um compromisso. O dinheiro
//    saindo aparece no extrato do banco, e é de lá que vem a saída.
//  - PAGAMENTO nunca é saída — é acompanhamento (senão o mesmo dinheiro contaria
//    duas vezes). Adiantar só antecipa o registro, não cria gasto novo.

import { paraCentavos, paraReais, mesDe } from './model.js';
import { parcelasDaFatura, todasParcelas } from './parcelas.js';
```

**Este comentário é o "documento de requisitos" do arquivo.** Antes de qualquer
código, ele fixa duas decisões que explicam tudo o que vem depois:

**1) Duas origens de valor — calculada vs. informada.** Você pode alimentar o app
de dois jeitos: lançando cada compra (o app soma as parcelas = *calculada*), ou só
digitando o total da fatura que o banco mostrou (*informada*). Quando as duas
existem, **a informada ganha** — é o número oficial do banco.

**2) A regra de ouro contra contar em dobro.** Um mesmo real não pode virar dois
"gastos". Então o app escolhe **uma** porta de entrada para cada real:
- A **parcela** é a saída (conta no mês da fatura).
- A **fatura informada** é só um *compromisso* — não conta como saída (o dinheiro
  de verdade sai pelo extrato do banco).
- O **pagamento** nunca é saída — é só acompanhamento de quanto você já quitou.

Guarde isso: cada uma das funções abaixo existe para honrar essas duas frases.

---

## Bloco 1 — a fatura informada pelo banco

```js
// A fatura que o banco informou para esse cartão/mês (se houver).
export function faturaInformada(estado, cartaoId, mesFatura) {
  return (estado.faturas || []).find(
    (f) => f.cartaoId === cartaoId && f.mes === mesFatura,
  ) || null;
}
```

**O que faz.** Procura em `estado.faturas` a fatura que o usuário/banco informou
para aquele cartão naquele mês. Se não achar, devolve `null`.

**Sintaxe:**
- `.find(predicado)` — devolve o **primeiro** item que satisfaz a condição, ou
  `undefined` se nenhum. Diferente de `.filter` (que devolve *todos* num array),
  `find` devolve *um* elemento.
- `... || null` — normaliza o "não achou" de `undefined` para `null`. É higiene: a
  função promete devolver "um objeto **ou** `null`", um contrato explícito, em vez
  de deixar `undefined` vazar.

**Conceito por trás — normalizar o "vazio".** Escolher `null` como "nada aqui" (em
vez de `undefined`) e sempre devolvê-lo torna o resto do código previsível: quem
chama testa `if (info)` sem se preocupar com qual sabor de vazio veio.

---

## Bloco 2 — o total da fatura (a regra "informada manda… às vezes")

```js
// Valor total da fatura: o informado pelo banco vence; senão, soma as parcelas.
export function totalFatura(estado, cartaoId, mesFatura) {
  const info = faturaInformada(estado, cartaoId, mesFatura);
  // informado só vence quando > 0: um "informado 0" (print vazio, banco não somou a
  // fatura) não pode apagar as parcelas reais — cai de volta na soma delas.
  if (info && Number.isFinite(Number(info.total)) && Number(info.total) > 0) return Number(info.total);
  const cents = parcelasDaFatura(estado, cartaoId, mesFatura)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  return paraReais(cents);
}
```

**O que faz.** Decide o valor total da fatura: **se** existe um informado válido e
positivo, usa ele; **senão**, cai de volta na soma das parcelas calculadas.

**A condição, destrinchada:**
```js
if (info && Number.isFinite(Number(info.total)) && Number(info.total) > 0)
```
Três testes em cascata, ligados por `&&` (só passa se os três forem verdade):
1. `info` — existe uma fatura informada?
2. `Number.isFinite(Number(info.total))` — o total é um número de verdade (não
   `NaN`, não `Infinity`, não texto lixo)?
3. `Number(info.total) > 0` — é **positivo**?

**Por que o `> 0` é crucial (bug real, contado no PLANO.md).** Sem ele, um
"informado **zero**" — um print de fatura vazio, ou o banco que ainda não somou a
fatura do mês — **venceria** as parcelas reais e zeraria a fatura na cara do
usuário. As compras lançadas sumiriam do total. O `> 0` diz: "informado zero não é
uma informação, é ausência de informação — então volta a confiar nas parcelas". Um
detalhe de uma comparação que evita apagar dado real.

**Conceito por trás — precedência de fontes com fallback.** O padrão é "fonte
preferida **com** rede de segurança": tenta a melhor fonte (banco), e se ela não for
confiável, degrada para a segunda (parcelas). É o mesmo desenho de
`configuração_do_usuário ?? padrão_do_sistema`, mas com uma regra de validade mais
esperta que "só existir" — aqui, "existir **e** ser positivo".

**Sintaxe — `.reduce` de novo.** A soma das parcelas usa o mesmo idioma de
`calculos.js`: acumula centavos e converte pra reais no fim.

---

## Bloco 3 — quanto já foi pago

```js
// Quanto já foi pago dessa fatura (inclui o que foi adiantado).
export function totalPago(estado, cartaoId, mesFatura) {
  const cents = (estado.pagamentosFatura || [])
    .filter((p) => p.cartaoId === cartaoId && p.mesFatura === mesFatura)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  return paraReais(cents);
}
```

**O que faz.** Soma todos os pagamentos registrados para aquela fatura — incluindo
os que foram feitos adiantado. É um `filter` (os pagamentos daquela fatura) seguido
de `reduce` (soma em centavos): o par **filter→reduce** é o "somatório condicional"
que se repete no projeto todo.

**Ponto de negócio.** Isto mede *progresso de quitação*, não *gasto*. Pagar não
gera saída nova (ver Bloco 0) — só move o ponteiro de "quanto desta fatura já
resolvi".

---

## Bloco 4 — o que conta como adiantamento

```js
// Um pagamento é ADIANTAMENTO quando o dinheiro saiu antes do mês da fatura.
export function ehAdiantamento(pagamento) {
  if (!pagamento?.data) return false;
  return mesDe(pagamento.data) < pagamento.mesFatura;
}
```

**O que faz.** Diz se um pagamento foi **adiantado**: o dinheiro saiu (`pagamento.data`)
num mês **anterior** ao mês da fatura (`pagamento.mesFatura`).

**Sintaxe:**
- `if (!pagamento?.data) return false` — guarda: sem data, não dá pra dizer que
  adiantou → assume que não. O `?.` protege contra `pagamento` nulo.
- `mesDe(pagamento.data) < pagamento.mesFatura` — compara dois `"YYYY-MM"` como
  **texto**. Funciona porque, de novo, o formato foi desenhado para ordem alfabética
  = ordem cronológica. Pagou em `"2026-03"` uma fatura `"2026-05"` → `"2026-03" <
  "2026-05"` → `true`, adiantou.

**Conceito por trás — um "predicado" nomeado.** A função devolve `true`/`false` e
tem nome de pergunta (`ehAdiantamento` = "é adiantamento?"). Extrair essa regrinha
num lugar só evita repetir a comparação `mesDe(...) < ...` espalhada, e dá nome de
negócio a ela. Se a definição de "adiantamento" mudar, muda aqui, num ponto único.

---

## Bloco 5 — o resumo completo da fatura

```js
// Situação da fatura: total, pago, restante, progresso 0..1.
export function resumoFatura(estado, cartaoId, mesFatura) {
  const total = totalFatura(estado, cartaoId, mesFatura);
  const pago = totalPago(estado, cartaoId, mesFatura);
  const totalCent = paraCentavos(total);
  const pagoCent = paraCentavos(pago);
  const adiantado = (estado.pagamentosFatura || [])
    .filter((p) => p.cartaoId === cartaoId && p.mesFatura === mesFatura && ehAdiantamento(p))
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);

  return {
    cartaoId,
    mesFatura,
    total,
    pago,
    adiantado: paraReais(adiantado),
    restante: paraReais(Math.max(0, totalCent - pagoCent)),
    progresso: totalCent > 0 ? Math.min(1, pagoCent / totalCent) : 0,
    quitada: totalCent > 0 && pagoCent >= totalCent,
    informada: !!faturaInformada(estado, cartaoId, mesFatura),
  };
}
```

**O que faz.** Junta tudo num objeto: total, pago, adiantado, restante, progresso
(0 a 1), se está quitada e se veio do banco. É o que a UI desenha como "cartão da
fatura" com barra de progresso.

**As proteções, uma a uma (todas de propósito):**
- `restante: Math.max(0, totalCent - pagoCent)` — se você pagou **mais** que o
  total (adiantou demais, ou o informado encolheu depois), `total − pago` ficaria
  **negativo**. O `Math.max(0, ...)` trava o restante em zero: "não se deve valor
  negativo". Nunca aparece "-R$ 50 a pagar".
- `progresso: totalCent > 0 ? Math.min(1, pagoCent / totalCent) : 0` — dois cuidados
  numa linha: **(a)** o `totalCent > 0 ? … : 0` evita **divisão por zero** (fatura
  de total zero → progresso 0, não `NaN`); **(b)** `Math.min(1, …)` **limita o teto
  em 1** (pagou 120%? a barra enche até 100%, não estoura). Isso é *clamping* —
  prender um valor dentro de `[0, 1]`.
- `quitada: totalCent > 0 && pagoCent >= totalCent` — só é "quitada" se havia o que
  pagar **e** o pago cobre o total. O `totalCent > 0` evita declarar quitada uma
  fatura de valor zero (tecnicamente `0 >= 0`, mas semanticamente não há fatura).
- `informada: !!faturaInformada(...)` — o **`!!`** (dupla negação) converte o
  objeto-ou-`null` num booleano limpo: objeto → `true`, `null` → `false`. A UI quer
  um selo "veio do banco", não o objeto inteiro.

**Conceito por trás — blindar a fronteira dos números.** Divisão por zero, valor
negativo, estouro de 100%: são os três "casos de canto" (*edge cases*) de qualquer
cálculo de proporção/progresso. Este bloco os trata **todos**, na saída, para que a
UI receba sempre números sãos e não precise se defender. É a ideia de *validar na
fronteira*: o núcleo entrega dado limpo, a casca confia.

---

## Bloco 6 — as faturas do mês (uma por cartão)

```js
// Todas as faturas de um mês, um item por cartão (o "Resumo de cartões" da planilha).
export function faturasDoMes(estado, mes) {
  return (estado.cartoes || []).map((c) => ({
    ...resumoFatura(estado, c.id, mes),
    cartao: c.nome,
    vencimento: c.vencimento,
  }));
}
```

**O que faz.** Para cada cartão, monta o resumo daquela fatura e **acrescenta** o
nome e o dia de vencimento do cartão. Um item por cartão.

**Sintaxe — spread para "enriquecer" um objeto:**
```js
{ ...resumoFatura(...), cartao: c.nome, vencimento: c.vencimento }
```
`...resumoFatura(...)` copia todos os campos do resumo, e aí somam-se dois campos
novos. É o idioma de "pega este objeto e acrescenta metadados" sem alterar o
original — imutável, coerente com o núcleo. Note que devolve **um item por cartão
mesmo que a fatura seja zero** (é um "resumo de cartões", quer listar todos).

---

## Bloco 7 — as próximas faturas (as que dá pra adiantar)

```js
// As faturas de `mes` em diante — as que dá pra adiantar. Um mês entra na lista
// se o banco informou uma fatura nele OU se alguma parcela sua cai nele.
export function proximasFaturas(estado, mes, quantas = 8) {
  const meses = new Set();
  for (const f of estado.faturas || []) if (f.mes >= mes) meses.add(f.mes);
  for (const p of todasParcelas(estado)) if (p.mesFatura >= mes) meses.add(p.mesFatura);

  const lista = [];
  for (const m of [...meses].sort().slice(0, quantas)) {
    for (const c of estado.cartoes || []) {
      const r = resumoFatura(estado, c.id, m);
      if (r.total > 0) lista.push({ ...r, cartao: c.nome, vencimento: c.vencimento });
    }
  }
  return lista;
}
```

**O que faz.** Lista as faturas de `mes` em diante (até `quantas` meses), incluindo
só as que **têm valor**. É a fonte do `comprometidoFuturo` e da tela de
adiantamento.

**A lógica em duas fases:**

*Fase 1 — descobrir QUAIS meses têm fatura.* Um mês entra no `Set` se:
- o banco informou uma fatura nele (`estado.faturas`), **ou**
- alguma parcela sua cai nele (`todasParcelas`).

Os dois laços alimentam o mesmo `Set`, que **deduplica** — um mês que tem informada
*e* parcela entra uma vez só. É o "OU" do comentário virando união de conjuntos.

*Fase 2 — montar a lista.*
- `[...meses].sort().slice(0, quantas)` — ordena os meses e pega os `quantas`
  primeiros (os mais próximos). `slice(0, 8)` = "só os próximos 8 meses".
- laço aninhado (mês × cartão): para cada mês, cada cartão, monta o resumo.
- `if (r.total > 0)` — **filtra** faturas zeradas. Diferente do `faturasDoMes` (que
  lista todo cartão), aqui só interessa o que tem valor a adiantar. A intenção da
  função define o filtro.

**Sintaxe:**
- `quantas = 8` — parâmetro padrão; `comprometidoFuturo` chama com 36.
- `{ ...r, cartao: ..., vencimento: ... }` — mesmo enriquecimento por spread do
  Bloco 6.

**Conceito por trás — união de conjuntos como regra de negócio.** "A OU B" em
linguagem de negócio ("meses com informada **ou** com parcela") tem tradução direta
em código: jogue os dois no mesmo `Set`. Reconhecer que "quais meses aparecem?" é uma
*união* deixa a implementação óbvia e sem duplicatas de graça.

---

## Mapa mental — como o valor de uma fatura é decidido

```
                    totalFatura(cartão, mês)
                           │
             ┌─────────────┴──────────────┐
       informada > 0?                 senão
             │ sim                      │
             ▼                          ▼
     usa o total do banco      soma parcelasDaFatura (calculada)
             │                          │
             └────────────┬─────────────┘
                          ▼
                  resumoFatura  ──►  total, pago, restante(≥0),
                          │          progresso(clamp 0..1), quitada, adiantado
             ┌────────────┴───────────┐
             ▼                        ▼
        faturasDoMes            proximasFaturas
     (todo cartão, 1 mês)   (só as com valor, N meses à frente)
                                      │
                                      ▼
                          comprometidoFuturo (calculos.js)
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Precedência de fonte com fallback** | `totalFatura` | usa a melhor fonte; degrada pra segunda se a 1ª não vale |
| **Validade > existência** | `Number(info.total) > 0` | "informado zero" é ausência, não dado — não apaga parcelas |
| **filter → reduce (soma condicional)** | `totalPago`, `adiantado` | o somatório "só dos que satisfazem X" |
| **Predicado nomeado** | `ehAdiantamento` | dar nome de negócio a uma comparação booleana |
| **Clamping** | `Math.min(1, …)`, `Math.max(0, …)` | prender um número dentro de uma faixa válida |
| **Guardar divisão por zero** | `totalCent > 0 ? … : 0` | proporção de total zero é 0, não `NaN` |
| **`!!` (coerção booleana)** | `informada` | virar objeto-ou-null num `true`/`false` limpo |
| **Enriquecer via spread** | `{ ...r, cartao, vencimento }` | copiar objeto e acrescentar campos, imutável |
| **União de conjuntos** | dois laços → um `Set` | "A OU B" vira união que deduplica sozinha |
| **Validar na fronteira** | `resumoFatura` | o núcleo entrega número são; a UI confia |

**Fim da cadeia do cartão.** Você já consegue seguir uma compra do lançamento
([`parcelas`](./parcelas.explicado.md)) até virar um número na tela de faturas.
**Próximo bloco do roteiro:** o extrato — [`regras`](./regras.explicado.md) →
`importar` → `revisar` (categorização automática do que vem do banco).
