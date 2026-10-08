# `src/core/importar.js` — explicado

> **O que é este arquivo:** o leitor de extratos. Recebe o **texto cru** de um
> arquivo OFX ou CSV que o banco exportou e devolve uma lista de lançamentos
> prontos para a tela de revisão — já com categoria sugerida e com os duplicados
> marcados. **Não escreve nada:** só propõe; nada entra sem o usuário confirmar.
>
> **Papel na arquitetura:** meio do fluxo de extrato.
> [`regras`](./regras.explicado.md) → **`importar`** → [`revisar`](./revisar.explicado.md).
> É um arquivo grande; vamos por partes.
>
> **Conceito guarda-chuva:** isto é um *parser* — código que transforma texto num
> formato bagunçado em dados estruturados. A dificuldade toda é que **cada banco
> exporta diferente**, então o arquivo é deliberadamente **tolerante**.

---

## Parte 1 — o cabeçalho e a convenção de sinal

```js
// importar.js — lê extrato de banco/fatura e devolve lançamentos prontos pra revisão.
//
// Aceita OFX (o "Extrato .ofx" que Nubank, Inter, Sicredi e cia exportam) e CSV.
// Não escreve nada: devolve candidatos com categoria sugerida e marca os que já
// existem no estado, pra UI mostrar e o usuário confirmar. Nada entra sem revisão.
//
// Convenção de sinal: no OFX, TRNAMT negativo = saída, positivo = entrada.

import { normalizar, mesDe } from './model.js';
import { categorizar } from './regras.js';
```

**A convenção de sinal** é a regra-chave da interpretação: nos extratos, valor
**negativo** é dinheiro **saindo** (saída), **positivo** é dinheiro **entrando**
(entrada). O arquivo converte isso em `tipo: 'saida' | 'entrada'` e guarda o valor
sempre em módulo (`Math.abs`), porque no resto do app o sinal é o `tipo`, não o
número.

---

## Parte 2 — o parser OFX

```js
// OFX 1.x é SGML (tags sem fechar) e 2.x é XML. Em vez de um parser completo,
// varremos os blocos <STMTTRN>…</STMTTRN>, que existem nos dois.
export function parseOFX(texto) {
  const out = [];
  const blocos = String(texto).match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const b of blocos) {
    const tag = (nome) => {
      const m = b.match(new RegExp(`<${nome}>\\s*([^<\r\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const valor = Number(tag('TRNAMT').replace(',', '.'));
    const dataISO = ofxData(tag('DTPOSTED'));
    if (!dataISO || !Number.isFinite(valor) || valor === 0) continue;
    const descricao = (tag('MEMO') || tag('NAME') || '').trim();
    out.push({
      data: dataISO,
      valor: Math.abs(valor),
      descricao,
      tipo: valor < 0 ? 'saida' : 'entrada',
      fitid: tag('FITID'),
    });
  }
  return out;
}
```

**O que faz.** Acha cada transação (`<STMTTRN>`) no arquivo OFX e extrai data,
valor, descrição e o id do banco (`FITID`).

**A decisão esperta — não escrever um parser XML completo.** OFX 1.x é SGML (tags que
nem sempre fecham) e 2.x é XML de verdade. Escrever um parser que aguente os dois é
trabalhão. O truque: os dois têm blocos `<STMTTRN>…</STMTTRN>`, então a gente
**varre por regex** só esses blocos e depois cada tag dentro. É "bom o bastante"
para o formato real, sem a complexidade de um parser genérico.

**A regex dos blocos, decodificada:**
```
/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi
   │        │    │              └ i = ignore case
   │        │    └ g = global (todas as ocorrências, não só a 1ª)
   │        └ [\s\S]*?  = qualquer caractere (inclusive quebra de linha), o mínimo possível
   └ literal "<STMTTRN>"
