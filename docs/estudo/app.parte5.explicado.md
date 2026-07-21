# `src/ui/app.js` — Parte 5: Cartões (`renderCartoes`)

> **O que é esta parte:** a tela "Cartões" — linhas 612–698 de `src/ui/app.js`.
> Uma única função, `renderCartoes(v)`, que desenha quatro cards empilhados:
> as faturas do mês corrente (com botão de pagamento), as próximas faturas a
> vencer (com botão de adiantamento), o cadastro de cartões, e a lista de
> parcelas em aberto.
>
> **Papel na arquitetura.** Esta tela não introduz regra de negócio nova — ela
> é, de ponta a ponta, **composição** do que outras camadas já calculam:
> `C.faturasDoMes`/`C.proximasFaturas` (`faturasPagas.js`), `C.todasParcelas`
> (`parcelas.js`), e dois helpers da Parte 2 (`linhaFatura`, `linhaAdiantar`)
> que já resolvem "como desenhar uma fatura". O valor desta parte do estudo
> está mais em **reconhecer os idiomas repetidos** (tabela + formulário de
> adicionar + botão remover com closure) do que em lógica inédita.
>
> **Pré-requisitos:** [`app.parte1.explicado.md`](./app.parte1.explicado.md)
> (helper `el`, `persistir`, `field`), [`app.parte2.explicado.md`](./app.parte2.explicado.md)
> (`linhaFatura`/`linhaAdiantar`, de onde vem o idioma "inputs + botão que
> fecha sobre eles"), e [`faturasPagas.explicado.md`](./faturasPagas.explicado.md) +
> [`parcelas.explicado.md`](./parcelas.explicado.md) (de onde vêm os dados que
> esta tela só exibe).

---

## Bloco 1 — cabeçalho e as faturas do mês corrente

```js
function renderCartoes(v) {
  v.append(el('h2', {}, 'Cartões'));

  // 1) faturas do mês, com pagamento
  const faturas = C.faturasDoMes(estado, mesAtual).filter((f) => f.total > 0);
  const cardFat = el('div', { class: 'card' });
  cardFat.append(el('h3', {}, `Faturas de ${C.rotuloMes(mesAtual)}`));
  if (faturas.length) faturas.forEach((f) => cardFat.append(linhaFatura(f, true)));
  else cardFat.append(el('div', { class: 'empty' }, 'Nenhuma fatura fecha neste mês.'));
  v.append(cardFat);
```

**O que faz.** Busca a fatura de **cada cartão cadastrado** no mês selecionado
(`C.faturasDoMes` devolve um item por cartão, mesmo que zerado — ver
`faturasPagas.explicado.md`), descarta as que não têm valor (`f.total > 0`,
cartão sem compra naquele mês) e desenha uma linha por fatura restante via
`linhaFatura(f, true)` — o `true` habilita o formulário de "Registrar
pagamento" dentro da linha (Parte 2).

**Sintaxe — o padrão "card vazio explícito".** `if (faturas.length) ... else
...` aparece dezenas de vezes no arquivo: em vez de deixar um card sem
conteúdo (que pareceria um bug de carregamento), o `else` sempre desenha uma
mensagem `.empty` explicando por que está vazio. É um pequeno cuidado de UX
que se repete tão consistentemente que vale nomear como convenção do arquivo.

**Conceito por trás — esta tela não sabe calcular fatura nenhuma.**
`renderCartoes` nunca soma parcela, nunca decide se uma fatura está quitada:
tudo isso já vem pronto em `f.total`, `f.pago`, `f.progresso`, `f.quitada`
(campos de `resumoFatura`, ver `faturasPagas.explicado.md`). A função só
**arruma** esses objetos na tela. Essa separação — núcleo decide "quanto",
UI decide "onde/como mostrar" — é a mesma fronteira já vista em `calculos.js`
e reafirmada aqui.

---

## Bloco 2 — próximas faturas: onde se adianta

```js
  // 2) próximas faturas — é aqui que se adianta
  const proximas = C.proximasFaturas(estado, C.somaMeses(mesAtual, 1), 12)
    .filter((f) => !f.quitada);
  const cardProx = el('div', { class: 'card' });
  cardProx.append(el('h3', {}, 'Próximas faturas'));
  if (proximas.length) {
    const futuro = proximas.reduce((a, f) => a + f.restante, 0);
    cardProx.append(el('p', { class: 'muted' }, `${fmt(futuro)} comprometidos daqui pra frente. Adiantar uma fatura registra que você já pagou — o valor sai do comprometido futuro. (O dinheiro saindo da conta aparece sozinho quando você importar o extrato; o app não lança gasto em dobro.)`));
    proximas.forEach((f) => cardProx.append(linhaAdiantar(f)));
  } else {
    cardProx.append(el('div', { class: 'empty' }, 'Nenhuma fatura em aberto daqui pra frente.'));
  }
  v.append(cardProx);
```

**O que faz.** Lista as faturas que **ainda vão vencer**, a partir do mês
seguinte, com o total ainda comprometido (`futuro`) e um botão de adiantamento
por fatura (`linhaAdiantar`, Parte 2).

**Como faz — por que `C.somaMeses(mesAtual, 1)` e não `mesAtual`.** A fatura
do mês corrente já tem seu próprio card acima (Bloco 1, via
`faturasDoMes`). Se esta lista começasse em `mesAtual`, a mesma fatura
apareceria **duas vezes** na tela — uma vez como "a pagar agora", outra como
"a vencer em breve". Somar 1 mês fecha essa janela exatamente onde a outra
termina, sem sobreposição e sem buraco.

**Sintaxe — template string de três cláusulas condicionais encadeadas.** A
frase de aviso (`` `${fmt(futuro)} comprometidos...` ``) embute duas
condicionais dentro do próprio template:
`${f.restante > 0 ? ... : ''}${f.adiantado > 0 ? ... : ''}` em `linhaFatura`
(Parte 2) é o mesmo idioma — mas aqui, o texto fixo já teve o cuidado de
**explicar o modelo mental** ("o valor sai do comprometido futuro", "o
dinheiro... aparece sozinho quando você importar") diretamente na interface.
É a UI ensinando, em uma frase, a mesma distinção que
`comprometidoFuturo` documenta em `calculos.explicado.md` (Bloco 4):
comprometido ≠ gasto.

**Conceito por trás — por que "adiantar" existe como ação separada de
"lançar uma saída".** Registrar um pagamento de fatura antecipado não cria
uma transação de saída (isso só acontece quando o extrato real é importado,
mais tarde) — ele só abate o `restante` daquela fatura, via
`C.registrarPagamentoFatura` (dentro de `linhaAdiantar`/`linhaFatura`, Parte
2). Se "adiantar" também lançasse uma saída, o mesmo pagamento apareceria
**duas vezes** quando o extrato do banco fosse importado — a mesma armadilha
de dupla contagem que a convenção temporal de `calculos.js` evita para
parcelas, aqui evitada para pagamentos de fatura.

---

## Bloco 3 — cadastro de cartões: tabela + formulário + remover

```js
  // 3) cadastro
  const wrap = el('div', { class: 'card' });
  wrap.append(el('h3', {}, 'Meus cartões'));
  const table = el('table');
  table.append(el('thead', {}, el('tr', {}, ['Nome', 'Fechamento', 'Vencimento', ''].map((c) => el('th', {}, c)))));
  const tbody = el('tbody');
  if (!estado.cartoes.length) tbody.append(el('tr', {}, el('td', { colspan: 4, class: 'empty' }, 'Nenhum cartão cadastrado.')));
  for (const c of estado.cartoes) {
    tbody.append(el('tr', {}, [
      el('td', {}, c.nome), el('td', {}, `dia ${c.fechamento}`), el('td', {}, `dia ${c.vencimento}`),
      el('td', {}, el('button', { class: 'btn danger', onclick: async () => {
        estado = C.removerCartao(estado, c.id); await persistir(); toast('Cartão removido');
      } }, '✕')),
    ]));
  }
  table.append(tbody);
  wrap.append(el('div', { class: 'table-wrap' }, table));
```

**O que faz.** Desenha a tabela de cartões cadastrados, cada linha com um
botão "✕" que remove aquele cartão específico.

**Sintaxe — `['Nome', 'Fechamento', 'Vencimento', ''].map((c) => el('th', {}, c))`.**
Constrói o cabeçalho da tabela a partir de um array de rótulos, em vez de
escrever quatro `el('th', ...)` um por um. A última string vazia (`''`)
gera um `<th>` sem texto — a coluna do botão de remover não precisa de
título.

**Como faz — o closure que carrega `c.id`.** O `onclick` do botão "✕" é
criado **dentro** do `for (const c of estado.cartoes)`, então cada botão
fecha sobre o `c` daquela iteração específica — clicar no botão da linha do
Sicredi remove o Sicredi, não o próximo cartão da lista. Este é o mesmo
idioma "crie um handler que fecha sobre os dados daquela linha" já visto em
`linhaFatura`/`linhaAdiantar` e reforçado na Parte 3 (Lançar) — a UI inteira
é construída assim: nunca há um único handler genérico que precisa
redescobrir "qual linha foi clicada" via DOM; o dado certo já está capturado
por closure no momento da criação.

```js
  const nome = el('input', { type: 'text', placeholder: 'Ex.: Sicredi' });
  const fech = el('input', { type: 'number', min: '1', max: '31', value: '25' });
  const venc = el('input', { type: 'number', min: '1', max: '31', value: '10' });
  const add = el('button', { class: 'btn', onclick: async () => {
    if (!nome.value.trim()) return toast('Dê um nome ao cartão.');
    estado = C.adicionarCartao(estado, {
      nome: nome.value.trim(),
      fechamento: Number(fech.value) || 1,
      vencimento: Number(venc.value) || 1,
    });
    await persistir(); toast('Cartão adicionado');
  } }, '+ Adicionar cartão');
  wrap.append(el('div', { class: 'form-row' }, [
    field('Nome', nome), field('Fechamento (dia)', fech), field('Vencimento (dia)', venc),
    el('div', { class: 'field' }, [el('span', { html: '&nbsp;' }), add]),
  ]));
  v.append(wrap);
```

**O que faz.** O formulário de cadastro: três inputs (nome, dia de
fechamento, dia de vencimento) e um botão que lê os três por closure e chama
`C.adicionarCartao`.

**Sintaxe — os valores-padrão `value: '25'`/`value: '10'`.** Os inputs de
fechamento/vencimento já nascem preenchidos com valores plausíveis (dia 25 e
dia 10), não vazios. É uma escolha de UX: a maioria dos cartões brasileiros
tem fechamento perto do fim do mês e vencimento no começo do mês seguinte —
o formulário já sugere o caso comum, e quem tem um cartão diferente só
substitui os números.

**Armadilha evitada — `Number(fech.value) || 1`.** Se o campo estiver vazio
ou o usuário digitar algo não-numérico, `Number(...)` devolve `NaN`, que é
falsy — o `|| 1` garante que o cartão nunca seja salvo com um dia de
fechamento inválido (`NaN` quebraria qualquer conta de `mesPrimeiraFatura`
em `faturas.js` mais adiante). É a mesma guarda defensiva de "valor numérico
vindo de input nunca é confiável sozinho" usada em todo o arquivo.

**Elemento espaçador — `el('span', { html: '&nbsp;' })`.** O botão "+
Adicionar cartão" precisa ficar alinhado, na mesma linha, com os campos que
têm rótulo (`field('Nome', ...)` etc.). Como o botão não tem `<label>`, este
`<span>` com um espaço não-quebrável ocupa o lugar do rótulo ausente, só
para manter o alinhamento vertical do CSS de `.field` (ver
`app.css.explicado.md`). É o único uso de `html:` no arquivo inteiro além
deste mesmo idioma repetido em outros formulários — sempre com o literal
fixo `'&nbsp;'`, nunca com dado do usuário (ver a observação sobre XSS na
Parte 1).

---

## Bloco 4 — parcelas em aberto (antiga aba solta)

```js
  // 4) parcelas (era uma aba solta; é detalhe de cartão)
  const todas = C.todasParcelas(estado).sort((a, b) => (a.mesFatura < b.mesFatura ? -1 : 1));
  const cardParc = el('div', { class: 'card' });
  cardParc.append(el('h3', {}, `Parcelas em aberto (${todas.length})`));
  const t2 = el('table');
  t2.append(el('thead', {}, el('tr', {}, ['Fatura', 'Cartão', 'Descrição', 'Parcela', 'Valor'].map((c) => el('th', c === 'Valor' ? { class: 'num' } : {}, c)))));
  const tb2 = el('tbody');
  if (!todas.length) tb2.append(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Nenhuma parcela — lance uma compra no cartão.')));
  for (const p of todas) {
    tb2.append(el('tr', { class: p.mesFatura === mesAtual ? 'destaque-linha' : '' }, [
      el('td', {}, C.rotuloMes(p.mesFatura)),
      el('td', {}, nomeCartao(p.cartaoId)),
      el('td', {}, p.descricao || p.categoria),
      el('td', {}, `${p.n}/${p.de}`),
      el('td', { class: 'num' }, fmt(p.valor)),
    ]));
  }
  t2.append(tb2);
  cardParc.append(el('div', { class: 'table-wrap' }, t2));
  v.append(cardParc);
}
```

**O que faz.** Lista **todas** as parcelas em aberto de todos os cartões,
ordenadas por mês de fatura, com a parcela do mês atual destacada
visualmente.

**Como faz — `C.todasParcelas(estado)` explode compras em parcelas, ao
vivo.** Nenhuma parcela está gravada em `dados.json` (ver Fluxo 3 de
`FLUXOGRAMA.md` — "derive, don't store"): `todasParcelas` recalcula, a cada
chamada de `renderCartoes`, a lista completa a partir das transações do tipo
`'cartao'`. Isso significa que esta tabela está sempre consistente com o que
foi lançado — não existe risco de "parcela desatualizada" porque não existe
parcela guardada para desatualizar.

**Sintaxe — comparador de string em `.sort`.** `(a, b) => (a.mesFatura < b.mesFatura ? -1 : 1)`
é um comparador manual escrito por extenso, em vez do atalho
`a.mesFatura.localeCompare(b.mesFatura)` ou da subtração usada em
`gastoPorCategoria` (`calculos.explicado.md`, Bloco 7). Funciona porque
`mesFatura` é sempre `"YYYY-MM"` (comparação lexicográfica de string coincide
com ordem cronológica — o mesmo motivo do `.sort()` sem argumento em
`mesesComMovimento`). Repare que este comparador **não trata igualdade**:
se `a.mesFatura === b.mesFatura`, a expressão cai no `: 1` — do ponto de vista
de corretude seria mais preciso devolver `0`, mas como o `sort` só precisa de
"ordem relativa estável o suficiente para exibição" (não para uma chave de
busca binária), o atalho não causa bug visível.

**Conceito por trás — `.destaque-linha` como "isto pesa agora".** A condição
`p.mesFatura === mesAtual ? 'destaque-linha' : ''` é puramente visual (ver
`app.css.explicado.md`) mas resolve um problema real de leitura: numa lista
que pode ter dezenas de parcelas futuras (uma compra em 12x aparece 12
vezes, uma em cada mês), destacar só a parcela do mês selecionado no topo da
tela ajuda o olho a achar "o que sai da minha conta este mês" sem precisar
ler a coluna "Fatura" linha por linha.

**Armadilha — `p.descricao || p.categoria`.** Nem toda parcela tem uma
descrição própria (depende de como a transação original foi lançada); quando
falta, a categoria da compra serve de rótulo alternativo — a coluna nunca
fica vazia, mesmo para lançamentos mais antigos ou menos detalhados.

---

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Card vazio explícito** | Blocos 1, 2, 3, 4 | `if (lista.length) ... else` sempre com mensagem `.empty`, nunca card em branco |
| **UI só exibe, núcleo já calculou** | Bloco 1 | `f.total`/`f.pago`/`f.quitada` vêm prontos de `faturasPagas.js` |
| **Janela de tempo sem sobreposição** | Bloco 2 | `somaMeses(mesAtual, 1)` evita mostrar a mesma fatura duas vezes |
| **Adiantar ≠ lançar saída** | Bloco 2 | pagamento antecipado só abate `restante`; a saída real nasce da importação |
| **Closure carrega o dado da linha** | Bloco 3 | cada botão "✕"/handler já sabe qual `c`/`f`/`p` é seu, sem redescobrir via DOM |
| **Guarda `\|\| valorPadrão` em input numérico** | Bloco 3 | `Number(fech.value) \|\| 1` nunca deixa `NaN` chegar ao núcleo |
| **Espaçador `&nbsp;` para alinhar botão sem rótulo** | Bloco 3 | único uso de `html:` fora de texto do usuário |
| **Derive, don't store (parcelas)** | Bloco 4 | `todasParcelas` recalcula a cada render; nada fica desatualizado |
| **Comparador de string por ordem lexicográfica** | Bloco 4 | `"YYYY-MM"` ordena certo como texto, sem `localeCompare` |
| **Destaque visual = pista de leitura** | Bloco 4 | `.destaque-linha` marca "isto pesa no mês selecionado" numa lista longa |

---

**Anterior:** [`app.parte4.explicado.md`](./app.parte4.explicado.md) — Importar e Revisar.
**Próxima:** [`app.parte6.explicado.md`](./app.parte6.explicado.md) — Planejar e Reservas.
