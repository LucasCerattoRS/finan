# `src/ui/app.js` — Parte 6: Planejar e Reservas

> **O que é esta parte:** duas telas independentes — linhas 699–816
> (`renderPlanejar`, orçamento por categoria) e 818–925 (`renderReservas`,
> reserva de emergência) — linhas 699–931 no total.
>
> **Papel na arquitetura.** Ambas seguem o mesmo molde das partes anteriores
> (KPIs no topo, tabela no meio, formulário embaixo), mas cada uma expõe um
> detalhe de tradução **negócio → interface** que vale a pena estudar de
> perto: `renderPlanejar` mostra uma guarda "nada mudou, não regrave";
> `renderReservas` mostra a UI traduzindo um "ledger com sinal" (a forma que
> o núcleo prefere) para dois botões com nome humano ("Guardar"/"Resgatar").
>
> **Pré-requisitos:** [`app.parte1.explicado.md`](./app.parte1.explicado.md)
> (helpers `el`/`field`/`kpi`/`persistir`), [`planejamento.explicado.md`](./planejamento.explicado.md)
> (`planejamentoDoMes`), [`reserva.explicado.md`](./reserva.explicado.md)
> (`resumoReserva`, o conceito de *earmark*) e o Fluxo 6 de
> [`FLUXOGRAMA.md`](./FLUXOGRAMA.md) (guardar reserva → "disponível" muda).

---

## `renderPlanejar` — orçamento do mês (estimado × real)

```js
// ---------- Planejar (orçamento do mês: estimado x real) ----------
// Era a aba "Planejamento PM": você diz quanto pretende gastar por categoria e o
// app mostra ao lado quanto REALMENTE saiu (parcelas do cartão incluídas).
// "Repetir" leva o orçamento deste mês para os outros meses do ano.
function renderPlanejar(v) {
  const p = C.planejamentoDoMes(estado, mesAtual);
  v.append(el('h2', {}, `Planejar — ${C.rotuloMes(mesAtual)}`));

  // resumo: orçado x gasto x quanto ainda cabe
  const estourou = p.totalEstimado > 0 && p.totalReal > p.totalEstimado;
  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Orçado', fmt(p.totalEstimado)),
    kpi('Gasto até agora', fmt(p.totalReal), estourou ? 'neg' : ''),
    kpi(p.diferenca >= 0 ? 'Ainda cabe' : 'Acima do orçado', fmt(Math.abs(p.diferenca)),
      p.diferenca >= 0 ? 'pos' : 'neg'),
  ]));
```

**O que faz.** Lê o orçamento já pronto do mês (`C.planejamentoDoMes`, ver
`planejamento.explicado.md`) e monta três KPIs de resumo: total orçado, total
já gasto, e a diferença — cujo **rótulo muda** conforme o sinal (`'Ainda
cabe'` vs. `'Acima do orçado'`), não só a cor.

**Sintaxe — rótulo condicional, não só classe condicional.** Repare que o
terceiro `kpi(...)` não usa um texto fixo com cor variável; o próprio
**texto do label** muda: `p.diferenca >= 0 ? 'Ainda cabe' : 'Acima do
orçado'`. É um passo a mais de cuidado com a leitura humana — "Acima do
orçado: R$ 50" comunica o estouro de orçamento de forma mais direta do que
"Ainda cabe: -R$ 50", que exigiria o usuário interpretar um número negativo.

**Conceito por trás — `Math.abs(p.diferenca)`.** O **valor** exibido é
sempre positivo (`Math.abs`); é o **rótulo** e a **cor** (`'pos'`/`'neg'`)
que carregam o sinal. Separar "quanto" (sempre um número positivo, mais
fácil de ler) de "para que lado" (rótulo + cor) é um padrão de apresentação
que se repete no arquivo (compare com `difCell` mais abaixo, que também
escolhe o sinal no texto — `resta ${fmt(...)}` vs. `−${fmt(-...)}` — em vez
de mostrar um número negativo cru).

```js
  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, 'Orçamento por categoria'));
  card.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'Digite quanto pretende gastar em cada categoria. O "Real" soma o que já saiu no mês (parcelas do cartão incluídas). Deixe em branco (ou 0) para tirar a meta.'));

  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, [
    el('th', {}, 'Categoria'),
    el('th', { class: 'num' }, 'Estimado'),
    el('th', { class: 'num' }, 'Real'),
    el('th', { class: 'num' }, 'Diferença'),
    el('th', {}, ''),
  ])));
  const tbody = el('tbody');
```

