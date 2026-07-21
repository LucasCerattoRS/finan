# Exercícios de revisão

> Perguntas organizadas por área, básico → avançado. Tente responder **antes**
> de abrir a resposta (clique em "Resposta" pra revelar) — o valor do
> exercício está em errar e descobrir o porquê, não em ler a resposta direto.
> Todas têm base em código real do projeto; quando fizer sentido, a resposta
> aponta pro arquivo/`.explicado.md` de onde tirar mais detalhe.

---

## A. Modelo e dinheiro

**A1 (básico).** O que `mesDe('2026-02-16')` devolve? E por que extrair o mês
fatiando a string por posição fixa (`slice(0, 7)`) — algo em geral frágil com
datas — é seguro **neste** projeto?

<details><summary>Resposta</summary>

Devolve `'2026-02'`. É seguro porque o app padroniza **toda** data como ISO
`"YYYY-MM-DD"`, um formato de largura fixa: as posições 0–6 são sempre
ano-mês. O formato foi escolhido também por outra propriedade: com o zero à
esquerda, a ordem **alfabética** das strings é a ordem **cronológica** — por
isso um simples `.sort()` ordena meses corretamente no projeto inteiro. Ver
[`model.explicado.md`](./model.explicado.md).
</details>

**A2 (básico).** `paraCentavos(19.9)` calcula `19.9 × 100` — que, em float
binário, dá `1989.9999999999998`, não `1990`. Por que a função ainda devolve
exatamente `1990`? E o que aconteceria se ela usasse `Math.trunc` em vez de
`Math.round`?

<details><summary>Resposta</summary>

Porque `Math.round` arredonda para o **inteiro mais próximo**, absorvendo o
erro minúsculo que o float introduz na multiplicação. Com `Math.trunc` (que
só corta a parte decimal), `1989.9999…` viraria `1989` — cada conversão
poderia roubar 1 centavo, e o app inteiro depende dessa fronteira
reais→centavos ser exata. É o motivo de `paraCentavos` usar `round` e não
truncamento. Ver [`model.explicado.md`](./model.explicado.md).
</details>

**A3 (básico).** Por que o app guarda valores em **centavos** (inteiro) em vez
de reais (número decimal)?

<details><summary>Resposta</summary>

Números de ponto flutuante não representam frações decimais exatamente
(`0.1 + 0.2 !== 0.3` em JavaScript). Somando dinheiro repetidamente em reais,
esses erros se acumulam. Convertendo pra centavos (inteiro) na entrada,
somando em inteiro, e só convertendo de volta pra reais na saída, a
aritmética nunca sai do território seguro de precisão inteira. Ver
[`model.explicado.md`](./model.explicado.md).
</details>

**A4 (básico).** O que `migrar()` faz, e por que **toda** leitura de
`dados.json` passa por ela, mesmo quando o dado já está no formato mais
recente?

<details><summary>Resposta</summary>

`migrar()` recebe o objeto bruto lido do disco e devolve um estado completo e
válido — preenchendo campos que não existiam em versões antigas do app com
seus valores-padrão. Ela roda sempre (não só quando detecta uma versão
antiga) porque é mais simples e seguro ter **um único caminho** de validação
do que dois (um para "dado velho" e outro para "dado já atual", que
divergiriam com o tempo). Ver [`model.explicado.md`](./model.explicado.md).
</details>

**A5 (intermediário).** Um `dados.json` tem um campo que a versão *atual* do
código não reconhece (por exemplo, de uma versão futura, ou um experimento).
Depois de `migrar()` processar e o app salvar de novo, o que acontece com
esse campo?

<details><summary>Resposta</summary>

Ele **sobrevive**. `migrar()` espalha (`...bruto`) o objeto lido *antes* de
sobrescrever os campos que conhece com seus defaults — então qualquer campo
extra passa direto. Esta foi uma correção real feita no projeto (sessão 9 do
`PLANO.md`): antes, o código reconstruía o estado a partir de uma lista fixa
de campos conhecidos, e qualquer coisa fora dessa lista era descartada
silenciosamente na primeira gravação.
</details>