```
- `[\s\S]` é o idioma de "**qualquer** caractere, incluindo `\n`". O `.` sozinho não
  pega quebra de linha; `[\s\S]` (espaço **ou** não-espaço = tudo) pega. Essencial,
  porque um bloco OFX ocupa várias linhas.
- `*?` é o **quantificador preguiçoso** (*lazy*): casa o **mínimo** possível. Sem o
  `?`, o `*` seria ganancioso e casaria do primeiro `<STMTTRN>` até o **último**
  `</STMTTRN>` do arquivo — um bloco gigante com tudo dentro. O `*?` para no
  primeiro fechamento, isolando uma transação por vez.
- `... || []` — se `match` não achar nada, devolve `null`; o `|| []` garante um array
  pro `for` não quebrar.

**A função aninhada `tag(nome)`:**
```js
const tag = (nome) => {
  const m = b.match(new RegExp(`<${nome}>\\s*([^<\r\n]*)`, 'i'));
  return m ? m[1].trim() : '';
};
```
Um **helper local** que lê o valor de uma tag dentro do bloco `b`. Definido dentro do
laço, ele "enxerga" `b` por **closure** (fica preso à variável do escopo onde nasceu).
- `new RegExp(\`<${nome}>...\`)` — monta a regex a partir do nome (`'TRNAMT'`,
  `'MEMO'`…). Precisa ser `RegExp` construído por string porque o padrão é dinâmico.
- `\\s*` — no template string, `\\` vira uma barra só na regex final: "espaços
  opcionais depois da tag".
- `([^<\r\n]*)` — **grupo de captura**: "tudo até o próximo `<`, `\r` ou `\n`". É o
  valor da tag. Em SGML a tag não fecha, então o valor vai até o próximo `<` ou fim
  de linha — exatamente o que `[^<\r\n]*` descreve.
- `m ? m[1].trim() : ''` — `m[1]` é o conteúdo capturado; se não casou, string vazia.

**Filtro de lixo:**
```js
if (!dataISO || !Number.isFinite(valor) || valor === 0) continue;
```
Pula linhas sem data, com valor não-numérico, ou de valor zero. `Number.isFinite`
rejeita `NaN`/`Infinity` (mais rigoroso que o velho `isFinite`, que converte antes).

**Fallback de descrição:** `tag('MEMO') || tag('NAME')` — usa `MEMO` (mais
descritivo) e, se vazio, cai pro `NAME`. Bancos preenchem um ou outro.

---

## Parte 3 — a data do OFX

```js
// "20260216120000[-3:BRT]" ou "20260216" -> "2026-02-16"
function ofxData(bruto) {
  const m = String(bruto).match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
```

**O que faz.** OFX escreve data grudada (`20260216...` com hora e fuso opcionais).
Esta função pega os 8 primeiros dígitos (ano, mês, dia) e monta o `"YYYY-MM-DD"`.

- `(\d{4})(\d{2})(\d{2})` — três grupos de captura: 4 dígitos, 2, 2. `\d{4}` é
  "exatamente 4 dígitos".
- `${m[1]}-${m[2]}-${m[3]}` — remonta com os hífens. Como a regex não está ancorada,
  ela acha os 8 dígitos onde estiverem e ignora hora/fuso que venham depois.

**Conceito por trás — reformatar via captura.** Extrair pedaços com grupos e
recombiná-los é o idioma de "traduzir um formato de data em outro" sem uma
biblioteca de datas. Simples e sem dependência.

---

## Parte 4 — o parser CSV (o mais tolerante)

```js
export function parseCSV(texto) {
  const linhas = String(texto).split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];

  const sep = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], sep).map(normalizar);

  const acha = (...nomes) => cabecalho.findIndex((c) => nomes.some((n) => c.includes(n)));
  const iData = acha('data', 'date');
  const iValor = acha('valor', 'amount', 'quantia');
  const iDesc = acha('descricao', 'title', 'historico', 'estabelecimento', 'lancamento', 'memo');
  const iId = acha('identificador', 'fitid', 'id da transacao');
  if (iData < 0 || iValor < 0) return [];

  const out = [];
  for (const linha of linhas.slice(1)) {
    const cols = dividirLinha(linha, sep);
    const dataISO = csvData(cols[iData]);
    const valor = csvValor(cols[iValor]);
    if (!dataISO || !valor) continue;
    out.push({
      data: dataISO,
      valor: Math.abs(valor),
      descricao: (iDesc >= 0 ? cols[iDesc] : '').trim(),
      tipo: valor < 0 ? 'saida' : 'entrada',
      fitid: (iId >= 0 ? cols[iId] : '').trim(),
    });
  }
  return out;
}
```

**O que faz.** Lê um CSV sem exigir formato fixo: descobre o separador, acha as
colunas **pelo nome** do cabeçalho e converte cada linha.

**Achar coluna por nome, não por posição** — o coração da tolerância:
```js
const acha = (...nomes) => cabecalho.findIndex((c) => nomes.some((n) => c.includes(n)));
const iDesc = acha('descricao', 'title', 'historico', 'estabelecimento', ...);
```
- `...nomes` — **rest parameter**: junta todos os argumentos num array. `acha('valor',
  'amount', 'quantia')` recebe `nomes = ['valor','amount','quantia']`.
- `cabecalho.findIndex(c => nomes.some(n => c.includes(n)))` — procura a **posição**
  da coluna cujo título contém **algum** dos sinônimos. `some` = "existe pelo menos
  um que satisfaz".

Por que isso importa: o Nubank chama de "Descrição", o Inter de "Histórico", uma
fatura de "Estabelecimento". Em vez de exigir uma ordem fixa, o parser aceita
qualquer um dos sinônimos, em qualquer posição. É **tolerância a formato** — a mesma
filosofia do "tolerant reader" do `model.js`.

- `if (iData < 0 || iValor < 0) return [];` — sem coluna de data **ou** de valor, não
  dá pra fazer nada (`findIndex` devolve `-1` quando não acha). Descrição e id são
  opcionais (`iDesc >= 0 ? ... : ''`).
- `linhas.slice(1)` — pula o cabeçalho (linha 0) e processa o resto.

---

## Parte 5 — os três ajudantes do CSV

### 5a. Detectar o separador

```js
function detectarSeparador(linha) {
  const cands = [';', ',', '\t'];
  return cands.reduce((a, b) => ((linha.split(b).length > linha.split(a).length) ? b : a), ',');
}
```

**O que faz.** Adivinha se o CSV usa `;`, `,` ou tab, escolhendo o que **mais divide**
a primeira linha. Um CSV brasileiro costuma usar `;` (porque a vírgula já é o decimal).

- `reduce((a, b) => split(b) > split(a) ? b : a, ',')` — vai guardando o candidato
  que produz mais colunas. É um "argmax" à mão: entre os separadores, fica com o que
  quebra a linha em mais pedaços. Começa assumindo `','`.

**Conceito por trás — heurística.** Não há como *saber* o separador; a gente **infere**
pelo que faz mais sentido (quem divide mais provavelmente é o separador real). Uma
heurística é um palpite bem-fundamentado — resolve 99% dos casos sem configuração.

### 5b. Dividir respeitando aspas

```js
function dividirLinha(linha, sep) {
  const out = [];
  let atual = '';
  let dentroAspas = false;
  for (const ch of String(linha)) {
    if (ch === '"') dentroAspas = !dentroAspas;
    else if (ch === sep && !dentroAspas) { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}
```

**O que faz.** Quebra a linha nas posições do separador — **menos** os separadores
que estão **dentro de aspas**. Sem isso, `"R$ 1.234,56"` (com vírgula interna) viraria
duas colunas erradas quando o separador é `,`.

**Por que não `linha.split(sep)`?** Porque `split` é burro: quebraria dentro das
aspas também. Este laço é uma **máquina de estados** minúscula:
- `dentroAspas` é o **estado** (dentro ou fora de um campo com aspas).
- `ch === '"'` **alterna** o estado (`!dentroAspas` inverte o booleano).
- só quebra no separador **quando fora das aspas** (`!dentroAspas`).
- acumula os outros caracteres em `atual`.

**Conceito por trás — máquina de estados para parsing.** Sempre que "o significado de
um caractere depende do que veio antes" (aqui, uma vírgula significa coisas
diferentes dentro e fora de aspas), a resposta é carregar um pouco de **estado** e
decidir com base nele. É o embrião de como parsers de verdade funcionam.

