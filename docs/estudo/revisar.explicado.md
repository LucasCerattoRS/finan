# `src/core/revisar.js` — explicado

> **O que é este arquivo:** o que fazer com o que sobrou. Depois que
> [`importar`](./importar.explicado.md) sugeriu categorias, muita coisa fica **sem
> categoria** (o banco escreve de um jeito que nenhuma regra pegou). Este arquivo
> **agrupa** esses lançamentos por "quem recebeu o dinheiro", pra você resolver
> **em lote** — categorizar 12 idas à mesma padaria de uma vez, não uma a uma.
>
> **Papel na arquitetura:** fim do fluxo de extrato.
> [`regras`](./regras.explicado.md) → [`importar`](./importar.explicado.md) →
> **`revisar`**.

---

## Bloco 0 — o cabeçalho e a ideia central

```js
// revisar.js — agrupa os lançamentos sem categoria por "quem recebeu", pra você
// resolver em lote em vez de um por um.
//
// O extrato brasileiro vem assim:
//   "PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI E LIMA LTDA"  -> tem nome
//   "CARTAO DEBITO - PADARIADATIA - BR"                          -> tem nome
//   "PAGAMENTO PIX SICREDI"                                      -> NÃO tem nome
//
// Quando tem nome, a escolha vira **regra** e o app acerta sozinho para sempre.
// Quando não tem, aplicamos só naqueles lançamentos — criar regra em cima de
// "pagamento pix" carimbaria todo Pix futuro com a mesma categoria.

import { normalizar } from './model.js';
```

**A distinção-chave: "nomeado" vs "não nomeado".** Um lançamento tem **contraparte**
(o nome de quem recebeu) ou não:
- **Tem nome** (`"... COMERCIO ZILLI E LIMA LTDA"`): dá pra criar uma **regra**
  ("tudo com 'zilli' → Alimentação") e o app acerta sozinho pra sempre.
- **Não tem nome** (`"PAGAMENTO PIX SICREDI"`): sobra só o verbo do banco. Criar
  regra com isso seria desastre — carimbaria **todo** Pix futuro com a mesma
  categoria. Então a escolha vale só **para aqueles** lançamentos, sem virar regra.

Todo o arquivo existe para separar esses dois casos corretamente.

---

## Bloco 1 — os dicionários de limpeza

```js
// Verbos do banco que aparecem antes do nome de quem recebeu.
const PREFIXOS = [
  'pagamento pix', 'recebimento pix', 'pagamento de boleto', 'pagamento boleto',
  'cartao debito', 'compra debito', 'pix enviado', 'pix recebido',
  'transferencia enviada', 'transferencia recebida', 'ted', 'doc',
];

// Sobras que NÃO são o nome de quem recebeu — é o banco/sistema falando de si.
const NAO_E_NOME = new Set([
  'sicredi', 'master', 'mastercard', 'visa', 'elo', 'br', 'ib', 'pf', 'pj',
  'internet pf', 'internet pj', 'ted/ib', 'debito ted/ib', 'doc/ted internet pf',
  'avulsa', 'atm', 'caixa ag', 'sobras',
]);
```

**`PREFIXOS`** — os "verbos" que o banco escreve **antes** do nome. A gente vai
**cortar** esses prefixos para isolar a contraparte. `"PAGAMENTO PIX - Fulano"` menos
`"pagamento pix"` = `"- Fulano"` (que ainda vai ser limpo).

**`NAO_E_NOME`** — uma **lista negra**: sobras que parecem nome mas são o
banco/sistema falando de si (`"sicredi"`, `"visa"`, `"br"`…). Se, depois de toda a
limpeza, o que sobrar estiver aqui, então **não há contraparte** — não vira regra.

**Por que `PREFIXOS` é array e `NAO_E_NOME` é `Set`?** Uso diferente:
- `PREFIXOS` é **percorrido em ordem** (`startsWith`), então array (a ordem pode
  importar, e a operação é "iterar").