**O que faz.** Monta o `card` da tabela de orçamento, o texto de instrução
e o cabeçalho da tabela (`<thead>`) com as cinco colunas.

**Sintaxe — array de definições de coluna, montado com `el('th', ...)`
diretamente (sem `.map`, ao contrário do cabeçalho de Cartões na Parte 5).**
Aqui cada `<th>` é escrito à mão, um por um, porque duas colunas (`Estimado`,
`Real`, `Diferença`) precisam da classe `num` (alinhamento à direita) e as
outras duas não — o `.map` genérico da Parte 5 só compensa quando todas as
colunas recebem o mesmo tratamento; aqui a diferença por coluna torna mais
simples escrever cada `<th>` explicitamente.

```js
  const linhaCategoria = (item) => {
    const inp = el('input', {
      type: 'number', step: '0.01', min: '0', class: 'num-input', placeholder: '0,00',
      ...(item.estimado ? { value: item.estimado.toFixed(2) } : {}),
    });
    const salvar = async () => {
      const val = Number(inp.value) || 0;
      if (val === (item.estimado || 0)) return; // nada mudou: não regrava nem re-renderiza
      estado = C.definirPlanejamento(estado, { mes: mesAtual, categoria: item.categoria, estimado: val });
      await persistir();
      toast(val > 0 ? `${item.categoria}: meta ${fmt(val)}` : `Meta de ${item.categoria} removida`);
    };
    inp.addEventListener('blur', salvar);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
```

**O que faz.** Para cada linha da tabela (uma categoria), cria um input de
valor estimado que salva automaticamente quando perde o foco (`blur`) ou
quando o usuário aperta Enter.

**Sintaxe — `inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); })`.**
Em vez de duplicar a lógica de salvar dentro do handler de `keydown`, apertar
Enter só **força um blur** — o que já dispara o handler de `blur` que faz o
trabalho de verdade. É reaproveitar um evento existente em vez de escrever a
mesma ação duas vezes.

**Armadilha evitada — a guarda `if (val === (item.estimado || 0)) return;`.**
Sem esta linha, todo `blur` do campo (mesmo sem o usuário ter digitado nada —
por exemplo, clicar no campo e depois apertar Tab) chamaria
`C.definirPlanejamento` e `persistir()`, gravando o disco e reconstruindo a
tela inteira (`render()`, dentro de `persistir`) por um "não-evento". Como
`render()` destrói e recria todo o `#view` (ver Parte 1), essa reconstrução
à toa faria a tela **piscar** e o input perder o foco a cada Tab acidental.
A comparação `val === (item.estimado || 0)` intercepta exatamente o caso
"nada mudou" antes de disparar qualquer efeito colateral.

**Conceito por trás — por que esta guarda não existe em `renderLancar`
(Parte 3)?** Lá, todo input **precisa** de um clique explícito em "Lançar"
para salvar — não há salvamento automático em `blur`. Aqui, cada campo se
salva sozinho ao perder o foco, o que é mais conveniente (edita e passa pro
próximo, sem botão), mas introduz o risco de disparos espúrios que essa
tela em particular precisa neutralizar. É o preço de trocar "salvar
explícito" por "salvar implícito": ganha-se fluidez, perde-se a garantia de
que todo `blur` representa uma intenção real — e o código compensa isso
com uma verificação extra.

```js
    const pct = item.estimado > 0
      ? Math.min(item.real / item.estimado, 1) * 100
      : (item.real > 0 ? 100 : 0);
    const acima = item.estimado > 0 ? item.real > item.estimado : item.real > 0;
    const barra = el('div', { class: `bar bar-orc ${acima ? 'over' : ''}` }, el('i', { style: `width:${pct}%` }));

    const difCell = item.estimado > 0
      ? el('span', { class: `amount ${item.diferenca >= 0 ? 'in' : 'out'}` },
        item.diferenca >= 0 ? `resta ${fmt(item.diferenca)}` : `−${fmt(-item.diferenca)}`)
      : (item.real > 0 ? el('span', { class: 'tag warn' }, 'sem meta') : el('span', { class: 'muted' }, '—'));
```

