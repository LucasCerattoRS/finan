# `src/core/regras.js` — explicado

> **O que é este arquivo:** o motor de **categorização**. Recebe a descrição crua
> de um lançamento do banco (`"IFD*IFOOD SAO PAULO"`) e devolve a categoria e a
> classificação certas (`Alimentação` / `Não essencial`). É a inteligência que
> poupa você de categorizar tudo na mão.
>
> **Papel na arquitetura:** primeiro elo do fluxo de extrato.
> **`regras`** (que categoria é isto?) → [`importar`](./importar.explicado.md) (ler
> o arquivo do banco) → [`revisar`](./revisar.explicado.md) (resolver em lote o que
> sobrou). O `importar` chama o `categorizar` daqui em cada linha.

---

## Bloco 0 — o cabeçalho e o modelo de uma regra

```js
// regras.js — motor de categorização. Transforma a descrição crua do extrato
// ("IFD*IFOOD SAO PAULO", "PIX ENVIADO JOAO") na categoria e classificação certas.
//
// Uma regra é { padrao, categoria, classificacao }. `padrao` é texto simples:
// casa se aparecer em qualquer lugar da descrição, ignorando acento e caixa.
// A PRIMEIRA regra que casar vence — por isso a ordem importa (mais específica
// primeiro). As regras do usuário (estado.config.regras) vêm antes das padrão.

import { normalizar } from './model.js';
```

**O modelo de dados de uma regra:** `{ padrao, categoria, classificacao }`.
- `padrao` — um **texto simples** (não regex). Casa se aparecer em qualquer lugar da
  descrição. `"ifood"` casa `"IFD*IFOOD SAO PAULO"`.
- `categoria` / `classificacao` — o que aplicar quando casar.

**Três decisões de design já anunciadas aqui:**
1. **Busca por substring, ignorando acento e caixa.** `"padaria"` casa `"PADARIA"`,
   `"Padaria"`, `"panificadora do josé"`… graças ao `normalizar` (que você viu no
   `model.js`: minúsculas + remove acentos).
2. **Primeira que casar vence.** A ordem da lista é a prioridade. Regra específica
   tem que vir antes da genérica.
3. **Regras do usuário antes das padrão.** O que você configurou tem prioridade
   sobre a "rede de segurança" embutida.

---

## Bloco 1 — as regras padrão

```js
// Ponto de partida pensado pro extrato brasileiro. O usuário edita/adiciona
// as dele em Config; estas ficam como rede de segurança no fim da fila.
export const REGRAS_PADRAO = [
  { padrao: 'ifood', categoria: 'Alimentação', classificacao: 'Não essencial' },
  { padrao: 'rappi', categoria: 'Alimentação', classificacao: 'Não essencial' },
  { padrao: 'padaria', categoria: 'Padaria', classificacao: 'Essencial' },
  { padrao: 'panificadora', categoria: 'Padaria', classificacao: 'Essencial' },
  { padrao: 'supermercado', categoria: 'Mercado', classificacao: 'Essencial' },
  { padrao: 'mercado', categoria: 'Mercado', classificacao: 'Essencial' },
  { padrao: 'atacad', categoria: 'Mercado', classificacao: 'Essencial' },
  { padrao: 'farmacia', categoria: 'Farmácia', classificacao: 'Essencial' },
  { padrao: 'drogaria', categoria: 'Farmácia', classificacao: 'Essencial' },
  { padrao: 'posto', categoria: 'Gasolina', classificacao: 'Essencial' },
  { padrao: 'combustivel', categoria: 'Gasolina', classificacao: 'Essencial' },
  { padrao: 'uber', categoria: 'Transporte', classificacao: 'Não essencial' },
  { padrao: '99app', categoria: 'Transporte', classificacao: 'Não essencial' },
  { padrao: 'netflix', categoria: 'Assinaturas', classificacao: 'Não essencial' },
  { padrao: 'spotify', categoria: 'Assinaturas', classificacao: 'Não essencial' },
  { padrao: 'academia', categoria: 'Saúde', classificacao: 'Essencial' },
  { padrao: 'laboratorio', categoria: 'Saúde', classificacao: 'Essencial' },
  { padrao: 'amazon', categoria: 'Outros', classificacao: 'Não essencial' },

  // Padrões do extrato brasileiro (vistos nos extratos Sicredi/BTG)
  { padrao: 'transf conta salario', categoria: 'Salário', classificacao: 'Essencial' },
  { padrao: 'salario', categoria: 'Salário', classificacao: 'Essencial' },
  { padrao: 'pagto fatura', categoria: 'Fatura', classificacao: 'Essencial' },
  { padrao: 'pagamento de fatura', categoria: 'Fatura', classificacao: 'Essencial' },
  { padrao: 'fatura', categoria: 'Fatura', classificacao: 'Essencial' },
  { padrao: 'tarifa', categoria: 'Tarifas bancárias', classificacao: 'Essencial' },
  { padrao: 'cesta de servicos', categoria: 'Tarifas bancárias', classificacao: 'Essencial' },
  { padrao: 'saque', categoria: 'Saque', classificacao: '' },
  { padrao: 'detran', categoria: 'Impostos', classificacao: 'Essencial' },
  { padrao: 'darf', categoria: 'Impostos', classificacao: 'Essencial' },
  { padrao: 'seguro', categoria: 'Casa', classificacao: 'Essencial' },
];
```