- `NAO_E_NOME` é só **consultado** ("essa string está na lista?"), e `Set.has()` é
  O(1) — mais rápido e mais expressivo que `array.includes()` para pertencimento.

Escolher a estrutura de dados pelo **uso** é um hábito que vale registrar.

---

## Bloco 2 — extrair "quem recebeu"

```js
// Extrai "quem" da descrição. Devolve { chave, nomeado }.
// `nomeado: false` => é só o verbo do banco, sem contraparte: não vira regra.
export function chaveDescricao(descricao) {
  const original = normalizar(descricao);
  if (!original) return { chave: '(sem descrição)', nomeado: false };

  let s = original;
  for (const p of PREFIXOS) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  s = s.replace(/^[\s\-–]+/, '')      // sobrou o traço do "PIX - Fulano"
    .replace(/^\d{11,14}\s*/, '')      // CPF/CNPJ colado no nome
    .replace(/\s*-\s*br$/, '')         // "- BR" do cartão de débito
    .replace(/\s*-\s*$/, '')
    .replace(/\d{6,}/g, '')            // ids longos no meio
    .replace(/\s+/g, ' ')
    .trim();

  // Nada sobrou, ou o que sobrou é o próprio banco => sem contraparte.
  if (s.length < 3 || NAO_E_NOME.has(s)) {
    return { chave: original.slice(0, 40), nomeado: false };
  }
  return { chave: s.slice(0, 40), nomeado: true };
}
```

**O que faz.** Recebe `"PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI"` e devolve
`{ chave: 'comercio zilli', nomeado: true }`. Ou, se não sobrar nome útil,
`{ chave: '...', nomeado: false }`.

**Passo 1 — normalizar e guardar.** `normalizar` (minúsculas, sem acento). Guarda-se
o `original` porque, se a limpeza apagar tudo, a gente ainda quer uma chave (o
original cortado) pra agrupar os "sem nome" entre si.

**Passo 2 — cortar o prefixo do banco:**
```js
for (const p of PREFIXOS) {
  if (s.startsWith(p)) { s = s.slice(p.length); break; }
}
```
Percorre os verbos; no primeiro que a descrição **começa com** ele, corta-o
(`slice(p.length)` = "tudo depois do prefixo") e **para** (`break`). Só um prefixo é
removido — o da frente.

**Passo 3 — a faxina em cadeia (o `.replace` empilhado):**
Cada `.replace` devolve uma **nova** string, e o próximo `.replace` opera sobre ela —
uma **cadeia de transformações** (*method chaining*). Lendo de cima pra baixo:

| Regex | Tira | Exemplo |
|---|---|---|
| `/^[\s\-–]+/` | espaços/traços do começo | `"- fulano"` → `"fulano"` |
| `/^\d{11,14}\s*/` | CPF/CNPJ colado na frente | `"08811684000113 zilli"` → `"zilli"` |
| `/\s*-\s*br$/` | o `"- BR"` do fim (cartão de débito) | `"padaria - br"` → `"padaria"` |
| `/\s*-\s*$/` | traço solto no fim | `"loja -"` → `"loja"` |
| `/\d{6,}/g` | ids longos no meio | `"loja 000123456"` → `"loja "` |
| `/\s+/g` | espaços repetidos → um só | `"a   b"` → `"a b"` |

Detalhes de regex que aparecem:
- `^` = **âncora de início**, `$` = **âncora de fim**. `/^\d{11,14}/` só casa dígitos
  **no começo**; `/br$/` só no **fim**. Sem âncora, casaria no meio também.
- `{11,14}` = "entre 11 e 14 repetições" (CPF tem 11, CNPJ 14).
- flag `g` (global) nos que podem ocorrer **várias vezes** (ids, espaços); sem `g`,
  só a primeira ocorrência sairia.
- `[\s\-–]` inclui **dois** tipos de traço: hífen `-` e travessão `–` (bancos usam os
  dois). Dentro de `[...]`, o `\-` escapado é um hífen literal (não um intervalo).