**O que faz.** Calcula a barra de progresso (`pct`, sempre capada em 100% —
`Math.min(..., 1)` — mesmo se o gasto passar do orçamento, porque a barra
visual não tem como "passar de 100%" de forma legível) e o conteúdo da
célula de diferença, que tem **três variações**, não duas: dentro do
orçamento (`resta R$ X`), estourado (`−R$ X`) e **sem meta definida** (`'sem
meta'`, uma tag de aviso, só quando há gasto real sem orçamento
correspondente).

**Conceito por trás — "sem meta" não é o mesmo que "zero".** Uma categoria
sem orçamento e sem gasto mostra `—` (nada a dizer); uma categoria sem
orçamento **mas com gasto** mostra a tag de aviso `'sem meta'`. Essa
distinção existe porque "gastei em uma categoria que nem me preocupei em
orçar" é informação útil por si só — é o motivo pelo qual
`planejamentoDoMes` (ver `planejamento.explicado.md`) inclui categorias sem
estimado na lista, em vez de mostrar só o que foi planejado.

```js
    return el('tr', {}, [
      el('td', {}, [el('div', {}, item.categoria), el('div', { style: 'margin-top:6px' }, barra)]),
      el('td', { class: 'num' }, inp),
      el('td', { class: 'num' }, item.real > 0 ? el('span', { class: 'amount out' }, fmt(item.real)) : el('span', { class: 'muted' }, fmt(0))),
      el('td', { class: 'num' }, difCell),
      el('td', {}, item.estimado > 0
        ? el('button', { class: 'btn danger', title: 'Tirar meta', onclick: async () => {
          estado = C.removerPlanejamento(estado, mesAtual, item.categoria);
          await persistir(); toast('Meta removida');
        } }, '✕')
        : ''),
    ]);
  };
```

**O que faz.** Fecha `linhaCategoria`: monta a `<tr>` inteira — célula de
categoria (com a barra de progresso logo abaixo do nome), o input editável,
a coluna "Real", a célula de diferença (`difCell`, já calculada acima) e,
por último, um botão "✕" para remover a meta — mas **só se houver meta**
(`item.estimado > 0`); sem meta definida, a célula fica com uma string
vazia `''` no lugar do botão.

**Conceito por trás — remover meta ≠ remover categoria.** O botão "Tirar
meta" chama `C.removerPlanejamento`, que apaga só a estimativa daquela
categoria naquele mês — a categoria em si continua existindo em
`estado.config.categorias` e a linha reaparece na tabela (sem meta, só com
o "Real", se houver gasto) na próxima renderização. É coerente com a régua
de `difCell` vista acima: "sem meta" é um estado válido e comum, não um
erro a esconder.

```js
  if (!p.itens.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Nenhuma meta e nenhum gasto neste mês ainda. Defina uma meta abaixo.')));
  } else {
    for (const item of p.itens) tbody.append(linhaCategoria(item));
    tbody.append(el('tr', { class: 'total-row' }, [
      el('td', {}, el('strong', {}, 'Total')),
      el('td', { class: 'num' }, el('strong', {}, fmt(p.totalEstimado))),
      el('td', { class: 'num' }, el('strong', {}, fmt(p.totalReal))),
      el('td', { class: 'num' }, el('strong', { class: `amount ${p.diferenca >= 0 ? 'in' : 'out'}` }, fmt(p.diferenca))),
      el('td', {}, ''),
    ]));
  }
```

**O que faz.** Desenha uma linha por categoria e, só se houver ao menos uma,
uma linha de total no rodapé da tabela (`.total-row`, negrito).

**Sintaxe — `''` como filho de `el`.** O último `el('td', {}, '')` é uma
célula vazia (sem botão de remover — a linha de total não é editável). Vale
lembrar do helper `el` (Parte 1): `[].concat(children)` trata tanto um
array quanto um valor único, e `String('')` vira um nó de texto vazio —
não gera erro, só uma célula sem conteúdo visível.

```js
  table.append(tbody);
  card.append(el('div', { class: 'table-wrap' }, table));
```

**O que faz.** Encaixa o `tbody` (já preenchido, linha a linha ou com a
linha vazia) dentro do `table`, e o `table` dentro de um `div.table-wrap` —
o mesmo padrão de "envelope com scroll horizontal" usado nas outras tabelas
do app (ver Parte 5, Cartões), necessário porque a tabela tem 5 colunas e
pode não caber em telas estreitas.

```js
  // definir meta para uma categoria que ainda não está na tabela
  const naTabela = new Set(p.itens.map((i) => i.categoria));
  const disponiveis = estado.config.categorias.filter((c) => !naTabela.has(c));
  const catSel = opts(el('select'), disponiveis.length ? disponiveis : estado.config.categorias);
```