**O que é.** Uma lista-semente pensada para o extrato brasileiro (iFood, Uber,
Sicredi, BTG…). O usuário edita a dele em Config; estas ficam **no fim da fila**
como rede de segurança.

**Lendo a lista inteira (os grupos por tema).** Não é uma lista aleatória — dá pra ler por
blocos temáticos:
- **Delivery/compras não essenciais:** `ifood`, `rappi`, `amazon` → sempre "Não essencial".
- **Mercado/alimentação do dia a dia:** `padaria`, `panificadora`, `supermercado`, `mercado`,
  `atacad` (pega "atacadão"/"atacadista" por substring) → todos "Essencial".
- **Saúde:** `farmacia`, `drogaria`, `academia`, `laboratorio` → "Essencial".
- **Transporte/combustível:** `posto`, `combustivel`, `uber`, `99app` — repare que a dupla
  posto/combustível é "Essencial" mas uber/99app é "Não essencial" (mesma categoria
  `Transporte`, classificação diferente — o app distingue *categoria* de *classificação*).
- **Assinaturas:** `netflix`, `spotify` → "Não essencial".
- **Bloco bancário brasileiro** (o comentário `// Padrões do extrato brasileiro...` marca a
  virada): `salario`/`transf conta salario`, a tripla de fatura (ver a ordem abaixo), `tarifa`/
  `cesta de servicos`, `saque` (classificação vazia de propósito — ver adiante), `detran`/`darf`
  (impostos), `seguro`.

**A ordem é a regra — repare no caso `fatura`:**
```js
{ padrao: 'pagto fatura', ... },        // específico, vem antes
{ padrao: 'pagamento de fatura', ... },
{ padrao: 'fatura', ... },              // genérico, vem depois
```
`"pagto fatura"` precisa vir **antes** de `"fatura"`. Se `"fatura"` viesse primeiro,
ela casaria `"PAGTO FATURA"` também (porque `"fatura"` é substring de `"pagto
fatura"`) e a regra mais específica nunca rodaria. **Do mais específico ao mais
genérico** é a disciplina que uma lista ordenada de padrões exige.

**Conceito por trás — "dados como configuração".** As regras são **dados** (um
array de objetos), não `if/else` no código. Adicionar um padrão é adicionar uma
linha na lista, não escrever lógica nova. Isso é *data-driven design*: o
comportamento é uma tabela que dá pra editar (inclusive o usuário, em runtime),
não um bloco de código que só um programador mexe. Repare que a mesma função
`categorizar` serve regras embutidas e regras do usuário — porque ambas são só
dados no mesmo formato.

**Observação sobre `classificacao: ''`** (ex.: `saque`): alguns padrões deixam a
classificação vazia de propósito — "saque" não é essencial nem supérfluo por si;
quem decide é o contexto. Vazio aqui significa "não arrisco um chute".

---

## Bloco 2 — a função `categorizar`