**Passo 4 — decidir se é nome:**
```js
if (s.length < 3 || NAO_E_NOME.has(s)) {
  return { chave: original.slice(0, 40), nomeado: false };
}
return { chave: s.slice(0, 40), nomeado: true };
```
Depois da faxina, se sobrou **quase nada** (`< 3` caracteres) **ou** o que sobrou é o
próprio banco (`NAO_E_NOME.has(s)`), então **não é nome** → `nomeado: false`, e a
chave vira o original cortado (pra ainda dar pra agrupar). Senão, é nome →
`nomeado: true`. O `slice(0, 40)` limita o tamanho da chave (chave de agrupamento não
precisa ser um romance).

**Conceito por trás — extração progressiva por "descascamento".** A técnica é tirar
camada por camada o que **não** é o nome (verbo, documento, id, pontuação) até sobrar
o miolo. Cada `replace` é uma regra de "isto aqui é ruído". É frágil por natureza
(depende de conhecer os formatos dos bancos), por isso o `NAO_E_NOME` e o `< 3`
funcionam como **rede de segurança**: quando a heurística falha, ela **admite** que
falhou (`nomeado: false`) em vez de inventar um nome errado. Falhar com humildade é
melhor que acertar com sorte.

---

## Bloco 3 — agrupar para revisar

```js
// Grupos a revisar, do maior valor pro menor (resolver o topo já resolve a maior parte).
// Só entra o que está sem categoria útil e não é transferência entre contas próprias.
export function gruposParaRevisar(estado, { categoriaVazia = 'Outros' } = {}) {
  const mapa = new Map();
  for (const t of estado.transacoes || []) {
    if (t.tipo === 'transferencia') continue;
    if (t.categoria && t.categoria !== categoriaVazia) continue;

    const { chave, nomeado } = chaveDescricao(t.descricao);
    const id = `${t.tipo}|${chave}`;
    if (!mapa.has(id)) {
      mapa.set(id, {
        chave, nomeado, tipo: t.tipo, n: 0, total: 0, ids: [], exemplo: t.descricao,
      });
    }
    const g = mapa.get(id);
    g.n += 1;
    g.total += Number(t.valor) || 0;
    g.ids.push(t.id);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
```

**O que faz.** Varre as transações, pega só as que **faltam categorizar**, agrupa-as
por (tipo + quem recebeu) e devolve os grupos ordenados **do maior valor pro menor**.

**Os dois filtros de entrada (o que NÃO entra na revisão):**
```js
if (t.tipo === 'transferencia') continue;              // dinheiro seu / fatura: não é gasto
if (t.categoria && t.categoria !== categoriaVazia) continue;  // já tem categoria útil
```
- Transferências (Pix seu, pagamento de fatura) não são gasto → fora.
- Quem já tem categoria de verdade (diferente de `'Outros'`, o "vazio útil") → fora.
  Sobra exatamente o que precisa de decisão.

**O agrupamento (padrão group-by com Map):**
- `id = \`${t.tipo}|${chave}\`` — a chave do grupo combina **tipo e contraparte**.
  Por que incluir o tipo? Pra não misturar uma *entrada* "fulano" com uma *saída*
  "fulano" no mesmo balde.
- `if (!mapa.has(id)) mapa.set(id, { ...acumulador zerado... })` — cria o balde na
  primeira vez que vê aquele grupo (`n:0, total:0, ids:[]`).
- depois, acumula: `g.n += 1` (quantos), `g.total += valor` (soma), `g.ids.push(t.id)`
  (guarda os ids **pra aplicar a decisão em todos de uma vez**). `exemplo` guarda uma
  descrição crua pra mostrar na tela.