**O que faz.** O `<select>` de "adicionar meta para categoria nova" só lista
categorias que **ainda não aparecem** na tabela acima — não faz sentido
oferecer "Mercado" no dropdown se "Mercado" já tem uma linha editável logo
ali em cima.

**Armadilha evitada — `disponiveis.length ? disponiveis : estado.config.categorias`.**
Se **todas** as categorias já estão na tabela (`disponiveis` vazio), o
`<select>` cairia vazio e o botão "+ Definir meta" ficaria quebrado (nenhuma
opção pra escolher). O fallback devolve a lista completa nesse caso — melhor
permitir redefinir uma meta que já existe do que mostrar um formulário sem
opções.

```js
  const valNova = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00' });
  const addBtn = el('button', { class: 'btn', onclick: async () => {
    const val = Number(valNova.value) || 0;
    if (val <= 0) return toast('Informe o valor da meta.');
    estado = C.definirPlanejamento(estado, { mes: mesAtual, categoria: catSel.value, estimado: val });
    await persistir(); toast(`${catSel.value}: meta ${fmt(val)}`);
  } }, '+ Definir meta');
  card.append(el('div', { class: 'form-row' }, [
    field('Categoria', catSel), field('Estimado', valNova),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), addBtn]),
  ]));
  v.append(card);
```

**O que faz.** Fecha o formulário de "nova meta": input de valor, botão que
valida (`val <= 0` bloqueia com um toast) e chama `C.definirPlanejamento`
com a categoria escolhida no `<select>` construído no bloco anterior, e por
fim `v.append(card)` — só agora o card inteiro (tabela + formulário) entra
de fato na tela.

**Sintaxe — `return toast(...)` dentro do `onclick`.** `toast(...)` não
devolve nada útil (é só um efeito colateral de UI); usar `return` na frente
dele é um atalho estilístico para "mostra o aviso **e** sai da função
imediatamente", equivalente a escrever `toast(...); return;` em duas linhas
— o valor de retorno em si é descartado (o `onclick` não usa o que a função
devolve).

```js
  // repetir o orçamento deste mês para os outros meses do mesmo ano
  if (p.itens.some((i) => i.planejado)) {
    const ano = mesAtual.slice(0, 4);
    const outros = [];
    for (let m = 1; m <= 12; m += 1) {
      const mm = `${ano}-${String(m).padStart(2, '0')}`;
      if (mm !== mesAtual) outros.push(mm);
    }
    const rep = el('div', { class: 'card' });
    rep.append(el('h3', {}, 'Repetir orçamento'));
    rep.append(el('p', { class: 'muted' }, `Copia as metas de ${C.rotuloMes(mesAtual)} para os outros meses de ${ano} (substitui as metas das mesmas categorias nesses meses; não mexe nas outras).`));
    rep.append(el('button', { class: 'btn ghost', onclick: async () => {
      estado = C.repetirPlanejamento(estado, mesAtual, outros);
      await persistir(); toast(`Orçamento repetido para ${ano}`);
    } }, `↻ Repetir para os demais meses de ${ano}`));
    v.append(rep);
  }
}
```

**O que faz.** Se houver **ao menos uma** categoria com meta definida
(`p.itens.some((i) => i.planejado)`), desenha um card extra com um botão que
copia todas as metas do mês atual para os outros 11 meses do mesmo ano.

**Conceito por trás — seção condicional que desaparece por inteiro.** Se
nenhuma meta foi definida ainda, este card **não existe** no DOM — não é um
botão desabilitado, é a seção inteira ausente. Um botão "Repetir" sem nada
para repetir seria um convite a clicar em algo que não faz nada; omitir a
seção inteira é mais honesto sobre o estado atual da tela. Compare com o
padrão inverso em `renderMetas` (Parte 7), onde cards sempre aparecem mas com
valores zerados — a escolha de "esconder vs. zerar" depende de se um valor
zerado ainda é informação útil (metas financeiras: sim, mostra "zero") ou se
a ação em si não faz sentido sem dado (repetir orçamento: não, esconde o
botão).

---

## `renderReservas` — reserva de emergência