### 5c. Ler data e valor tolerantes

```js
function csvData(bruto) {
  const s = String(bruto || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}
```
Aceita `"2026-02-16"` (ISO) **e** `"16/02/2026"`/`"16-02-2026"` (BR). Repare que no
formato BR os grupos são remontados **invertidos** (`${m[3]}-${m[2]}-${m[1]}` = ano,
mês, dia) para virar ISO. `[/-]` é uma **classe de caractere**: barra **ou** hífen
como separador.

```js
function csvValor(bruto) {
  let s = String(bruto || '').trim();
  if (!s) return 0;
  // "-" em qualquer ponto ANTES do 1º dígito: cobre "-50", "-R$ 50" e "R$ -50".
  const negativo = /^[^\d]*-/.test(s) || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[^\d.,]/g, '');
  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, '').replace(',', '.'); // BR
  else s = s.replace(/,/g, ''); // US
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return 0;
  return negativo ? -Math.abs(n) : n;
}
```

> **Revisão 08/10/2026:** a versão anterior testava `s.startsWith('-')`, então `"R$ -50,00"`
> (sinal depois do símbolo da moeda) virava **entrada**. A regex `^[^\d]*-` lê: "do início,
> qualquer coisa que não seja dígito, e então um `-`" — o sinal é aceito em qualquer lugar
> antes do número. Teste: `CSV: sinal depois do "R$"…` em `test/importacao.test.mjs`.

