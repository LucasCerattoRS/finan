# `src/ui/app.js` — Parte 7: Metas, Config e o boot (`init`)

> **O que é esta parte:** as últimas 252 linhas do arquivo (932–1183) — a tela
> de Metas financeiras (`prazoLegivel`, `cardMeta`, `renderMetas`), a tela de
> Configurações (`renderConfig` e seus três editores — contas próprias,
> regras, categorias/formas de pagamento) e, por fim, `init()`: a **única**
> função que o `<script type="module">` chama sem estar dentro do roteador —
> o boot do app inteiro.
>
> **Papel na arquitetura.** As telas de Metas e Config fecham o padrão "UI é
> composição do núcleo" que atravessou as seis partes anteriores — nada de
> regra de negócio nova aqui, só apresentação e formulários em cima do que
> `metas.js` já calcula. `init()` é diferente: é a única função deste arquivo
> que **não** é chamada pelo roteador (`render()`), e sim uma vez só, no
> carregamento da página — ela é a ponte entre "o `index.html` acabou de
> carregar" e "a primeira tela está na tela". Vale dar atenção especial a
> ela: é o **Fluxo 1** do [`FLUXOGRAMA.md`](./FLUXOGRAMA.md) ("Abrir o app"),
> visto agora do lado de dentro.
>
> **Pré-requisitos:** [`app.parte1.explicado.md`](./app.parte1.explicado.md)
> (helpers `el`/`field`/`kpi`/`persistir`/`opts`, o roteador `render()`),
> [`metas.explicado.md`](./metas.explicado.md) (`resumoMetas`, `mesesParaAlvo`,
> a fábrica `meta(...)`), [`regras.explicado.md`](./regras.explicado.md)
> (`REGRAS_PADRAO`, `categorizar`) e o Fluxo 1 de
> [`FLUXOGRAMA.md`](./FLUXOGRAMA.md) — leia-o **antes** da seção sobre
> `init()` abaixo, ele mostra os arquivos que rodam antes deste (`main.js`,
> `preload.js`, `storage.js`) até chegar aqui.

---

## Bloco 1 — `prazoLegivel`: um fato vira uma frase em português

```js
function prazoLegivel(meses) {
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  if (anos && m) return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${m} ${m === 1 ? 'mês' : 'meses'}`;
  if (anos) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${m} ${m === 1 ? 'mês' : 'meses'}`;
}
```

**O que faz.** Recebe um número inteiro de meses (por exemplo `14`) e devolve
uma frase em português com pluralização correta (`"1 ano e 2 meses"`, não
`"1 anos e 2 mes"`).

**Como faz.** `Math.floor(meses / 12)` extrai os anos completos;
`meses % 12` (resto da divisão) extrai o que sobra em meses. Os três `if`
cobrem as combinações possíveis: anos e meses (`"X anos e Y meses"`), só anos
(`m` é 0, então o segundo `if` nunca chegaria a mostrar "0 meses"), e só
meses (quando `anos` é 0, que é falsy, o primeiro e o segundo `if` são
pulados).

**Sintaxe — pluralização manual com ternário.** `anos === 1 ? 'ano' : 'anos'`
é o jeito mais direto de resolver singular/plural em português sem trazer
uma biblioteca de i18n para um app pequeno e offline: só duas formas
possíveis (`1` é singular, qualquer outro valor — inclusive `0`, que nunca
chega a aparecer aqui — é plural).

**Conceito por trás — por que esta função vive em `app.js` e não em
`metas.js` (núcleo).** `mesesParaAlvo` (núcleo, ver `metas.explicado.md`)
devolve um **fato**: um inteiro de meses, ou `null` se o alvo nunca é
alcançado. Transformar `14` em `"1 ano e 2 meses"` é **apresentação**
(fraseado e pluralização em português) — por definição, pertence à casca da
UI, não ao núcleo, que precisa continuar puro e livre de decisões de idioma
ou formatação textual. É a mesma fronteira já vista desde `storage.js`: o
núcleo entrega o número certo; a UI decide como um humano lê esse número.

---

## Bloco 2 — `cardMeta`: a fábrica DRY de um card de meta

```js
function cardMeta(titulo, d, base) {
  const pct = Math.round(d.progresso * 100);
  let prazo = '';
  if (d.faltam <= 0) prazo = ' — meta atingida 🎉';
  else if (d.prazoMeses == null) prazo = ' — defina um aporte mensal para estimar o prazo';
  else prazo = ` — no seu ritmo, ~${prazoLegivel(d.prazoMeses)}`;
  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, titulo));
  card.append(el('div', { class: 'grid-kpi' }, [
    kpi('Alvo', fmt(d.alvo)),
    kpi('Você tem', fmt(d.atual), d.atual > 0 ? 'pos' : ''),
    kpi('Faltam', fmt(d.faltam), d.faltam > 0 ? 'neg' : 'pos'),
  ]));
  card.append(el('div', { class: 'bar bar-orc', style: 'max-width:none' }, el('i', { style: `width:${pct}%` })));
  card.append(el('p', { class: 'muted', style: 'margin:8px 0 0' }, `${base}. ${pct}%${prazo}.`));
  return card;
}
```