**A6 (avançado).** Você precisa adicionar um novo campo `estado.limites`
(lista de limites de gasto por categoria), com valor padrão `[]`. Isso exige
incrementar `schemaVersion`?

<details><summary>Resposta</summary>

Não necessariamente. `schemaVersion` existe pra marcar mudanças que exigem
uma transformação real do dado antigo (renomear um campo, mudar o formato de
algo que já existia). Um campo **novo e aditivo**, com um default seguro
(`estado.limites || []`), não quebra a leitura de dado antigo — ele só passa
a existir a partir de agora. É exatamente o padrão já usado para
`planejamentos` e `reservas`, nenhum dos quais bumpou o schema.
</details>

---

## B. Cartão (faturas e parcelas)

**B1 (básico).** Uma compra de R$ 100 é feita no dia 20, em 1 parcela só, num
cartão que fecha dia 25 e vence dia 10. Em qual mês essa compra vira saída?

<details><summary>Resposta</summary>

Dia 20 é **antes** do fechamento (dia 25), então cai na fatura do **mês
seguinte** ao da compra (regra: `dia ≤ fechamento → +1 mês`). Se a compra foi
em julho, a fatura é a de agosto.
</details>

**B2 (básico).** Por que uma parcela **nunca** aparece como um registro
gravado dentro de `dados.json`?

<details><summary>Resposta</summary>

Porque parcelas são **derivadas**, não armazenadas: `parcelasDaTransacao`
recalcula a divisão toda vez que alguém precisa saber quais parcelas existem,
a partir da transação original (que é o único registro persistido). Isso
evita ter duas fontes de verdade (a transação e "as parcelas dela") que
poderiam divergir.
</details>

**B3 (intermediário).** Uma compra de R$ 100,00 em 3 parcelas. Quais os
valores exatos das 3 parcelas, e por que a soma fecha certinho em R$ 100,00?

<details><summary>Resposta</summary>

`10000 centavos ÷ 3 = 3333,33...` — `Math.floor` dá `3333` centavos por
parcela-base; sobra `10000 - 3333*3 = 1` centavo, que é somado **só na
última** parcela. Resultado: R$ 33,33 + R$ 33,33 + R$ 33,34 = R$ 100,00
exatos. Sem esse resíduo direcionado, ou a soma ficaria 1 centavo curta, ou
seria preciso um arredondamento mais complexo em cada parcela.
</details>

**B4 (intermediário).** O banco informa que a fatura de julho foi de
**R$ 0,00** (print incompleto/tela vazia), mas existem R$ 600 em parcelas
reais caindo nesse mês. **Antes** da correção documentada na sessão 12 do
`PLANO.md`, o que a tela mostrava? E **depois**?

<details><summary>Resposta</summary>

Antes: `totalFatura` dava preferência ao valor informado sempre que ele fosse
um número finito — e `0` é finito. A fatura virava **R$ 0,00** e, por
`proximasFaturas` filtrar `total > 0`, **sumia da lista** inteiramente
(parecendo que não havia fatura nenhuma naquele mês). Depois: o código passou
a exigir `informado > 0` pra ele vencer — com `0`, o cálculo cai de volta pra
soma das parcelas (R$ 600), e a fatura volta a aparecer.
</details>

**B5 (avançado).** Por que a regra ficou "informado só vence quando `> 0`" e
não simplesmente "quando existe" (por exemplo, checando `!== null`)?

<details><summary>Resposta</summary>

Porque `0` **é** um valor existente (não é `null`/`undefined`) mas, na
prática de uso do app, significa "o print estava vazio/incompleto", não
"o banco confirmou que você não deve nada". Tratar presença (`!== null`)
como sinal de confiança teria o mesmo bug (0 vencendo indevidamente); o que
resolve é distinguir "informado e maior que zero" (confiável) de "informado
como zero" (sendo provavelmente um dado ausente, não uma fatura zerada de
verdade).
</details>

---

## C. Importação e regras

**C1 (básico).** Qual a diferença entre um grupo **nomeado** e um
**anônimo** na tela Revisar?

<details><summary>Resposta</summary>