```js
// ---------- Reservas (reserva de emergência: a aba "Reservas PM") ----------
// Guardar dinheiro é um EARMARK sobre o que já está em conta, não um gasto: por
// isso "Disponível para gastar" = dinheiro em conta − reserva acumulada. Valor
// negativo é resgate (usou a reserva). A meta é em meses de gasto médio.
function renderReservas(v) {
  const ano = mesAtual.slice(0, 4);
  const r = C.resumoReserva(estado, ano);
  v.append(el('h2', {}, `Reserva de emergência — ${ano}`));

  // acumulado x disponível para gastar x meta
  v.append(el('div', { class: 'grid-kpi' }, [
    kpi('Reserva acumulada', fmt(r.total), r.total >= 0 ? 'pos' : 'neg',
      r.noAno !== r.total ? `${fmt(r.noAno)} guardados em ${ano}` : null),
    kpi('Disponível para gastar', fmt(r.disponivel), r.disponivel >= 0 ? '' : 'neg',
      'dinheiro em conta − reserva'),
    kpi(r.metaMeses ? `Meta (${r.metaMeses} meses)` : 'Meta', r.metaMeses ? fmt(r.meta) : '—',
      '', r.metaMeses ? `gasto médio ${fmt(r.gastoMedio)}/mês` : 'defina abaixo'),
  ]));
```

**O que faz.** Três KPIs: o total já acumulado na reserva (com rodapé
condicional mostrando quanto disso foi guardado **este ano específico**), o
"disponível para gastar" (o número que materializa o conceito de earmark:
dinheiro em conta menos o que já tem dono na reserva), e a meta em meses de
gasto (com rodapé explicando o cálculo).

**Sintaxe — `r.noAno !== r.total ? ... : null` como rodapé condicional.** O
rodapé "`X guardados em {ano}`" só aparece quando o valor do ano **difere**
do total acumulado — ou seja, quando existe histórico de anos anteriores.
Se `noAno === total` (a reserva inteira foi guardada este ano — por exemplo,
o primeiro ano de uso do app), o rodapé desapareceria mostrando a mesma
informação duas vezes ("Reserva: R$ 1000" e "R$ 1000 guardados em 2026" logo
abaixo seria redundante); a comparação evita essa repetição visual.

**Conceito por trás — o "disponível" é a materialização do earmark na tela.**
`r.disponivel` já vem calculado como `dinheiroEmConta(estado) - reservaAcumulada`
(ver `reserva.explicado.md`, `resumoReserva`) — a UI só mostra o número e o
rodapé fixo `'dinheiro em conta − reserva'` **explicando a fórmula em texto**,
diretamente ao lado do valor. É uma escolha didática: em vez de exigir que o
usuário abra a documentação para entender por que "disponível" é menor que
"em conta", a própria interface expõe a conta.

```js
  // progresso rumo à meta (chegar a 100% é bom: barra sempre verde)
  if (r.metaMeses > 0) {
    const pct = Math.round(r.progresso * 100);
    const card = el('div', { class: 'card' });
    card.append(el('h3', {}, 'Progresso da meta'));
    card.append(el('div', { class: 'bar bar-orc', style: 'max-width:none' }, el('i', { style: `width:${pct}%` })));
    card.append(el('p', { class: 'muted', style: 'margin:8px 0 0' },
      r.faltam > 0
        ? `${pct}% — faltam ${fmt(r.faltam)} para ${r.metaMeses} ${r.metaMeses === 1 ? 'mês' : 'meses'} de gasto.`
        : `Meta atingida: você tem ${r.metaMeses}+ meses de gasto guardados. 🎉`));
    v.append(card);
  }
```

**O que faz.** Card de progresso da meta — só existe se `metaMeses > 0`
(mesma disciplina de "seção que desaparece se não faz sentido" do
Planejar). A frase de status também tem duas variações: "faltam X" ou "meta
atingida", nunca as duas ao mesmo tempo.

**Comentário do código — "chegar a 100% é bom: barra sempre verde".** Vale
notar como comentário de negócio: diferente da barra de orçamento
(`bar-orc.over` fica vermelha ao **estourar** 100%, Bloco anterior), aqui
100% é a meta **desejada**, então a mesma classe CSS `bar-orc` nunca recebe
o modificador `over` — é usado apenas como reaproveitamento visual (mesma
barra, cor base), não como "estourou algo ruim".