**O problema mais chato de todos: `1.234,56` (BR) vs `1234.56` (US).** O mesmo texto
`1.234` significa "mil duzentos e trinta e quatro" no Brasil e "um vírgula duzentos
e trinta e quatro" nos EUA. Como decidir?

**A heurística:** olhe **qual símbolo aparece por último**. Se a **vírgula** vem
depois do ponto (`ultimaVirgula > ultimoPonto`), o formato é BR — o ponto é milhar
(remove) e a vírgula é decimal (vira ponto). Senão, é US — a vírgula é milhar
(remove). É engenhoso: o separador decimal é sempre o **último** que aparece.

Outros detalhes:
- `s.startsWith('(') && s.endsWith(')')` — contabilidade escreve negativo entre
  parênteses: `(50,00)` = −50. Detectado antes de limpar.
- `s.replace(/[^\d.,]/g, '')` — tira tudo que **não** é dígito, ponto ou vírgula
  (`[^...]` é negação de classe). Some `"R$"`, espaços, sinais.
- `negativo ? -Math.abs(n) : n` — reaplica o sinal no fim.

**Conceito por trás — normalização de formatos regionais.** Datas e números têm
convenções locais (*locale*). Em vez de exigir uma, o parser **detecta e converte**.
É trabalhoso, mas é o que separa "só funciona com o meu banco" de "funciona com o
extrato que vier".

---

## Parte 6 — a entrada única e a chave de duplicata

```js
// ---- Entrada única ---------------------------------------------------
export function parseExtrato(texto, nomeArquivo = '') {
  const ehOFX = /\.ofx$/i.test(nomeArquivo) || /<STMTTRN>/i.test(texto);
  return ehOFX ? parseOFX(texto) : parseCSV(texto);
}

// Chave de duplicata: mesma data + mesmo valor + mesma descrição normalizada.
// (o FITID do OFX é melhor, mas nem todo banco manda — então guardamos os dois)
function chave(tx) {
  return `${tx.data}|${Number(tx.valor).toFixed(2)}|${normalizar(tx.descricao)}`;
}
```

**`parseExtrato`** é a **fachada**: decide OFX vs CSV (pela extensão do nome **ou**
pela presença de `<STMTTRN>` no conteúdo) e delega. Quem usa o módulo chama só isto.

**`chave`** monta uma **impressão digital** de uma transação: `data|valor|descrição
normalizada`. Duas transações com a mesma chave são consideradas a mesma. `toFixed(2)`
padroniza o valor (`50` e `50.00` viram a mesma string); `normalizar` tira acento/
caixa da descrição. É a base da deduplicação do próximo bloco.

---

## Parte 7 — preparar a importação (juntar tudo)