**O que faz.** Recebe um título (`'🛟 Reserva de emergência'`), o objeto `d`
que a fábrica `meta(...)` do núcleo já monta (`alvo`/`atual`/`faltam`/
`progresso`/`prazoMeses`, ver `metas.explicado.md`) e uma frase-base
explicando a meta (`base`), e devolve um card completo: três KPIs, uma barra
de progresso e uma frase de status.

**Sintaxe — três variações de `prazo`, decididas por `if`/`else if`/`else`
em cascata.** `d.faltam <= 0` (já alcançou) tem prioridade sobre
`d.prazoMeses == null` (nunca alcança, sem aporte suficiente), que por sua
vez tem prioridade sobre o caso normal (mostra a estimativa via
`prazoLegivel`). A ordem importa: se a meta já foi atingida (`faltam <= 0`),
`prazoMeses` poderia ser `0` (que passaria no `== null`? não — `0 == null` é
`false` em JS, então na prática a ordem dos dois primeiros `if`s não
colidiria mesmo invertida, mas manter "já atingiu" primeiro deixa a leitura
do código mais direta: trata o caso feliz antes do caso "não vai dar").

**Sintaxe — `d.prazoMeses == null` com igualdade solta (`==`), não
estrita.** Esta é uma das raras vezes no arquivo em que `==` aparece em vez
de `===`. `== null` é um idioma consagrado em JavaScript: `x == null` é
`true` para **tanto** `null` **quanto** `undefined` (mas não para `0`,
`''` ou `false`), então é um jeito compacto de testar "esse valor está
ausente, nas suas duas formas possíveis" sem escrever
`x === null || x === undefined`. Vale reconhecer o padrão porque é uma das
únicas exceções conscientes à regra geral "sempre `===`".

**Conceito por trás — a mesma fábrica DRY de `metas.js`, uma camada acima.**
O núcleo tem `meta(nome, alvoReais, atualReais, rende)` (ver
`metas.explicado.md`) para não repetir o bloco alvo/atual/faltam/progresso
três vezes (reserva, liberdade, dividendos). Aqui, uma camada acima,
`cardMeta` existe para não repetir o **card visual** três vezes. A mesma
disciplina — "não repita a forma" — aplicada de forma independente em duas
camadas diferentes (dado no núcleo, DOM na UI) é um sinal de que o
princípio foi internalizado no projeto todo, não só copiado de um lugar
para o outro.

---

## Bloco 3 — `renderMetas`: cabeçalho, KPIs e os três cards

```js
function renderMetas(v) {
  const m = C.resumoMetas(estado);
  v.append(el('h2', {}, 'Metas financeiras'));
  v.append(el('p', { class: 'muted', style: 'margin:-4px 0 16px' },
    'Quanto falta para a reserva, para a liberdade financeira e para viver de dividendos — a partir da sua renda e do que você já tem investido.'));

  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Renda mensal', fmt(m.renda), 'pos', 'soma dos componentes abaixo'),
    kpi('Patrimônio investido', fmt(m.patrimonioInvestido), '', 'informado à mão'),
    kpi('Aporte mensal', fmt(m.aporteMensal), '', 'quanto você guarda/investe por mês'),
  ]));
```

**O que faz.** Lê `C.resumoMetas(estado)` (uma única chamada ao núcleo que já
devolve as três metas prontas, ver `metas.explicado.md`) e monta os três KPIs
de contexto: renda, patrimônio, aporte — os três **insumos** que alimentam
todas as contas de prazo abaixo.

```js
  // as três metas
  v.append(cardMeta('🛟 Reserva de emergência', m.reserva,
    m.reserva.metaMeses
      ? `${m.reserva.metaMeses} ${m.reserva.metaMeses === 1 ? 'mês' : 'meses'} de gasto médio (${fmt(m.reserva.gastoMedio)}/mês)`
      : 'defina a meta em meses na aba Reservas'));
  v.append(cardMeta('🕊️ Liberdade financeira', m.liberdade,
    `${m.liberdade.metaMeses} ${m.liberdade.metaMeses === 1 ? 'mês' : 'meses'} de renda guardados`));
  v.append(cardMeta('💸 Viver de dividendos', m.dividendos,
    `renda passiva ≥ sua renda, rendendo ${(m.dividendos.yield * 100).toLocaleString('pt-BR')}% a.a.`));
```

**O que faz.** Três chamadas a `cardMeta`, uma por meta — a prova de que a
fábrica do Bloco 2 realmente elimina a repetição: cada linha só varia
título, objeto `d` e a frase-base.

**Sintaxe — `(m.dividendos.yield * 100).toLocaleString('pt-BR')`.** O
`yield` é guardado como fração (`0.06` = 6% ao ano); multiplicar por 100 e
formatar com `toLocaleString('pt-BR')` (que usa vírgula decimal, convenção
brasileira) transforma o número interno em algo legível (`"6"` ou `"6,5"`)
sem precisar de uma função de formatação de porcentagem dedicada.