```js
  // guardar ou resgatar no mês selecionado no topo
  const form = el('div', { class: 'card' });
  form.append(el('h3', {}, 'Guardar ou resgatar'));
  const tipoSel = opts(el('select'), ['Guardar', 'Resgatar']);
  const valInp = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00' });
  const obsInp = el('input', { type: 'text', placeholder: 'observação (opcional)' });
  const registrar = async () => {
    const val = Number(valInp.value) || 0;
    if (val <= 0) { toast('Informe um valor maior que zero.'); return; }
    const sinal = tipoSel.value === 'Resgatar' ? -1 : 1;
    estado = C.registrarReserva(estado, { mes: mesAtual, valor: sinal * val, obs: obsInp.value.trim() });
    await persistir();
    toast(sinal > 0 ? `Guardado ${fmt(val)}` : `Resgatado ${fmt(val)}`);
  };
```

**O que faz.** O formulário que registra um movimento na reserva. O usuário
escolhe "Guardar" ou "Resgatar" e digita um valor **sempre positivo**
(`min: '0'`); a função traduz essa escolha em sinal antes de chamar o
núcleo.

**Conceito por trás — o ledger com sinal é vocabulário de núcleo, não de
humano.** `reserva.js` (ver `reserva.explicado.md`) representa cada
movimento como um único campo `valor` que pode ser positivo (aporte) ou
negativo (resgate) — um "razão contábil" clássico, elegante para somar
(`reservaAcumulada` é só um `reduce` de soma). Mas ninguém, ao usar o app,
pensa "vou registrar -500" — pensa "vou resgatar 500". A linha
`const sinal = tipoSel.value === 'Resgatar' ? -1 : 1;` é exatamente a
**fronteira de tradução**: do lado do núcleo, um número com sinal; do lado
do humano, duas palavras (Guardar/Resgatar) e um valor sempre positivo. Cada
camada otimizada para seu público — o núcleo para a soma ficar trivial, a UI
para a pessoa não ter que fazer aritmética mental com negativos.

**Sintaxe — `valInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') registrar(); });`.**
O mesmo idioma "Enter dispara a ação principal sem precisar do mouse" da
Parte 3 (Lançar), reaproveitado aqui num formulário de uma linha só.

```js
  valInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') registrar(); });
  form.append(el('div', { class: 'form-row' }, [
    field('Ação', tipoSel), field('Valor', valInp), field('Observação', obsInp),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: registrar }, '+ Registrar')]),
  ]));
  form.append(el('p', { class: 'muted', style: 'margin:8px 0 0' },
    `O movimento entra em ${C.rotuloMes(mesAtual)}. Guardar não conta como gasto — é dinheiro separado, que sai do "disponível".`));
  v.append(form);
```

**O que faz.** Fecha o card "Guardar ou resgatar": monta a linha do
formulário (`form-row`) com os três campos e o botão, acrescenta um aviso
fixo lembrando que o movimento é lançado no **mês selecionado no topo**
(`mesAtual`, não necessariamente o mês corrente do calendário) e só então
anexa o card inteiro na tela (`v.append(form)`).

**Conceito por trás — o aviso escrito por extenso em vez de confiar no
usuário perceber sozinho.** O texto `O movimento entra em ${C.rotuloMes(mesAtual)}`
existe porque a tela de Reservas **não tem** um seletor de mês próprio — ela
usa o mesmo `mesAtual` do topo do app (ver Parte 1). Sem esse aviso, seria
fácil o usuário trocar o mês no topo para conferir outro período, esquecer
que trocou, e registrar um aporte no mês errado sem perceber. Repare também
que o aviso reforça o conceito de earmark: "não conta como gasto" evita que
o usuário pense que guardar dinheiro na reserva vai aparecer como uma
despesa no orçamento (Parte 6, `renderPlanejar`) ou no dashboard (Parte 2).

```js
  // histórico de movimentos (mais recentes primeiro)
  const movs = [...(estado.reservas || [])].sort((a, b) => (
    (b.mes || '').localeCompare(a.mes || '') || (b.criadoEm || '').localeCompare(a.criadoEm || '')
  ));
```

**Sintaxe — `||` encadeando dois critérios de ordenação (desempate).**
`localeCompare` devolve `0` quando as strings são iguais — e `0` é falsy em
JS. Então `(b.mes).localeCompare(a.mes) || (b.criadoEm).localeCompare(a.criadoEm)`
lê como "ordene por mês; **se empatar** (mesmo mês, resultado `0`), ordene
pelo instante de criação". É o idioma padrão de JavaScript para "sort com
critério de desempate", sem precisar de um `if` explícito dentro do
comparador.