```js
// Prepara os candidatos para a tela de revisão: sugere categoria por regra e
// marca o que já parece estar lançado (pra não duplicar quando reimportar).
export function prepararImportacao(estado, brutos) {
  const jaExistem = new Set((estado.transacoes || []).map(chave));
  const jaImportados = new Set(
    (estado.transacoes || []).filter((t) => t.fitid).map((t) => t.fitid),
  );
  const regras = estado.config?.regras || [];
  const proprias = (estado.config?.contasProprias || []).map(normalizar).filter(Boolean);
  const ehPropria = (desc) => {
    const d = normalizar(desc);
    return proprias.some((p) => d.includes(p));
  };
  // Pagamento de fatura do cartão vindo do extrato: acompanhamento, nunca saída — a
  // parcela já conta no mês da fatura (calculos.js), então contar o pagamento aqui
  // também sairia em dobro. Vira "transferencia" (fora dos totais), igual ao Pix seu.
  const padroesFatura = (estado.config?.padroesFaturaPagamento || []).map(normalizar).filter(Boolean);
  const ehPagamentoFatura = (desc) => {
    const d = normalizar(desc);
    return padroesFatura.some((p) => d.includes(p));
  };

  return brutos.map((b) => {
    // duplicado vem desmarcado por padrão (não reimporta o mesmo lançamento)
    const duplicado = jaExistem.has(chave(b)) || (!!b.fitid && jaImportados.has(b.fitid));
    const base = { ...b, duplicado, importar: !duplicado, mes: mesDe(b.data) };

    // dinheiro seu indo pra você mesmo: registra, mas fora de entradas/saídas
    if (ehPropria(b.descricao)) {
      return {
        ...base, tipo: 'transferencia', categoria: 'Transferência entre contas',
        classificacao: '', reconhecido: true,
      };
    }
    // pagamento de fatura do cartão: idem — fora dos totais, senão conta o gasto 2x
    if (ehPagamentoFatura(b.descricao)) {
      return {
        ...base, tipo: 'transferencia', categoria: 'Fatura',
        classificacao: '', reconhecido: true,
      };
    }
    const sugestao = categorizar(b.descricao, regras);
    return {
      ...base,
      categoria: sugestao?.categoria || '',
      classificacao: sugestao?.classificacao || '',
      reconhecido: !!sugestao,
    };
  });
}
```

**O que faz.** Pega os lançamentos crus (`brutos`) e devolve **candidatos** para a
tela de revisão: marca duplicados, reclassifica transferências, sugere categoria.
Continua **sem escrever nada** — é tudo proposta.

**Deduplicação com dois `Set` (dois critérios):**
- `jaExistem` — conjunto das **chaves** (data|valor|descrição) das transações já
  salvas.
- `jaImportados` — conjunto dos **FITID** já salvos (id oficial do banco).

```js
const duplicado = jaExistem.has(chave(b)) || (!!b.fitid && jaImportados.has(b.fitid));
```
É duplicado se a impressão digital **ou** o FITID já existe. Por que dois? Porque o
FITID é o melhor identificador (o banco garante único), mas nem todo banco manda um.
A chave data+valor+descrição é o plano B. Usar os dois pega mais duplicata sem falso
positivo. Consultar num `Set` é **O(1)** — muito mais rápido que varrer as
transações a cada linha (seria O(n²)). É o mesmo "index once, look up many" das
parcelas.

**Reclassificação antes de categorizar** — a ordem dos `if` importa:
1. **Conta própria** (`ehPropria`): Pix seu → você mesmo. Vira `transferencia` (fica
   **fora** de entradas/saídas). Senão, mandar R$ 500 pra sua poupança contaria como
   "gasto".
2. **Pagamento de fatura** (`ehPagamentoFatura`): também vira `transferencia`. É a
   regra de ouro do cartão de novo — a parcela já conta como saída no mês da fatura
   ([`calculos`](./calculos.explicado.md)); contar o pagamento no extrato **também**
   seria o gasto **em dobro**.
3. Só quem **não** é transferência passa por `categorizar` (as regras do
   [`regras.js`](./regras.explicado.md)).