```js
// Aplica as regras (as do usuário primeiro) a uma descrição.
// Devolve { categoria, classificacao, padrao } ou null se nada casar.
export function categorizar(descricao, regrasUsuario = []) {
  const alvo = normalizar(descricao);
  if (!alvo) return null;
  for (const r of [...regrasUsuario, ...REGRAS_PADRAO]) {
    const p = normalizar(r.padrao);
    if (p && alvo.includes(p)) {
      return { categoria: r.categoria, classificacao: r.classificacao || '', padrao: r.padrao };
    }
  }
  return null;
}
```

**O que faz.** Normaliza a descrição, percorre as regras (usuário primeiro, padrão
depois) e devolve a **primeira** que casar — ou `null` se nenhuma casar.

**Passo a passo:**

`const alvo = normalizar(descricao);` — bota a descrição em minúsculas e sem acento.
A comparação vai ser "normalizado × normalizado", então acento e caixa deixam de
importar dos dois lados.

`if (!alvo) return null;` — descrição vazia não tem o que categorizar. **Early
return.**

`for (const r of [...regrasUsuario, ...REGRAS_PADRAO])` — o pulo do gato. O **spread**
concatena as duas listas numa só, **usuário na frente**. Como o `for` para na
primeira que casar (o `return` dentro do laço), as regras do usuário têm prioridade
natural — não por um `if` extra, mas pela **ordem** em que aparecem. Elegante: a
precedência é geometria da lista.

`if (p && alvo.includes(p))` — `p &&` protege contra padrão vazio (um `padrao: ''`
casaria tudo, porque `"qualquer coisa".includes("")` é `true`); só então testa a
substring.

`return { ..., classificacao: r.classificacao || '', padrao: r.padrao };` — devolve
também **qual** padrão casou. Isso é útil pra UI explicar "categorizei por causa da
regra 'ifood'" e pra depurar. O `|| ''` normaliza classificação ausente.

`return null;` no fim — o contrato é claro: **um objeto quando casa, `null` quando
não**. Quem chama (`importar.js`) testa `!!sugestao`.

**Conceito por trás — "first match wins" (primeira ocorrência vence).** É a mesma
estratégia de um firewall, de um `switch`, de roteamento de URLs: uma lista ordenada
de regras, para na primeira que bate. A consequência prática — **ordem = prioridade**
— é o que o programador precisa ter na cabeça ao editar a lista.

**Alternativa e trade-off.** Poderíamos usar regex em vez de substring (`/ifood/i`).
Ganharíamos poder (âncoras, alternativas), mas: (a) o usuário comum não escreve
regex; (b) um regex mal escrito trava ou casa demais. Substring normalizada é
"fraca" de propósito — previsível, segura, editável por qualquer um. É o clássico
"escolha a ferramenta mais simples que resolve".

**Armadilha — substring casa demais.** Como `"mercado"` casa por substring,
`"supermercado"` também casa a regra `"mercado"`. Aqui até dá certo (ambas → Mercado),
mas é a fonte de surpresa nº 1 desse tipo de motor: um padrão curto engole descrições
que você não esperava. Solução: padrão mais específico **antes**, e padrões curtos
com cuidado.

---

## Mapa mental

```
  descricao ("IFD*IFOOD SAO PAULO")
        │  normalizar → "ifd*ifood sao paulo"
        ▼
  [ ...regrasUsuario , ...REGRAS_PADRAO ]   (usuário tem prioridade pela ordem)
        │  primeira cujo `padrao` é substring
        ▼
  { categoria:'Alimentação', classificacao:'Não essencial', padrao:'ifood' }
        │  (ou null se nada casar → cai pra revisão manual em revisar.js)
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Dados como configuração** | `REGRAS_PADRAO` | comportamento é uma tabela editável, não `if/else` |
| **First match wins** | laço com `return` dentro | lista ordenada; para na primeira que bate |
| **Ordem = prioridade** | usuário antes de padrão | precedência pela geometria da lista, sem `if` extra |
| **Normalizar dos dois lados** | `normalizar` no alvo e no padrão | acento/caixa somem, comparação fica justa |
| **Substring vs regex** | `alvo.includes(p)` | escolher a ferramenta mais simples e previsível |
| **Contrato objeto-ou-`null`** | retorno | "casou" vs "não casou" sem ambiguidade |
| **Guarda de padrão vazio** | `p && …` | evitar que `''` case tudo |

**Próximo:** [`importar`](./importar.explicado.md) — de onde vêm essas descrições:
ler OFX e CSV de banco, e chamar `categorizar` em cada linha.