**Como faz — `[...(estado.reservas || [])]` antes de ordenar.** `.sort()`
**muta o array original** — sem o spread `[...]`, `estado.reservas` (que é
parte do `estado` do módulo) seria reordenado por referência, uma mutação
direta do estado global fora do ritual de `persistir()`. Copiar antes de
ordenar é a mesma disciplina de "cópia defensiva" que reaparece na Parte 7
(`comps.map((c) => ({ ...c }))`) — nunca mutar uma estrutura que vive dentro
de `estado` sem passar por `estado = C.algumaOperacao(...)`.

```js
  const lista = el('div', { class: 'card' });
  lista.append(el('h3', {}, 'Movimentos'));
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, [
    el('th', {}, 'Mês'), el('th', {}, 'Ação'),
    el('th', { class: 'num' }, 'Valor'), el('th', {}, 'Observação'), el('th', {}, ''),
  ])));
```

**O que faz.** Cria o card "Movimentos" com sua tabela e cabeçalho — cinco
colunas: mês, ação (Guardou/Resgatou), valor, observação livre e uma
coluna vazia reservada para o botão de remover.

**Sintaxe — dois `el('th', ...)` na mesma linha, separados por vírgula.**
Puramente estético: como nenhuma dessas duas colunas (`Mês`, `Ação`) leva
classe `num`, o autor optou por compactar em uma linha só, enquanto as
colunas com `class: 'num'` (que carregam um atributo a mais) ficam cada
uma na sua própria linha logo abaixo — não muda o comportamento, só a
legibilidade do código-fonte.

```js
  const tbody = el('tbody');
  if (!movs.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Nenhum movimento ainda. Guarde seu primeiro aporte acima.')));
  } else {
    for (const m of movs) {
      const aporte = m.valor >= 0;
      tbody.append(el('tr', {}, [
        el('td', {}, C.rotuloMes(m.mes)),
        el('td', {}, el('span', { class: `amount ${aporte ? 'in' : 'out'}` }, aporte ? 'Guardou' : 'Resgatou')),
        el('td', { class: 'num' }, el('span', { class: `amount ${aporte ? 'in' : 'out'}` }, `${aporte ? '' : '−'}${fmt(Math.abs(m.valor))}`)),
        el('td', {}, m.obs ? m.obs : el('span', { class: 'muted' }, '—')),
        el('td', {}, el('button', { class: 'btn danger', title: 'Remover', onclick: async () => {
          estado = C.removerReserva(estado, m.id);
          await persistir(); toast('Movimento removido');
        } }, '✕')),
      ]));
    }
    tbody.append(el('tr', { class: 'total-row' }, [
      el('td', {}, el('strong', {}, 'Acumulado')), el('td', {}, ''),
      el('td', { class: 'num' }, el('strong', {}, fmt(r.total))), el('td', {}, ''), el('td', {}, ''),
    ]));
  }
```

**O que faz.** A tabela de histórico traduz, de volta, o sinal cru de cada
movimento (`m.valor`) para o vocabulário humano da tela: `aporte =
m.valor >= 0` decide entre "Guardou"/"Resgatou" e entre mostrar o valor sem
sinal (aporte) ou com um `−` explícito na frente (resgate,
`Math.abs(m.valor)` desfaz o sinal negativo interno para não mostrar `−
−500`).

**Conceito por trás — a mesma tradução do formulário, espelhada na
leitura.** O par "sinal interno ↔ palavra humana" aparece **duas vezes**
nesta função: uma vez na escrita (`registrar`, sinal a partir da escolha do
`<select>`) e uma vez na leitura (aqui, palavra a partir do sinal). É a
prova de que a fronteira de tradução é **bidirecional** — sempre que o
núcleo guarda algo em formato compacto/matemático, a UI precisa de duas
funções de conversão, não uma: uma para escrever, outra para exibir.

```js
  table.append(tbody);
  lista.append(el('div', { class: 'table-wrap' }, table));
  v.append(lista);
```

**O que faz.** Fecha o card "Movimentos": encaixa o `tbody` no `table`, o
`table` no `table-wrap` (mesmo envelope de scroll horizontal visto em
Cartões e em Planejar) e por fim anexa o card inteiro na tela.