- `base = { ...b, duplicado, importar: !duplicado, mes: mesDe(b.data) }` — enriquece
  o lançamento cru com metadados de UI. `importar: !duplicado` = duplicado já vem
  **desmarcado** (não reimporta por acidente), mas o usuário pode marcar.
- `sugestao?.categoria || ''` — optional chaining + fallback: se `categorizar`
  devolveu `null`, a categoria fica vazia (vai pra revisão manual).
- `reconhecido: !!sugestao` — flag booleana pra UI mostrar "já sei o que é isto".

**Conceito por trás — pipeline de transformação puro.** `prepararImportacao` é uma
função pura: mesmo estado + mesmos brutos → mesmos candidatos, **sem efeito
colateral**. Ela não grava; devolve um plano que a UI mostra e o usuário aprova. Essa
separação "propor (puro) × aplicar (efeito)" é o núcleo funcional do app em ação — e
o que torna esta lógica testável sem abrir tela nenhuma.

---

## Parte 8 — o resumo para o cabeçalho

```js
export function resumoImportacao(candidatos) {
  return {
    total: candidatos.length,
    reconhecidos: candidatos.filter((c) => c.reconhecido).length,
    duplicados: candidatos.filter((c) => c.duplicado).length,
    aImportar: candidatos.filter((c) => c.importar).length,
    entradas: candidatos.filter((c) => c.tipo === 'entrada').length,
    saidas: candidatos.filter((c) => c.tipo === 'saida').length,
  };
}
```

**O que faz.** Conta os candidatos por categoria de status para o cabeçalho da tela
("42 lançamentos · 31 categorizados · 4 já existem"). Cada linha é um
`filter(...).length` = "quantos satisfazem X". Repetitivo de propósito: é legível de
bater o olho, e o custo (varrer a lista 6 vezes) é irrisório para dezenas de itens.

---

## Mapa mental

```
  arquivo do banco (texto)
        │  parseExtrato → escolhe OFX ou CSV
        ├──► parseOFX  (regex nos blocos <STMTTRN>)
        └──► parseCSV  (detecta separador, acha colunas por nome, normaliza data/valor)
                 │
                 ▼   brutos: [{data, valor, descricao, tipo, fitid}]
        prepararImportacao(estado, brutos)
                 │  • marca duplicado (Set de chave + Set de fitid)
                 │  • conta própria / pagto fatura → 'transferencia'
                 │  • senão → categorizar (regras.js)
                 ▼
        candidatos  ──►  UI de revisão (usuário confirma)  ──►  importarTransacoes (index.js)
        resumoImportacao(candidatos) ──► cabeçalho
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Parser tolerante** | arquivo todo | aceitar formatos diferentes em vez de exigir um |
| **Regex: `[\s\S]`, lazy `*?`, grupos, classes** | `parseOFX`, datas | casar/ extrair pedaços de texto |
| **Regex dinâmica (`new RegExp`)** | `tag(nome)` | montar o padrão a partir de uma variável |
| **Closure** | `tag` enxerga `b` | função aninhada lembra o escopo onde nasceu |
| **Achar coluna por nome** | `acha(...nomes)` | robustez a ordem/nomenclatura de cabeçalho |
| **Rest param `...nomes`** | `acha` | juntar argumentos variados num array |
| **Máquina de estados** | `dividirLinha` | `dentroAspas` decide o sentido de cada char |
| **Heurística** | separador, BR vs US | palpite bem-fundado que evita configuração |
| **Normalização de locale** | `csvData`, `csvValor` | converter data/número regional pro padrão interno |
| **Fingerprint + Set (dedupe)** | `chave`, `jaExistem` | detectar duplicata em O(1) |
| **Reclassificar antes de somar** | conta própria / fatura | evitar contar transferência como gasto |
| **Pipeline puro (propor ≠ aplicar)** | `prepararImportacao` | devolve plano; quem grava é outro |

**Próximo:** [`revisar`](./revisar.explicado.md) — o que fazer com os lançamentos que
`categorizar` **não** reconheceu: agrupá-los por "quem recebeu" e resolver em lote.