**Armadilha evitada — `m.reserva.metaMeses ? ... : 'defina a meta em meses
na aba Reservas'`.** A meta de reserva é a **única** das três que pode não
ter sido configurada ainda (as outras duas sempre têm um valor, mesmo que
`0`). Se `metaMeses` for `0` (ninguém definiu), a frase-base muda para uma
instrução de onde ir configurar — evitando um card confuso do tipo "0 meses
de gasto médio (R$ 0,00/mês)" para quem ainda não usou a aba Reservas.

---

## Bloco 4 — editor da renda: cópia defensiva + `.forEach` com índice

```js
  // editor da renda (componentes)
  const comps = (estado.config?.metas?.rendaComponentes || []).map((c) => ({ ...c }));
  const rcard = el('div', { class: 'card' });
  rcard.append(el('h3', {}, 'Sua renda mensal'));
  rcard.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'Some tudo que entra por mês (salário, benefícios, bolsa). É a base da liberdade financeira e do "viver de dividendos".'));
```

**Sintaxe — `estado.config?.metas?.rendaComponentes || []`.** O
**optional chaining** (`?.`) encadeado duas vezes: se `estado.config` ou
`estado.config.metas` ainda não existirem (estado antigo, migração
incompleta, ou app recém-instalado), a expressão inteira devolve
`undefined` em vez de lançar `TypeError: Cannot read properties of
undefined`, e o `|| []` final garante um array vazio para o `.map` seguinte
nunca quebrar.

**Conceito por trás — `.map((c) => ({ ...c }))` é uma cópia defensiva.**
Cada componente de renda (`{ nome, valor }`) é **clonado** — os inputs desta
tela vão editar a **cópia** (`comps`), não os objetos que vivem dentro de
`estado`. Sem essa cópia, editar um input mais abaixo mutaria o objeto
dentro de `estado` **por referência**, direto, sem passar por
`estado = C.definirMetas(...)` — quebrando a garantia (repetida desde a
Parte 1) de que `estado` só muda através do ritual de `persistir()`. Só
quando o usuário sai do campo (`blur`) é que a versão nova é submetida de
uma vez ao núcleo, substituindo `estado` inteiro.

```js
  comps.forEach((c, i) => {
    const nomeInp = el('input', { type: 'text', value: c.nome, placeholder: 'nome' });
    const valInp = el('input', { type: 'number', step: '0.01', min: '0', value: String(c.valor), class: 'renda-val' });
    const salvar = async () => {
      const novos = comps.map((x, j) => (j === i
        ? { nome: nomeInp.value.trim() || 'Renda', valor: Number(valInp.value) || 0 }
        : x));
      estado = C.definirMetas(estado, { rendaComponentes: novos });
      await persistir();
    };
    nomeInp.addEventListener('blur', salvar);
    valInp.addEventListener('blur', salvar);
    valInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
```

**O que faz.** Para cada componente de renda, desenha dois inputs (nome,
valor) que salvam ao perder o foco.

**Como faz — `comps.map((x, j) => (j === i ? {...novo} : x))` dentro de
`salvar`.** Para atualizar **só** o componente da posição `i`, a função
constrói um array **novo** substituindo apenas o item cujo índice bate
(`j === i`); todos os outros (`x`) passam intocados. É o idioma de
"atualização imutável de um item numa lista" — em vez de
`comps[i].nome = ...` (mutação direta, proibida pela mesma razão do
parágrafo anterior), gera-se uma lista nova a cada salvamento, que só então
é entregue ao núcleo via `C.definirMetas`.

**Armadilha evitada — `nomeInp.value.trim() || 'Renda'`.** Um componente de
renda sem nome (campo deixado em branco) receberia o rótulo genérico
`'Renda'` em vez de ficar com uma string vazia — um chip sem texto algum na
lista de componentes seria confuso e difícil de identificar depois.

```js
    rcard.append(el('div', { class: 'form-row' }, [
      field('Componente', nomeInp),
      field('Valor (R$/mês)', valInp),
      el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', {
        class: 'btn danger', title: 'Remover',
        onclick: async () => {
          estado = C.definirMetas(estado, { rendaComponentes: comps.filter((_, j) => j !== i) });
          await persistir(); toast('Componente removido');
        },
      }, '✕')]),
    ]));
  });
```

**Sintaxe — `comps.filter((_, j) => j !== i)`.** O parâmetro `_` (sublinhado)
é uma convenção para "este parâmetro existe porque a assinatura de
`.filter` exige, mas eu não uso o valor" — só o índice `j` importa aqui.
Remover o item `i` é filtrar por "todo índice diferente de `i`", o mesmo
idioma de "excluir por posição" que aparece em outras remoções do arquivo.

---

## Bloco 5 — botão de adicionar componente e o total

```js
  rcard.append(el('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:4px' }, [
    el('button', {
      class: 'btn ghost',
      onclick: async () => {
        estado = C.definirMetas(estado, { rendaComponentes: [...comps, { nome: 'Novo', valor: 0 }] });
        await persistir();
      },
    }, '+ Adicionar componente'),
    el('span', { class: 'muted' }, `Total: ${fmt(m.renda)}`),
  ]));
  v.append(rcard);
```