Nomeado: o extrato diz **quem** é a contraparte (ex.: "Pix enviado - João
Silva"). Anônimo: o extrato só diz o mecanismo, sem nome (ex.: "PAGAMENTO
PIX", sem indicar quem recebeu) — comum em extratos de 2023–2025.
</details>

**C2 (intermediário).** Por que categorizar um grupo **anônimo** nunca cria
uma regra automática (mesmo que você categorize vários deles do mesmo
jeito)?

<details><summary>Resposta</summary>

Porque não há garantia de que "PIX SICREDI" de hoje seja pro mesmo destino
que "PIX SICREDI" de amanhã — sem nome, é só o mecanismo de pagamento, não
uma contraparte identificável. Criar uma regra a partir disso carimbaria
**todo** Pix futuro sem nome com a mesma categoria, o que na maioria das
vezes estaria errado.
</details>

**C3 (intermediário).** O parser de CSV recebe `"1.234,56"` numa linha e
`"1,234.56"` noutra (mesma coluna, arquivos diferentes). Como ele decide qual
é formato brasileiro e qual é americano, sem nenhuma configuração explícita
de "formato do banco X"?

<details><summary>Resposta</summary>

Olhando **qual separador aparece por último** na string. Em `"1.234,56"`, a
vírgula vem depois do ponto → vírgula é o separador decimal (formato BR). Em
`"1,234.56"`, o ponto vem depois → ponto é o decimal (formato US). É uma
heurística posicional, não uma configuração fixa por banco.
</details>

**C4 (avançado).** Duas regras dão "match" na mesma descrição: uma regra do
**usuário** ("mercado" → Alimentação) e uma regra **padrão** do sistema
("merc" → Outros). Qual vence, e por que exatamente essa?

<details><summary>Resposta</summary>

A do usuário. `categorizar` testa as regras na ordem
`[...regrasUsuario, ...REGRAS_PADRAO]` e para no **primeiro** match — como as
regras do usuário vêm primeiro no array combinado, "mercado" é testada (e
casa) antes de "merc" sequer ser avaliada.
</details>

**C5 (avançado).** Um Pix do banco BTG do autor pro banco Sicredi do autor
(a mesma pessoa, duas contas próprias) apareceria, sem tratamento nenhum,
como uma **entrada** (no Sicredi) e uma **saída** (no BTG) — inflando os dois
totais sem mudar o patrimônio de verdade. Qual mecanismo evita isso, e em que
momento do fluxo ele roda?

<details><summary>Resposta</summary>

`config.contasProprias` — uma lista de textos (CPF, nome) que, se aparecerem
na descrição da transação, fazem `prepararImportacao` marcar o lançamento
como `tipo: 'transferencia'` em vez de `entrada`/`saida`. Como `calculos.js`
só soma `entrada` e `saida` nos totais, a transferência fica de fora — sai a
inflação artificial. Roda **na importação** (e o mesmo texto cadastrado vale
pra qualquer extrato futuro).
</details>

---

## D. Métricas (saldo, score, planejamento, reserva, metas)

**D1 (básico).** Qual a diferença entre "saldo do mês" e "saldo acumulado"?

<details><summary>Resposta</summary>

Saldo do mês é só `entradas − saídas` **daquele mês específico**. Saldo
acumulado é a soma de tudo — todos os meses, desde o primeiro registro —
até o mês selecionado.
</details>

**D2 (intermediário).** No score de saúde financeira, se o **comprometimento
futuro** é alto (muita fatura de cartão a vencer), o pilar correspondente no
score fica alto ou baixo? Por quê a fórmula é `1 − (futuras / entradas)` e
não só `futuras / entradas`?

<details><summary>Resposta</summary>

Fica **baixo** (ruim) quando o comprometimento é alto. A fórmula é invertida
porque, nos outros dois pilares (saldo, essencialidade), "maior é melhor" —
pra manter os três pilares na mesma convenção de leitura (quanto maior o
número, mais saudável), o comprometimento — onde "maior é pior" na métrica
crua — precisa ser invertido antes de entrar na média ponderada.
</details>

**D3 (intermediário).** Por que "disponível para gastar" (tela Reservas) não
é simplesmente igual a "dinheiro em conta" (tela Início)?

<details><summary>Resposta</summary>

Porque parte do dinheiro em conta já está **reservada** (earmark) — guardada
de propósito, não disponível pra gasto do dia a dia. `disponivel =
dinheiroEmConta − reservaAcumulada`. Sem essa subtração, você "veria" como
disponível um dinheiro que já decidiu não tocar.
</details>

**D4 (avançado).** Por que converter uma taxa de juros **anual** de 12% para
uma taxa **mensal** equivalente não é simplesmente `12% / 12 = 1%` ao mês?
Qual é o cálculo certo, e por quê?

<details><summary>Resposta</summary>

Dividir por 12 ignora o efeito **composto** — juros de um mês passam a
render juros nos meses seguintes, então uma taxa mensal de exatamente 1%
aplicada 12 vezes rende **mais** que 12% ao ano (juros sobre juros). O
cálculo certo é a raiz 12ª: `(1 + taxaAnual)^(1/12) − 1`, que é a taxa
mensal que, composta 12 vezes, reproduz exatamente a taxa anual informada.
</details>

**D5 (avançado).** Em que situação `mesesParaAlvo` devolve `null`, e por que
`null` (em vez de, digamos, `0` ou `Infinity`)?

<details><summary>Resposta</summary>

Quando a simulação mês a mês passa de 1200 meses (100 anos) sem que o
patrimônio simulado alcance o alvo — o que acontece, por exemplo, quando o
aporte mensal é zero (ou muito baixo) e a rentabilidade não compensa. `null`
sinaliza "não sei estimar um prazo razoável" — diferente de `0` (que
significaria "a meta já foi atingida agora") e mais seguro de tratar na UI
que `Infinity` (que exigiria um cuidado especial em toda formatação de
número pra não imprimir literalmente "Infinity" na tela).
</details>

---

## E. A ponte (Electron)

**E1 (básico).** Se o app está rodando num navegador comum (sem Electron),
onde os dados são salvos?

<details><summary>Resposta</summary>

No `localStorage` do navegador, sob a chave `finanwise:dados`. `storage.js`
detecta a ausência de `window.finanwise` e usa esse caminho em vez do IPC do
Electron.
</details>

**E2 (intermediário).** Por que `salvarDados` (em `main.js`) escreve num
arquivo `.tmp` e só depois renomeia, em vez de escrever direto em
`dados.json`?

<details><summary>Resposta</summary>

Porque um `rename` é (na prática) uma operação atômica no sistema de
arquivos: ou o arquivo de destino vira o conteúdo novo por completo, ou (se o
processo cair no meio) o `dados.json` original permanece intacto. Escrever
direto em cima do arquivo real arriscaria deixá-lo "meio escrito" — corrompido
— se algo interrompesse a gravação no meio (queda de luz, pendrive arrancado).
</details>

**E3 (intermediário).** Qual a diferença de **propósito** entre o arquivo
`.backup` e a pasta `backups/`?

<details><summary>Resposta</summary>

`.backup` é a versão **imediatamente anterior**, sobrescrita a cada
gravação — serve pra desfazer um erro percebido **na hora**. `backups/` é um
histórico **datado**, com várias cópias ao longo do tempo (com rotação, até
um limite configurável) — serve pra voltar a um ponto de **dias atrás**,
quando o erro só foi percebido depois.
</details>

**E4 (avançado).** Por que `preload.js` expõe 5 métodos nomeados
(`ler`, `salvar`, `caminho`, `exportar`, `importar`) em vez de simplesmente
expor `ipcRenderer.invoke` genérico pra página usar como quiser?

<details><summary>Resposta</summary>

Porque expor `invoke` genérico deixaria a página chamar **qualquer** canal
IPC registrado — inclusive canais adicionados no futuro sem ninguém pensar
nas implicações de segurança daquele canal específico ser acessível à
página. Uma lista fechada e nomeada (*allowlist*) garante que a superfície de
ataque possível seja exatamente essas 5 operações, nunca mais que isso.
</details>

**E5 (avançado).** O que aconteceria, na prática, se alguém removesse
`contextIsolation: true` da configuração da janela do Electron?

<details><summary>Resposta</summary>

O `contextBridge` deixaria de ser a única ponte segura — o escopo JavaScript
do `preload.js` (que tem acesso a `require`/Node) deixaria de estar isolado
do escopo da própria página. Isso abriria caminho pra a página manipular
objetos globais do preload e, por extensão, alcançar capacidades de Node que
deveriam ficar restritas — um bug de XSS na UI passaria a poder ler/escrever
arquivos no disco do usuário, não só bagunçar a tela.
</details>

---

## F. Interface (sem framework)

**F1 (básico).** Por que `index.html` não tem uma `<div>` separada para cada
uma das 9 abas?

<details><summary>Resposta</summary>

Porque o app segue o padrão de **contêiner único**: existe só um
`<main id="view">`, e o conteúdo de cada aba é gerado inteiramente por
JavaScript (`app.js`) e injetado ali, substituindo o que havia antes. Não há
seções pré-construídas escondidas com CSS.
</details>

**F2 (intermediário).** O que a função `render()` faz, **sempre**, toda vez
que é chamada — não importa qual aba está ativa?

<details><summary>Resposta</summary>

Apaga todo o conteúdo de `#view` (`innerHTML = ''`) e chama a função
`renderX` correspondente à aba atual (via uma tabela de despacho), que
reconstrói a tela do zero a partir do `estado` atual. Nunca tenta atualizar
só a parte que mudou — sempre reconstrói tudo.
</details>

**F3 (intermediário).** No formulário de Lançar, trocar o tipo (Saída /
Entrada / Cartão) **não** chama `render()` — só alterna classes CSS e
`style.display`. Por quê essa exceção à regra "sempre reconstruir tudo"?

<details><summary>Resposta</summary>

Porque `render()` apagaria `#view` inteiro, destruindo os inputs que o
usuário já estava preenchendo (valor, descrição, data) no meio do
preenchimento — a troca de tipo só precisa mostrar/esconder campos
específicos (cartão vs. forma de pagamento), não redesenhar a tela.
</details>

**F4 (avançado).** No gráfico "Entradas × Saídas" existe uma legenda
explícita; no gráfico "Para onde foi o dinheiro" (categorias) não existe
nenhuma. Por que essa diferença é intencional, não uma inconsistência?

<details><summary>Resposta</summary>

O primeiro tem **duas séries** codificadas só por cor (entradas/saídas) —
identidade nunca deveria depender só de cor (daltonismo, impressão P&B),
então a legenda com texto é obrigatória. O segundo tem **uma série só**
(magnitude por categoria); o nome de cada categoria já está escrito ao lado
da barra, então uma legenda seria redundante.
</details>

**F5 (avançado).** Por que a ordem dos cards de KPI no dashboard (Entradas,
Saídas, Saldo do mês, Comprometido futuro) não pode ser alterada sem cuidado
extra?

<details><summary>Resposta</summary>

Porque o comentário na linha ~122 de `app.js` fixa a ordem —
`[0]=Entradas, [1]=Saídas` — justamente porque o teste end-to-end
(`npm run test:e2e`) localiza os cards **por índice** no DOM, não por texto
ou id. Reordenar por motivo
estético quebraria um teste num arquivo completamente diferente do que está
sendo editado.
</details>

---

## G. Arquitetura e integração

**G1 (avançado).** Trace o caminho completo de "clicar em Lançar" até o dado
existir de fato no disco, **nomeando cada arquivo** pelo qual ele passa.

<details><summary>Resposta</summary>

`app.js` (handler do botão) → `core/index.js` (`adicionarTransacao`, devolve
estado novo) → `app.js` (`persistir()`) → `storage.js` (`salvarEstado`,
detecta Electron) → `preload.js` (`window.finanwise.salvar`, via
`ipcRenderer.invoke`) → `electron/main.js` (`ipcMain.handle('dados:salvar')`
→ `salvarDados`: escreve `.tmp`, copia `.backup`, dispara backup datado se
o intervalo permitir, renomeia `.tmp` → `dados.json`). Ver
[`FLUXOGRAMA.md`](./FLUXOGRAMA.md), Fluxo 2.
</details>

**G2 (avançado).** O que faz uma função pertencer ao **núcleo**
(`src/core`) em vez da **casca** (`src/ui`)? Dê um exemplo de função que
poderia *parecer* que deveria estar no núcleo, mas está (corretamente) na
casca.

<details><summary>Resposta</summary>

Núcleo: seria verdade mesmo rodando num servidor sem tela — não depende de
`window`/`document`/`fs`, não formata pra exibição humana, só calcula fatos a
partir do estado. Exemplo de função que parece "lógica" mas é casca:
`prazoLegivel` (em `app.js`), que transforma um número de meses (um fato,
devolvido por `mesesParaAlvo` no núcleo) em `"1 ano e 2 meses"` — isso é
**fraseado em português pra humano ler**, uma decisão de apresentação, não
uma regra de negócio.
</details>

**G3 (avançado, pegadinha).** Um desenvolvedor decide simplificar: em vez de
`registrarReserva` (um movimento no ledger da reserva), "resgatar da
reserva" deveria virar uma transação comum do tipo `saida`, pra aparecer
"naturalmente" nos gráficos de gasto por categoria. O que quebra?

<details><summary>Resposta</summary>

Pelo menos três coisas: **(1)** `dinheiroEmConta` cairia pelo valor resgatado
— mas resgatar da reserva não reduz seu patrimônio, só destrava dinheiro que
já era seu; o "disponível para gastar" (que já soma `dinheiroEmConta −
reservaAcumulada`) ficaria efetivamente **inalterado** ou pior, em vez de
subir como deveria quando você libera uma reserva. **(2)** O resgate
apareceria como um "gasto" no gráfico de categorias e no cálculo de
`gastoMedioMensal` — inflando artificialmente a média de gasto, que é
justamente a base usada pra calcular a **meta** da própria reserva (`meta =
gastoMedio × metaMeses`) — um resgate aumentaria a meta que você precisa
atingir, um ciclo de realimentação sem sentido. **(3)** O pilar
"essencialidade" do score de saúde também seria afetado por um "gasto" que
não é gasto de verdade. É exatamente o tipo de dupla contagem que o conceito
de *earmark* (ver [`GLOSSARIO.md`](./GLOSSARIO.md)) existe pra evitar.
</details>

---

## H. Prática — prever, escrever e caçar

> Até aqui você respondeu perguntas; agora você trabalha. H1–H3 são de papel e
> caneta (preveja **antes** de rodar); H4–H5 são katas cujo gabarito é um
> **teste** — implemente até ele passar; H6 é uma caçada a bug. Para rodar
> qualquer um: crie `test/estudo.test.mjs`, cole o código, e rode
> `npm run test:core` (o glob `test/*.test.mjs` pega o arquivo novo — apague-o
> no fim, é rascunho seu, não do projeto).

**H1 (prever a saída).** Sem rodar, o que devolve cada chamada?

```js
somaMeses('2026-11', 3);
somaMeses('2026-01', -1);
rotuloMes('2026-02');
```

<details><summary>Resposta</summary>

`'2027-02'`, `'2025-12'` e `'Fevereiro 2026'`. O truque de `somaMeses` é
converter ano+mês num contador único de meses (`ano * 12 + (mes - 1)`),
somar, e decompor com divisão/resto — a virada de ano, pra frente **e pra
trás**, sai de graça da aritmética. O primeiro caso é literalmente um teste
de `test/core.test.mjs`.
</details>

**H2 (prever a saída).** Cartão com `fechamento: 10`:

```js
const cartao = { id: 'c1', fechamento: 10, vencimento: 20 };
const tx = {
  id: 't1', tipo: 'cartao', data: '2026-07-15',
  categoria: 'Lazer', valor: 250, cartaoId: 'c1', parcelas: 3,
};
parcelasDaTransacao(tx, cartao);
```

Quantas parcelas, de quais valores, em quais `mesFatura`?

<details><summary>Resposta</summary>

Dia 15 > fechamento 10 → offset +2 → primeira fatura em `'2026-09'`.
R$ 250,00 = 25000 centavos; `25000 ÷ 3 = 8333` (floor) → duas parcelas de
R$ 83,33 e a última leva o resíduo: R$ 83,34. Resultado:
`2026-09` → 83,33 · `2026-10` → 83,33 · `2026-11` → 83,34.
A soma fecha exatamente R$ 250,00 — regra do resíduo na última.
</details>

**H3 (prever a saída).** Monte este estado e preveja os dois resumos:

```js
const cartao = { id: 'c1', nome: 'Roxinho', fechamento: 10, vencimento: 20 };
const estado = {
  ...estadoInicial(),
  cartoes: [cartao],
  transacoes: [
    { id: 't1', tipo: 'entrada', data: '2026-07-05', categoria: 'Salário', valor: 3000 },
    { id: 't2', tipo: 'saida',   data: '2026-07-08', categoria: 'Mercado', valor: 500 },
    { id: 't3', tipo: 'cartao',  data: '2026-07-05', categoria: 'Lazer',   valor: 300, cartaoId: 'c1', parcelas: 1 },
  ],
};
resumoMes(estado, '2026-07'); // → ?
resumoMes(estado, '2026-08'); // → ?
```

<details><summary>Resposta</summary>

A compra no cartão foi dia 05 ≤ fechamento 10 → fatura de `'2026-08'`.

- **Julho:** `entradas: 3000`, `saidasDiretas: 500`, `faturas: 0`,
  `saidas: 500`, `saldoMes: 2500`. A compra de cartão **não** aparece — na
  data da compra, dinheiro nenhum saiu da conta.
- **Agosto:** `entradas: 0`, `saidasDiretas: 0`, `faturas: 300`,
  `saidas: 300`, `saldoMes: -300`. A parcela conta no mês da fatura.

É a convenção temporal de `calculos.js` funcionando: compra ≠ saída de
dinheiro.
</details>

**H4 (kata).** Implemente `maiorGastoDoMes(estado, mes)`: devolve o objeto
`{categoria, valor}` da categoria em que mais se gastou no mês (saídas
diretas + parcelas), ou `null` se não houve gasto. Dica: uma função de
`calculos.js` já fez 95% do trabalho.

<details><summary>Gabarito (função + teste)</summary>

```js
import { gastoPorCategoria } from '../src/core/index.js';

export function maiorGastoDoMes(estado, mes) {
  const [primeiro] = gastoPorCategoria(estado, mes);
  return primeiro || null;
}
```

`gastoPorCategoria` já agrupa, soma em centavos e ordena decrescente —
reusar é a resposta certa (composição; regra num lugar só). O teste, usando
o estado do H3:

```js
test('maiorGastoDoMes acha a categoria campeã do mês', () => {
  assert.deepEqual(maiorGastoDoMes(estado, '2026-07'), { categoria: 'Mercado', valor: 500 });
  assert.deepEqual(maiorGastoDoMes(estado, '2026-08'), { categoria: 'Lazer', valor: 300 });
  assert.equal(maiorGastoDoMes(estado, '2026-06'), null);
});
```

Se você reimplementou a soma na mão: funciona, mas agora a convenção
"parcela conta no mês da fatura" mora em dois lugares — releia o conceito de
composição em [`calculos.explicado.md`](./calculos.explicado.md).
</details>

**H5 (kata).** Implemente `totalPorForma(estado, mes)`: soma as **saídas
diretas** do mês por forma de pagamento (`t.forma`) e devolve
`[{forma, valor}]` em ordem decrescente; transação sem forma cai em
`'Sem forma'`. (Parcelas ficam de fora: cartão não tem "forma" — a forma é o
próprio cartão.) O molde é o *group-by* de `gastoPorCategoria`.

<details><summary>Gabarito (função + teste)</summary>

```js
import { paraCentavos, paraReais, mesDe } from '../src/core/index.js';

export function totalPorForma(estado, mes) {
  const acc = new Map();
  for (const t of estado.transacoes || []) {
    if (t.tipo !== 'saida' || (mes && mesDe(t.data) !== mes)) continue;
    const chave = t.forma || 'Sem forma';
    acc.set(chave, (acc.get(chave) || 0) + paraCentavos(t.valor));
  }
  return [...acc.entries()]
    .map(([forma, cent]) => ({ forma, valor: paraReais(cent) }))
    .sort((a, b) => b.valor - a.valor);
}
```

O esqueleto é idêntico ao de `gastoPorCategoria`: `Map` como balde,
`get || 0` para inicializar, soma em centavos, converte e ordena no fim.
Reconhecer que "somar por chave e rankear" é sempre esse molde é o objetivo
do kata. Teste:

```js
test('totalPorForma agrupa saídas diretas por forma', () => {
  const estado = {
    ...estadoInicial(),
    transacoes: [
      { id: 'a', tipo: 'saida', data: '2026-07-01', valor: 100, forma: 'Pix' },
      { id: 'b', tipo: 'saida', data: '2026-07-02', valor: 50,  forma: 'Pix' },
      { id: 'c', tipo: 'saida', data: '2026-07-03', valor: 80 },
      { id: 'd', tipo: 'entrada', data: '2026-07-04', valor: 999, forma: 'Pix' },
    ],
  };
  assert.deepEqual(totalPorForma(estado, '2026-07'), [
    { forma: 'Pix', valor: 150 },
    { forma: 'Sem forma', valor: 80 },
  ]);
});
```
</details>

**H6 (caçada, avançado).** A função abaixo é o `resumoMes` de `calculos.js`
com **uma única alteração** introduzida de propósito. Sem comparar com o
fonte: **(1)** ache o bug, **(2)** descreva o sintoma que o usuário veria na
tela, **(3)** escreva o teste que o pegaria (e que passa no original).

```js
export function resumoMes(estado, mes) {
  const txs = estado.transacoes || [];
  const entradasCent = somaCent(txs.filter((t) => t.tipo === 'entrada' && mesDe(t.data) === mes), 'valor');
  const saidasDiretasCent = somaCent(txs.filter((t) => t.tipo === 'saida' && mesDe(t.data) === mes), 'valor');
  const faturasCent = somaCent(todasParcelas(estado).filter((p) => p.mesFatura <= mes), 'valor');
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

<details><summary>Gabarito</summary>

**(1) O bug** — um caractere, na linha das faturas:

```diff
- .filter((p) => p.mesFatura <= mes)
+ .filter((p) => p.mesFatura === mes)
```

Com `<=`, o mês soma as parcelas dele **e de todos os meses anteriores**.

**(2) O sintoma** — as "saídas" de cada mês crescem sem parar: a parcela de
janeiro conta de novo em fevereiro, março, abril… O saldo do mês despenca
com o tempo sem nenhum gasto novo, e — pior — `saldoAcumulado` soma
`resumoMes` de cada mês, então cada parcela antiga é contada N vezes no
acumulado. O "dinheiro em conta" da tela Início ficaria absurdamente
negativo. Repare que é um bug **silencioso**: nenhum erro, só números
errados — exatamente a classe de bug que a convenção temporal + testes
existem pra travar.

**(3) O teste** — precisa de parcelas em **dois** meses diferentes (com um
mês só, `<=` e `===` coincidem — por isso o bug passaria batido num teste
preguiçoso):

```js
test('resumoMes não vaza parcelas de meses anteriores', () => {
  const cartao = { id: 'c1', fechamento: 25, vencimento: 10 };
  const estado = {
    ...estadoInicial(),
    cartoes: [cartao],
    transacoes: [{
      id: 't1', tipo: 'cartao', data: '2026-02-16',
      categoria: 'X', valor: 100, cartaoId: 'c1', parcelas: 2,
    }],
  };
  // parcelas caem em 2026-03 e 2026-04 (50 + 50)
  assert.equal(resumoMes(estado, '2026-03').faturas, 50);
  assert.equal(resumoMes(estado, '2026-04').faturas, 50); // bugado daria 100
});
```
</details>

---

**Próximo:** [`ROTEIRO.md`](./ROTEIRO.md) — a ordem sugerida de leitura de
tudo isso, do zero até aqui.