**A ordenação — a jogada de produto:**
```js
return [...mapa.values()].sort((a, b) => b.total - a.total);
```
Ordena do **maior total pro menor** (`b - a` = decrescente). O comentário explica o
porquê: **resolver o topo já resolve a maior parte**. Categorizar os 5 maiores grupos
costuma cobrir 80% do valor — o **princípio de Pareto** aplicado à UX. Você não
precisa revisar 200 lançamentos; revisa os grupos grandes e o resto é ruído.

- `{ categoriaVazia = 'Outros' } = {}` — **parâmetro-objeto com default duplo**: se
  chamado sem o 2º argumento, `= {}` evita erro ao desestruturar; e `categoriaVazia`
  assume `'Outros'`. Deixa a função configurável sem exigir configuração.
- `const { chave, nomeado } = chaveDescricao(...)` — **destructuring** do retorno.

**Conceito por trás — trabalho em lote guiado por impacto.** Duas ideias juntas: (1)
**agrupar** transforma N decisões em poucas (uma por contraparte); (2) **ordenar por
valor** faz você gastar atenção onde o dinheiro está. É desenho de interação virando
função pura: a `gruposParaRevisar` não desenha nada, mas já entrega a lista na ordem
que minimiza o esforço do usuário.

---

## Bloco 4 — o contador da aba

```js
// Quantos lançamentos ainda faltam revisar (pro contador da aba).
export function totalARevisar(estado) {
  return gruposParaRevisar(estado).reduce((acc, g) => acc + g.n, 0);
}
```

**O que faz.** Soma o `n` de todos os grupos = quantos lançamentos ainda faltam
revisar. É o número que vira o "badge" na aba Revisar ("Revisar **12**").

Reusa `gruposParaRevisar` em vez de recontar — **uma fonte de verdade** para "o que
falta revisar". Se a definição de "falta revisar" mudar (os filtros do Bloco 3), o
contador muda junto, automaticamente. É o mesmo princípio de composição que vimos em
`resumoAno` reusando `resumoMes` no [`calculos`](./calculos.explicado.md).

---

## Mapa mental

```
  estado.transacoes
        │  filtra: não-transferência E sem categoria útil
        ▼
  chaveDescricao(descricao)  ── descasca prefixo/CPF/ids → "quem recebeu"
        │                        decide nomeado? (senão vira regra ruim)
        ▼
  agrupa por (tipo|chave) num Map  → { chave, nomeado, n, total, ids, exemplo }
        │  ordena por total desc (Pareto: topo resolve a maior parte)
        ▼
  gruposParaRevisar ──► UI de revisão em lote
        └─ nomeado:true  → decisão vira REGRA (acerta pra sempre)
        └─ nomeado:false → decisão aplica só nesses `ids`
  totalARevisar ──► badge da aba
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Nomeado vs. não-nomeado** | `chaveDescricao` | só vira regra o que tem contraparte real |
| **Estrutura pelo uso** | `PREFIXOS` array, `NAO_E_NOME` Set | iterar → array; pertencer → Set (O(1)) |
| **Descascamento com `replace` encadeado** | faxina da descrição | tirar ruído camada a camada até sobrar o miolo |
| **Âncoras/flags de regex** | `^`, `$`, `g`, `{11,14}` | onde e quantas vezes casar |
| **Falhar com humildade** | `< 3 \|\| NAO_E_NOME` | admitir que não achou nome em vez de inventar |
| **Group-by com Map** | `gruposParaRevisar` | N decisões viram poucas, por contraparte |
| **Pareto na UX** | `sort` por `total` desc | resolver os grandes cobre a maior parte |
| **Parâmetro-objeto com default** | `{ categoriaVazia = 'Outros' } = {}` | configurável sem exigir configuração |
| **Composição / fonte única** | `totalARevisar` reusa grupos | contador nunca diverge da lista |

**Fim do fluxo de extrato.** Você já segue um lançamento do arquivo do banco
([`importar`](./importar.explicado.md)) até a decisão em lote (aqui). **Próximo
bloco do roteiro:** as features — `score` (saúde financeira), `planejamento`,
`reserva`, `metas`.