**O que faz.** Um botão que acrescenta um componente novo (`spread` de
`comps` seguido do item novo, o idioma padrão de "array + 1 item, sem
mutar") e, ao lado, o total já formatado.

**Sintaxe — `style: 'display:flex;align-items:center;gap:12px;...'` como
string inline.** Diferente da maioria dos elementos do arquivo (que usam
classes CSS definidas em `app.css`), este `<div>` recebe estilo inline
diretamente — um atalho pontual para um layout que só aparece aqui (botão +
texto lado a lado, sem precisar de uma classe CSS nova só para isso).

---

## Bloco 6 — editor das premissas: cinco inputs, um `salvarPrem`

```js
  // editor das premissas (patrimônio, aporte, taxa, meses de liberdade, yield)
  const meta = estado.config?.metas || {};
  const patInp = el('input', { type: 'number', step: '0.01', min: '0', value: String(m.patrimonioInvestido) });
  const apInp = el('input', { type: 'number', step: '0.01', min: '0', value: String(m.aporteMensal) });
  const taxaInp = el('input', { type: 'number', step: '0.1', min: '0', value: String(((Number(meta.taxaAnual) || 0) * 100)) });
  const libInp = el('input', { type: 'number', step: '1', min: '0', value: String(m.liberdade.metaMeses) });
  const yldInp = el('input', { type: 'number', step: '0.1', min: '0', value: String(((m.dividendos.yield || 0) * 100)) });
  const salvarPrem = async () => {
    estado = C.definirMetas(estado, {
      patrimonioInvestido: Number(patInp.value) || 0,
      aporteMensal: Number(apInp.value) || 0,
      taxaAnual: (Number(taxaInp.value) || 0) / 100,
      libFinanceiraMeses: Math.max(0, Math.round(Number(libInp.value) || 0)),
      dividendosYield: (Number(yldInp.value) || 0) / 100,
    });
    await persistir(); toast('Premissas salvas');
  };
```

**O que faz.** Cinco inputs para as premissas que alimentam as contas de
`metas.js`: patrimônio já investido, aporte mensal, taxa de rendimento
anual, quantos meses de renda definem "liberdade financeira", e o yield que
define "viver de dividendos". `salvarPrem` lê os cinco de uma vez e chama
`C.definirMetas` uma única vez (diferente do editor de renda, que salva
componente por componente).

**Conceito por trás — taxa e yield são armazenados como fração, exibidos
como percentual.** `taxaInp`/`yldInp` mostram `((valor || 0) * 100)` (fração
`0.06` vira `"6"` no campo) e `salvarPrem` faz o caminho inverso
(`/ 100`) na hora de gravar. É a mesma fronteira de tradução já vista em
`renderReservas` (Parte 6, sinal ↔ palavra humana): o núcleo trabalha com a
unidade matematicamente conveniente (fração, para multiplicar direto em
`mesesParaAlvo`); a UI trabalha com a unidade que o humano espera ler
(percentual).

**Por que este editor **não** salva em `blur`, ao contrário dos outros
formulários da tela.** Repare que nenhum destes cinco inputs tem
`addEventListener('blur', salvarPrem)` — o salvamento só acontece pelo botão
"Salvar premissas" abaixo (Bloco 7). Como as cinco premissas se relacionam
entre si (mudar o aporte também recalcula prazo, taxa também), salvar campo
a campo em `blur` faria cada saída de campo disparar um recálculo parcial
das outras metas — um botão único de "Salvar premissas" trata as cinco como
uma submissão atômica.

---

## Bloco 7 — `pcard`: onde as premissas viram formulário na tela

```js
  const pcard = el('div', { class: 'card' });
  pcard.append(el('h3', {}, 'Premissas'));
  pcard.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'O patrimônio é o que você já tem investido (o app não puxa cotação — você atualiza aqui). O rendimento anual projeta o prazo; o yield define quanto capital gera renda passiva igual à sua renda.'));
  pcard.append(el('div', { class: 'form-row' }, [
    field('Patrimônio investido (R$)', patInp),
    field('Aporte mensal (R$)', apInp),
    field('Rendimento anual (%)', taxaInp),
  ]));
  pcard.append(el('div', { class: 'form-row' }, [
    field('Liberdade: meses de renda', libInp),
    field('Dividendos: yield (% a.a.)', yldInp),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: salvarPrem }, 'Salvar premissas')]),
  ]));
  v.append(pcard);
}
```

**O que faz.** Dois `form-row` (a tela quebra os cinco campos em duas linhas
de três/dois campos, mais o botão) que só arrumam os inputs já criados no
Bloco 6 dentro de `field(...)` — nenhuma lógica nova, só layout.

**Conceito por trás — separar "criar os inputs e a função de salvar"
(Bloco 6) de "desenhar o formulário" (aqui) é só um jeito de organizar a
leitura, não uma regra rígida do arquivo.** Em outras funções (por exemplo
`contasPropriasEditor`, Bloco 9) os dois passos ficam entrelaçados. Aqui
foram separados porque cinco inputs distintos, todos alimentando o mesmo
`salvarPrem`, ficam mais fáceis de acompanhar quando a lista de campos é
declarada antes de qualquer HTML.

---

## Bloco 8 — `renderConfig`: quatro editores e o card de backup

```js
// ---------- Config ----------
function renderConfig(v) {
  v.append(el('h2', {}, 'Configurações'));

  v.append(contasPropriasEditor());
  v.append(regrasEditor());
  v.append(chipsEditor('Categorias', 'categorias'));
  v.append(chipsEditor('Formas de pagamento', 'formasPagamento'));
```

**O que faz.** `renderConfig` em si é curtíssima: quatro chamadas que
**cada uma devolve um card pronto** (não recebem `v` — constroem e
retornam), mais um card de backup montado inline. É a única tela do
arquivo cujo corpo principal é uma lista de "monte isto, anexe isto",
sem nenhuma lógica própria.

```js
  const backup = el('div', { class: 'card' });
  backup.append(el('h3', {}, 'Backup dos dados'));
  const info = el('div', { class: 'muted', style: 'margin-bottom:10px' }, 'Carregando local...');
  localDados().then((p) => { info.textContent = `Dados salvos em: ${p}`; });
  backup.append(info);
  backup.append(el('div', { class: 'form-row' }, [
    el('button', { class: 'btn', onclick: async () => { const nome = await exportarBackup(estado); if (nome) toast(`Exportado: ${nome}`); } }, '⭳ Exportar backup (.json)'),
    el('button', { class: 'btn ghost', onclick: async () => {
      const novo = await importarBackup();
      if (novo) { estado = novo; await persistir(); toast('Backup importado!'); }
    } }, '⭱ Importar backup'),
  ]));
  v.append(backup);
}
```

**O que faz.** O card de backup: mostra onde o `dados.json` está salvo no
disco (assíncrono — ver abaixo), e dois botões que chamam `exportarBackup`/
`importarBackup` (ver `storage.explicado.md`).

**Conceito por trás — esqueleto síncrono, patch assíncrono.**
`renderConfig` inteira é síncrona, como toda entrada da tabela de despacho
do roteador (Parte 1: `render()` chama `{...}[tabAtual](v)` sem `await`) —
mas `localDados()` é `async` (lê algo do disco/IPC). A solução: desenhar o
card **já** com o texto provisório `'Carregando local...'`, e quando a
`Promise` resolver (`.then(...)`), corrigir só o `textContent` daquele
elemento específico — sem transformar `renderConfig` inteira em `async`, o
que quebraria a suposição do roteador de que toda entrada da tabela de
despacho é síncrona (um `render()` que precisasse de `await` teria que
mudar toda a cadeia de chamadas, incluindo `persistir()`).

**Armadilha evitada — `if (novo) { estado = novo; ... }`.** `importarBackup`
(ver `storage.explicado.md`) devolve `null` se o usuário cancelar o diálogo
de arquivo. Sem o `if`, cancelar a importação sobrescreveria `estado` com
`null` e o app quebraria na próxima leitura. A guarda garante que só uma
importação **bem-sucedida** substitui o estado.

---

## Bloco 9 — `contasPropriasEditor`: chips com regra de negócio embutida no comentário

```js
// Um Pix seu para você mesmo (BTG -> Sicredi) não é ganho nem gasto. Estes textos
// (seu CPF, seu nome) marcam o lançamento como transferência, fora dos totais.
function contasPropriasEditor() {
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, 'Minhas contas (transferências entre elas)'));
  wrap.append(el('p', { class: 'muted' }, 'Se a descrição do extrato contiver um destes textos (seu CPF ou seu nome), o lançamento vira "Transferência" — registrado, mas fora de entradas e saídas. Sem isso, mandar dinheiro de um banco seu para outro apareceria como ganho E como gasto.'));
```

**O que faz.** Cabeçalho do editor de "contas próprias": uma lista de textos
(CPF, nome) que, quando aparecem na descrição de um lançamento importado,
fazem ele virar `'transferencia'` em vez de entrada/saída.

**Conceito por trás — por que "meu próprio Pix" precisa de tratamento
especial.** Sem essa marcação, transferir dinheiro entre duas contas suas
(por exemplo, do BTG para o Sicredi) apareceria **duas vezes** nos totais:
uma saída no banco de origem e uma entrada no de destino — inflando tanto
"quanto ganhei" quanto "quanto gastei" por um movimento que, do ponto de
vista financeiro, não mudou nada (o dinheiro continua seu). Ver Fluxo 4/5 de
`FLUXOGRAMA.md` e `importar.explicado.md` para onde essa reclassificação
acontece de fato (`C.prepararImportacao`) — esta função é só o formulário
que **alimenta** a lista usada lá.

```js
  const lista = estado.config.contasProprias || [];
  if (lista.length) {
    wrap.append(el('div', { class: 'chips' }, lista.map((item) => el('span', { class: 'chip' }, [
      item,
      el('button', { title: 'Remover', onclick: async () => {
        estado = { ...estado, config: { ...estado.config, contasProprias: lista.filter((x) => x !== item) } };
        await persistir();
      } }, '✕'),
    ]))));
  }
```

**Sintaxe — atualização imutável de dois níveis aninhados.**
`{ ...estado, config: { ...estado.config, contasProprias: [...] } }` clona
o objeto `estado` inteiro, mas **dentro** dele também clona `config` (para
não mutar o `config` original por referência) e só troca o campo
`contasProprias`. É o padrão de "spread aninhado" que se repete em todo
editor de Config deste arquivo: sempre que uma mutação mexe num campo
dentro de `estado.config`, os dois níveis (`estado` e `estado.config`)
precisam ser copiados, não só o de fora.

```js
  const inp = el('input', { type: 'text', placeholder: 'seu CPF ou seu nome' });
  const add = el('button', { class: 'btn', onclick: async () => {
    const val = inp.value.trim();
    if (!val || lista.includes(val)) return;
    estado = { ...estado, config: { ...estado.config, contasProprias: [...lista, val] } };
    await persistir(); toast('Adicionado');
  } }, '+ Adicionar');
  wrap.append(el('div', { class: 'form-row' }, [field('CPF ou nome', inp), el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add])]));
  return wrap;
}
```

**Armadilha evitada — `lista.includes(val)`.** Adicionar o mesmo texto duas
vezes não geraria erro nenhum tecnicamente, mas criaria uma entrada
duplicada sem utilidade (o `.filter` de remoção continuaria funcionando,
mas o chip apareceria repetido na lista). A checagem de duplicata evita essa
poluição silenciosa antes mesmo de chamar `persistir()`.

---

## Bloco 10 — `regrasEditor`: o motor de `regras.js` visto pela Config

```js
// Regras de categorização: o que faz a importação (e o campo Descrição) acertarem.
function regrasEditor() {
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, 'Regras de categorização'));
  wrap.append(el('p', { class: 'muted' }, 'Quando a descrição contiver o texto da regra, o Finan já preenche a categoria. Vale na importação do extrato e no campo Descrição ao lançar.'));

  const minhas = estado.config.regras || [];
  if (minhas.length) {
    wrap.append(el('div', { class: 'chips' }, minhas.map((r) => el('span', { class: 'chip' }, [
      `"${r.padrao}" → ${r.categoria}`,
      el('button', { title: 'Remover', onclick: async () => {
        estado = C.removerRegra(estado, r.padrao); await persistir();
      } }, '✕'),
    ]))));
  }
```

**O que faz.** Lista as regras já cadastradas (`estado.config.regras`),
uma chip por regra, mostrando o padrão e a categoria de destino
(`"zaffari" → Mercado`).

**Como faz — diferente de `contasPropriasEditor`/`chipsEditor` (que mutam
`estado.config` diretamente com spread), a remoção aqui chama `C.removerRegra`,
uma operação do núcleo.** Regras têm uma estrutura mais rica (padrão +
categoria + classificação) e são consumidas por `regras.js` (o motor de
`categorizar`, ver `regras.explicado.md`) — por isso a mutação passa pelo
núcleo em vez de um spread manual na UI: a lógica de "como uma regra é
removida corretamente" mora num lugar só, reaproveitável por qualquer outra
tela que precise mexer em regras no futuro.

```js
  const padrao = el('input', { type: 'text', placeholder: 'ex.: zaffari' });
  const cat = opts(el('select'), estado.config.categorias);
  const cls = opts(el('select'), ['', ...estado.config.classificacoes]);
  const add = el('button', { class: 'btn', onclick: async () => {
    const p = padrao.value.trim();
    if (!p) return toast('Escreva o texto que aparece no extrato.');
    estado = C.adicionarRegra(estado, { padrao: p, categoria: cat.value, classificacao: cls.value });
    await persistir(); toast('Regra criada');
  } }, '+ Criar regra');
  wrap.append(el('div', { class: 'form-row' }, [
    field('Se a descrição contiver', padrao), field('Categoria', cat), field('Classificação', cls),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add]),
  ]));
  wrap.append(el('div', { class: 'muted' }, `${C.REGRAS_PADRAO.length} regras já vêm prontas (iFood, posto, mercado, farmácia, Uber…).`));
  return wrap;
}
```

**Sintaxe — `opts(el('select'), ['', ...estado.config.classificacoes])`.** O
`<select>` de classificação ganha uma opção vazia (`''`) na frente da lista
real, via spread — permitindo "nenhuma classificação" como escolha válida
(uma regra pode só definir categoria, sem opinar sobre essencial/não
essencial).

**Conceito por trás — `C.REGRAS_PADRAO.length` no rodapé.** A linha final
não é decorativa: ela informa que existem regras **pré-cadastradas** que não
aparecem nesta lista de chips (que só mostra `estado.config.regras`, as
regras que o **usuário** criou ou que nasceram de uma revisão em lote — ver
Fluxo 5 de `FLUXOGRAMA.md`). `REGRAS_PADRAO` (ver `regras.explicado.md`) é
uma lista fixa embutida no núcleo, sempre ativa, e este texto existe só para
o usuário não estranhar "por que o Finan já categorizou isso sozinho" sem
ele ter cadastrado nada.

---

## Bloco 11 — `chipsEditor`: uma função genérica para duas seções via propriedade computada

```js
function chipsEditor(titulo, chave) {
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, titulo));
  const chips = el('div', { class: 'chips' }, estado.config[chave].map((item) => el('span', { class: 'chip' }, [
    item,
    el('button', { title: 'Remover', onclick: async () => {
      estado = { ...estado, config: { ...estado.config, [chave]: estado.config[chave].filter((x) => x !== item) } };
      await persistir();
    } }, '✕'),
  ])));
  wrap.append(chips);
  const inp = el('input', { type: 'text', placeholder: `nova ${titulo.toLowerCase()}` });
  const add = el('button', { class: 'btn', onclick: async () => {
    const val = inp.value.trim();
    if (!val || estado.config[chave].includes(val)) return;
    estado = { ...estado, config: { ...estado.config, [chave]: [...estado.config[chave], val] } };
    await persistir();
  } }, '+ Adicionar');
  wrap.append(el('div', { class: 'form-row' }, [field('Nova', inp), el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add])]));
  return wrap;
}
```

**O que faz.** Uma única função que serve **duas** seções quase idênticas do
Config — "Categorias" e "Formas de pagamento" (ver as duas chamadas no
Bloco 8: `chipsEditor('Categorias', 'categorias')` e
`chipsEditor('Formas de pagamento', 'formasPagamento')`).

**Sintaxe — `estado.config[chave]` e `[chave]: [...]`: acesso e escrita por
propriedade computada.** `chave` é uma string (`'categorias'` ou
`'formasPagamento'`), passada como parâmetro. `estado.config[chave]` lê a
propriedade certa dinamicamente (equivalente a `estado.config.categorias`
quando `chave === 'categorias'`); `{ [chave]: [...] }` (colchetes dentro de
um literal de objeto) **escreve** numa propriedade cujo nome só é conhecido
em tempo de execução — sem essa sintaxe, seria preciso escrever a função
duas vezes, uma para cada campo, ou usar um `if (chave === 'categorias')
... else ...` por dentro.

**Conceito por trás — por que este editor genérico não usa `C.algumaOperacao`
como `regrasEditor`.** Categorias e formas de pagamento são só **listas de
string simples** (sem estrutura interna como padrão/categoria/classificação
das regras) — a mutação (`filter`/`spread`) é trivial o bastante para não
justificar uma função dedicada no núcleo só para "adicionar item a uma
lista de strings dentro de config". Compare com `regrasEditor`: a
diferença de estrutura de dado (string simples vs. objeto com campos) é o
que decide se a mutação vale a pena subir para o núcleo ou pode ficar
inline na UI.

---

## Bloco 12 — `init()`: o boot do app inteiro

```js
// ---------- init ----------
async function init() {
  estado = await carregarEstado();
  const meses = C.mesesComMovimento(estado);
  if (meses.length) mesAtual = meses[meses.length - 1];
```

**O que faz.** As três primeiras linhas de `init` fazem o trabalho mais
importante da função inteira: carregam o estado persistido do disco
(`carregarEstado`, ver `storage.explicado.md` — que por sua vez, no Fluxo 1
de `FLUXOGRAMA.md`, passa por `preload.js` → IPC → `main.js` → `C.carregar`)
e escolhem o mês inicial.

**Como faz — o mês inicial é o último com movimento, não o mês-calendário de
hoje.** `C.mesesComMovimento(estado)` (ver `calculos.explicado.md`, Bloco 1)
devolve os meses ordenados; `meses[meses.length - 1]` é o último — o mês
mais recente em que **existe algum dado**. Se você abrir o app depois de um
mês inteiro sem lançar nada, ele não te recebe com uma tela zerada de
"hoje": ele abre no último mês em que você de fato mexeu nas finanças, que é
onde os dados interessantes estão.

**Conceito por trás — por que `mesAtual` (variável de módulo, Parte 1) só é
sobrescrita aqui condicionalmente (`if (meses.length)`).** Ela já nasce
inicializada com o mês-calendário de hoje (`let mesAtual = new
Date().toISOString().slice(0, 7);`, Parte 1) — essa continua sendo a
escolha correta para um app **recém-instalado**, sem nenhum dado ainda
(`meses.length === 0`). O `if` aqui é a única correção necessária: "se
existir histórico, prefira o mês mais recente do histórico ao mês
calendário atual".

```js
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tabAtual = b.dataset.tab;
    [...$('#tabs').children].forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('#mesSelect').addEventListener('change', (e) => { mesAtual = e.target.value; render(); });

  atualizarTopo();
  render();
}

init();
```

**O que faz.** Prende os dois únicos listeners de "chrome fixo" do app
inteiro — clique numa aba, troca de mês — e desenha a tela pela primeira
vez (`atualizarTopo()` seguido de `render()`, sem passar por `persistir()`,
porque nada precisa ser salvo no boot).

**Conceito por trás — por que os listeners do cabeçalho são registrados
**uma vez só**, aqui, e nunca dentro de `render()`.** Isso fecha um fio que
atravessa o documento inteiro desde a Parte 1: `#tabs` e `#mesSelect` vivem
**fora** de `#view` (ver `index.html.explicado.md`, Bloco 1), então
**nunca** são destruídos/recriados por `render()` (que só reescreve
`v.innerHTML`, dentro de `#view`). Se estivessem dentro de `#view`, cada
`render()` destruiria o elemento antigo (e seu listener junto) e um
listener novo teria que ser preso a cada troca de tela — exatamente o
problema que o design "chrome fora de `#view`" evita. `init()` é o único
lugar do arquivo onde isso precisa acontecer, porque é o único momento em
que `#tabs`/`#mesSelect` são criados (pelo HTML) e ainda não têm handler
nenhum.

**Sintaxe — `e.target.closest('button[data-tab]')`.** O clique pode
acontecer num filho do botão (por exemplo, o `<i class="badge">` de
contagem dentro do botão "Revisar", ver `index.html.explicado.md`, Bloco 1)
— `e.target` seria esse filho, não o `<button>`. `.closest(seletor)` sobe
pela árvore do DOM a partir de `e.target` até achar o ancestral mais
próximo que bate com o seletor (incluindo o próprio elemento, se ele já
bater) — aqui, o `<button data-tab="...">` mais próximo. Isso significa que
o badge não precisa de handler de clique próprio: cliques nele "vazam" para
o botão que o contém, e `.closest` resolve isso sem lógica extra.

**`[...$('#tabs').children].forEach((x) => x.classList.toggle('active', x === b))`
— o padrão "desmarcar todos, marcar só o certo" via comparação de
referência.** `$('#tabs').children` é uma `HTMLCollection` (não um array —
não tem `.forEach` nativo); o spread `[...]` a converte para array comum.
Depois, para **cada** botão da barra, `classList.toggle('active', x === b)`
decide se aquele botão específico deve ou não ter a classe `active`
comparando **identidade de objeto** (`x === b`, o mesmo elemento DOM que
recebeu o clique) — não por texto ou índice. É um idioma que se repete
sempre que uma seleção precisa alternar "só um de vários" (compare com o
mesmo padrão manual em `renderImportar`, Parte 4, ao trocar de aba
programaticamente).

**`init();` solto no fim do arquivo, sem esperar `DOMContentLoaded`.** Não
precisa: o `<script type="module">` está no fim do `<body>` **e** scripts de
módulo já são adiados (`defer`) por padrão pelo próprio navegador (ver
`index.html.explicado.md`, Bloco 2) — quando este código roda,
`#tabs`/`#mesSelect`/`#view` já existem na árvore do DOM. Chamar `init()`
direto, sem embrulhar em `document.addEventListener('DOMContentLoaded', ...)`,
é seguro neste contexto específico — mas **só** porque as duas condições
acima (módulo + posição no `<body>`) se sustentam. Fecha o Fluxo 1 de
`FLUXOGRAMA.md`: depois desta linha, o app está de pé — qualquer interação
seguinte passa pelo roteador `render()` (Parte 1) ou pelo ritual
`persistir()` (idem), nunca mais por `init()`.

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Formatação humana fica na UI, não no núcleo** | `prazoLegivel` | núcleo devolve fato (meses); UI decide como fraseá-lo, com plural correto |
| **`== null` como exceção consciente a `===`** | `cardMeta` | idioma consagrado para "ausente, em qualquer das duas formas" |
| **Fábrica DRY replicada em duas camadas** | `meta()` (núcleo) e `cardMeta` (UI) | mesma disciplina — não repita a forma — aplicada a dado e a DOM |
| **Optional chaining em cadeia (`?.`)** | `estado.config?.metas?.rendaComponentes` | evita `TypeError` em estado ainda incompleto, sem `if` aninhado |
| **Cópia defensiva antes de editar** | `comps = (...).map((c) => ({ ...c }))` | edição na UI nunca muta `estado` por referência |
| **Atualização imutável de item por índice** | `comps.map((x, j) => j === i ? novo : x)` | gera lista nova em vez de `comps[i].campo = valor` |
| **Fração interna, percentual na tela** | `taxaAnual`/`dividendosYield` | núcleo multiplica direto; UI converte `×100`/`÷100` nas duas pontas |
| **Submissão atômica vs. campo a campo** | premissas (botão) vs. renda (blur por item) | campos interdependentes preferem um só commit |
| **Spread aninhado em dois níveis** | editores de Config | `{ ...estado, config: { ...estado.config, campo: novo } }` |
| **Mutação inline (spread) vs. mutação via núcleo** | `chipsEditor`/`contasPropriasEditor` vs. `regrasEditor` | decide pela complexidade estrutural do dado (string simples vs. objeto com campos) |
| **Propriedade computada (`[chave]`)** | `chipsEditor` | mesma função lê/escreve campos diferentes de `config` a partir de uma string |
| **Chrome fora de `#view`, listener uma vez só** | `init()` | `#tabs`/`#mesSelect` nunca são recriados por `render()` — handler preso uma única vez na vida do app |
| **`.closest()` para clique em filho** | `init()` | sobe a árvore do DOM até achar o `button[data-tab]` mais próximo |
| **Comparação por identidade de objeto** | `x === b` no toggle de aba ativa | "desmarcar todos, marcar só o clicado" sem depender de texto/índice |
| **Mês inicial = último com movimento** | `init()` | evita abrir numa tela vazia quando o mês calendário não tem dado ainda |

---

**Anterior:** [`app.parte6.explicado.md`](./app.parte6.explicado.md) — Planejar e Reservas.
**Fim das partes.** Volte ao índice: [`app.explicado.md`](./app.explicado.md).