```js
  // meta em meses de gasto médio (6 é a recomendação clássica)
  const metaCard = el('div', { class: 'card' });
  metaCard.append(el('h3', {}, 'Meta da reserva'));
  metaCard.append(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    'Quantos meses de gasto você quer ter guardados. A recomendação clássica é 6 meses. O valor-alvo é essa quantidade × seu gasto médio mensal.'));
  const metaInp = el('input', { type: 'number', step: '1', min: '0', value: String(r.metaMeses) });
  metaCard.append(el('div', { class: 'form-row' }, [
    field('Meses de gasto', metaInp),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), el('button', { class: 'btn', onclick: async () => {
      const meses = Math.max(0, Math.round(Number(metaInp.value) || 0));
      estado = C.definirMetaReserva(estado, meses);
      await persistir(); toast(meses > 0 ? `Meta: ${meses} ${meses === 1 ? 'mês' : 'meses'}` : 'Meta removida');
    } }, 'Salvar meta')]),
  ]));
  v.append(metaCard);
}
```

**O que faz.** Formulário de uma linha para definir a meta em meses de gasto
médio (usada no card de progresso, acima).

**Sintaxe — `Math.max(0, Math.round(Number(metaInp.value) || 0))`.** Três
camadas de saneamento encadeadas: `Number(...)` converte texto para número
(`NaN` se inválido); `|| 0` troca `NaN`/vazio por zero; `Math.round` garante
um inteiro (meses fracionados não fazem sentido); `Math.max(0, ...)` barra
negativos (digitar `-3` não deveria gerar uma "meta negativa"). É a mesma
disciplina de "nunca confie no que o input devolve cru" vista em toda parte
do arquivo, aqui com todas as camadas visíveis numa linha só.

```js
// ---------- Metas (calculadora: reserva, liberdade financeira, viver de dividendos) ----------
// A partir da renda mensal (componentes) e do patrimônio investido (informado à mão — o app
// é offline e não puxa cotação), mostra o alvo de cada meta, quanto falta e o prazo ao seu
// ritmo de aporte. Toda edição persiste e re-renderiza (persistir()), então não guardo estado
// local: cada tela lê o config atual.
```

**O que faz.** Este é o comentário de cabeçalho da **próxima** seção do
arquivo (a tela de Metas, coberta em detalhe na
[Parte 7](./app.parte7.explicado.md)) — mas como cai exatamente na linha
931, a última do intervalo desta parte, ele fecha o Planejar/Reservas por
aqui. Vale registrá-lo porque já entrega o contexto de negócio da próxima
tela: as metas (reserva, liberdade financeira, viver de dividendos) partem
de dois números que o usuário informa à mão — renda mensal e patrimônio
investido — porque o app é **offline** e não tem como consultar cotação de
mercado sozinho.

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Rótulo condicional, não só cor** | `renderPlanejar` (KPI de diferença) | o texto muda ("Ainda cabe"/"Acima do orçado"), não só a classe CSS |
| **Guarda "nada mudou" antes de gravar** | `linhaCategoria.salvar` | evita disco + `render()` completo por um `blur` sem edição real |
| **Salvamento implícito vs. explícito** | Planejar (blur) vs. Lançar (botão) | mais fluidez custa uma guarda extra contra disparo espúrio |
| **Três estados de uma célula, não dois** | `difCell` | dentro do orçamento / estourado / sem meta definida — cada um com seu visual |
| **Seção condicional que desaparece** | "Repetir orçamento", "Progresso da meta" | esconder a seção inteira quando a ação não faz sentido, em vez de desabilitar |
| **Earmark na tela** | `renderReservas` (KPI "Disponível") | `dinheiroEmConta − reservaAcumulada`, com a fórmula escrita ao lado do número |
| **Tradução bidirecional sinal ↔ palavra humana** | `registrar` (escrita) e a tabela de histórico (leitura) | núcleo guarda com sinal; UI converte nos dois sentidos |
| **Cópia antes de `.sort()`** | histórico de reservas | `[...(estado.reservas \|\| [])]` evita mutar o array de `estado` por referência |
| **`\|\|` para desempate em comparador** | `.sort` do histórico | `0` (empate) é falsy; cai no segundo critério automaticamente |
| **Saneamento em camadas de input numérico** | meta da reserva | `Number` → `\|\| 0` → `Math.round` → `Math.max(0, ...)`, cada camada barra um jeito de dar errado |

---

**Anterior:** [`app.parte5.explicado.md`](./app.parte5.explicado.md) — Cartões.
**Próxima:** [`app.parte7.explicado.md`](./app.parte7.explicado.md) — Metas, Config e o boot (`init`).
