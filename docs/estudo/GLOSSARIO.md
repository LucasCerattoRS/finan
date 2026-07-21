# Glossário

> Consulta rápida — dois vocabulários que se misturam neste projeto: o do
> **domínio** (como um app de finanças pessoais fala) e o **técnico** (os
> idiomas de JavaScript/Electron/CSS que o código usa pra implementar isso).
> Cada termo linka pro `.explicado.md` onde ele é explicado a fundo — este
> arquivo é só o "o que isso quer dizer, rapidinho", não substitui a leitura.

---

## Vocabulário do domínio (finanças)

**Adiantamento** — pagar uma fatura de cartão **antes** do mês em que ela
fecha oficialmente (é o que o app do banco chama de "pagar antecipado"). No
código, é só um `registrarPagamentoFatura` com `mesFatura` no futuro; a
diferença de "adiantado" vs. "pago normal" é calculada, não armazenada. Ver
[`faturasPagas`](./faturasPagas.explicado.md).

**Cartão (tipo de transação)** — uma compra feita no crédito. Ao contrário de
entrada/saída, uma transação `tipo: 'cartao'` não é uma saída direta — ela é
**explodida em parcelas** que caem no mês de fatura certo. Ver
[`parcelas`](./parcelas.explicado.md).

**Classificação (Essencial / Não essencial)** — uma segunda dimensão além da
categoria, usada pra calcular o pilar "essencialidade" do
[score de saúde](./score.explicado.md) e o gráfico "essencial × não" do
[dashboard](./calculos.explicado.md).

**Comprometido futuro** — soma do que já está "prometido" em faturas de
cartão que ainda vão vencer, mas cujo dinheiro ainda não saiu da conta. Ver
[`calculos`](./calculos.explicado.md) e [`faturasPagas`](./faturasPagas.explicado.md).

**Conta própria / transferência** — um Pix ou TED entre duas contas do mesmo
dono (ex.: BTG → Sicredi) não é ganho nem gasto — é só dinheiro mudando de
lugar. O app detecta isso por `config.contasProprias` (CPF/nome cadastrados) e
marca como `tipo: 'transferencia'`, fora dos totais de entrada/saída. Ver
[`importar`](./importar.explicado.md).

**Dinheiro em conta** — o saldo acumulado até o mês selecionado (soma de
todas as entradas menos saídas desde o início dos dados). **Não** é o saldo
real do banco — é só o fluxo líquido do que foi importado/lançado. Ver
[`calculos`](./calculos.explicado.md).

**Disponível para gastar** — dinheiro em conta **menos** a reserva
acumulada. É a materialização do conceito de *earmark* (abaixo). Ver
[`reserva`](./reserva.explicado.md).

**Earmark (dinheiro carimbado)** — guardar dinheiro na reserva não é um
gasto: o dinheiro continua na conta, só ganha uma "etiqueta" de intocável.
Modelado como uma etiqueta, não como uma saída, pra nunca contar o mesmo real
duas vezes. Ver [`reserva`](./reserva.explicado.md).

**Fatura (invoice)** — o agrupamento mensal das compras no cartão de
crédito, identificado por `cartaoId` + `mesFatura` (`"YYYY-MM"`). Uma fatura
pode ter um valor **informado** pelo banco ou ser calculada pela **soma das
parcelas** que caem nela. Ver [`faturas`](./faturas.explicado.md) e
[`faturasPagas`](./faturasPagas.explicado.md).

**Fechamento / vencimento (do cartão)** — o dia do mês em que a fatura fecha
(deixa de aceitar novas compras naquele ciclo) e o dia em que ela vence
(precisa ser paga). Juntos, decidem em qual mês uma compra específica cai. Ver
[`faturas`](./faturas.explicado.md).

**Gasto médio mensal** — a média das saídas dos últimos N meses com
movimento; é a régua usada pra converter uma meta de reserva de "N meses de
gasto" em um valor concreto em reais. Ver [`reserva`](./reserva.explicado.md).

**Meta (financeira)** — um dos três alvos de longo prazo que o app calcula:
**reserva de emergência** (N meses de gasto), **liberdade financeira** (M
meses de renda guardados) e **viver de dividendos** (patrimônio grande o
bastante pra render, a um yield, tanto quanto sua renda). Ver
[`metas`](./metas.explicado.md).

**Parcela (installment)** — uma fração de uma compra no cartão, uma por mês
de fatura, com o resíduo da divisão jogado na última parcela pra fechar o
valor exato da compra em centavos. Ver [`parcelas`](./parcelas.explicado.md).

**Planejamento (orçamento estimado × real)** — quanto você **pretende**
gastar por categoria num mês (`estimado`) comparado com quanto **de fato**
saiu (`real`, já incluindo parcelas de cartão). Ver
[`planejamento`](./planejamento.explicado.md).

**Regra de categorização** — um par `{padrão, categoria, classificação}`: se
a descrição de uma transação contém o padrão, a regra aplica a categoria
automaticamente. Regras do usuário sempre vencem as regras padrão do sistema.
Ver [`regras`](./regras.explicado.md).

**Reserva de emergência** — dinheiro guardado à parte, como *earmark*
(acima), com uma meta em "meses de gasto médio". Ver
[`reserva`](./reserva.explicado.md).

**Revisar (grupos a revisar / nomeado)** — a tela que agrupa transações sem
categoria pelo destino (quem recebeu o dinheiro) pra resolver várias de uma
vez. Um grupo é **nomeado** quando o extrato diz quem é a contraparte (vira
regra permanente); é **anônimo** quando o extrato só diz "PIX" sem nome (só dá
pra categorizar na mão, nunca vira regra — senão carimbaria todo Pix futuro
igual). Ver [`revisar`](./revisar.explicado.md).

**Saldo acumulado / saldo do mês** — o segundo é só o resultado (entradas
− saídas) daquele mês específico; o primeiro é a soma de tudo até ali. Ver
[`calculos`](./calculos.explicado.md).

**Score de saúde financeira** — nota de 0 a 100, composta de três pilares
com pesos diferentes: saldo (40%), essencialidade dos gastos (35%) e
comprometimento futuro (25%, invertido — menos comprometido é melhor). Ver
[`score`](./score.explicado.md).

---

## Vocabulário técnico (programação)

**Adapter (padrão)** — mesma interface pública, implementações diferentes por
baixo, escolhidas em tempo de execução. É como `storage.js` esconde se o
backend é Electron ou `localStorage`. Ver [`storage`](./storage.explicado.md).

**Allowlist** — expor só uma lista fechada e nomeada de operações permitidas,
em vez de uma porta genérica que aceitaria qualquer coisa. É como
`preload.js` expõe 5 métodos fixos em vez de `ipcRenderer` inteiro. Ver
[`preload`](./preload.explicado.md).

**Atomic write (escrita atômica)** — escrever o conteúdo novo num arquivo
temporário e só then renomear por cima do arquivo real — o rename é
indivisível no sistema de arquivos, então nunca existe um estado "meio
escrito" se o processo cair no meio. Ver [`main.js`](./main.explicado.md).

**Clamp (saturação)** — travar um valor dentro de um intervalo fixo
(`Math.max(min, Math.min(max, v))`), tipicamente `[0,1]` pra um "progresso"
que nunca deveria passar de 100% nem ficar negativo. Aparece em quase todo
cálculo de "progresso rumo a uma meta" no núcleo inteiro.

**Closure** — uma função que "lembra" variáveis do escopo onde foi criada,
mesmo depois desse escopo ter retornado. É como cada botão/input em
[`app.js`](./app.explicado.md) tem seu handler fechando sobre os elementos
irmãos específicos daquele formulário.

**contextBridge / contextIsolation** — o par de mecanismos do Electron que
permite ao processo principal (com acesso total a Node) expor **só** um
conjunto controlado de funções pra página, sem dar acesso a `require`/`fs`
diretamente. Ver [`preload`](./preload.explicado.md) e
[`main.js`](./main.explicado.md).

**CQS (Command-Query Separation)** — separar funções que **perguntam** algo
(sem efeito colateral, ex.: [`calculos.js`](./calculos.explicado.md)) de
funções que **mudam** algo (ex.: as mutações em `index.js`). Nenhuma função de
leitura no núcleo muda o estado.

**Design tokens** — nomear valores visuais (cor, raio, sombra) pelo **papel**
(`--pos`, `--surface`) em vez da aparência (`--verde`), guardados como
custom properties CSS num só lugar — permite retemizar o app inteiro trocando
só os tokens. Ver [`app.css`](./app.css.explicado.md).

**Fingerprint (chave de deduplicação)** — uma string derivada de vários
campos de um registro (data + valor + descrição normalizada), usada pra
detectar duplicatas mesmo sem um ID explícito. Ver
[`importar`](./importar.explicado.md).

**Guard clause (retorno antecipado)** — `if (condiçãoRuim) return valorPadrão;`
logo no topo de uma função, evitando aninhar o resto da lógica dentro de um
`else`. O idioma mais repetido do núcleo inteiro.

**Hyperscript** — uma função `(tag, atributos, filhos) → elemento` que cria
nós de DOM/SVG programaticamente, sem HTML literal. O app tem duas versões:
`s()` em [`charts.js`](./charts.explicado.md) (SVG) e `el()` em
[`app.js`](./app.explicado.md) (HTML).

**IPC (Inter-Process Communication)** — como o processo principal do
Electron (Node, acesso a disco) e o processo de renderização (a página web)
trocam mensagens, já que não podem chamar funções um do outro diretamente. Ver
[`main.js`](./main.explicado.md).

**Ledger com sinal** — representar duas operações opostas (aporte/resgate,
crédito/débito) com um **único** campo numérico, onde o sinal decide a
direção — soma resolve o saldo sem precisar de `if`. Ver
[`reserva`](./reserva.explicado.md).

**Namespace import (`import * as C`)** — importar um módulo inteiro sob um
apelido, em vez de desestruturar cada nome — cada chamada (`C.algo`) já
documenta de onde veio. Ver [`app.js`](./app.explicado.md).

**Núcleo puro / casca impura** ("functional core, imperative shell") — a
arquitetura do projeto inteiro: `src/core` nunca toca DOM, nunca muta o que
recebe, sempre devolve dado novo; toda a "sujeira" (DOM, disco, rede) fica
isolada em `src/ui` e `electron/`. Ver o `CLAUDE.md` e
[`index.explicado.md`](./index.explicado.md).

**Promisificar** — embrulhar uma API antiga baseada em callback/evento
(`FileReader`, `<input type=file>`) num `new Promise(...)`, pra poder usar
`await` como em qualquer código moderno. Ver
[`storage`](./storage.explicado.md).

**Sentinel value (valor-sentinela)** — usar um valor especial (`0`, `null`)
pra significar "isto ainda não aconteceu", explorando que ele também é
*falsy* em JS. Ver `ultimoBackup` em [`main.js`](./main.explicado.md).

**Set / Map como estrutura de solução** — `Set` pra remover duplicata ou unir
fontes distintas (ex.: meses de `faturas` + meses de parcelas); `Map` pra
indexar por id (busca O(1)) ou agrupar por chave. Aparecem dezenas de vezes no
núcleo inteiro.

**SPA (Single Page Application)** — uma única página HTML cujo conteúdo é
inteiramente gerado/trocado por JavaScript, sem recarregar nem navegar entre
arquivos. Ver [`index.html`](./index.html.explicado.md).

**Stroke-dasharray (medidor circular)** — o truque de CSS/SVG que transforma
"desenhar X% de um círculo" numa conta de comprimento linear
(`dasharray: "fração_do_perímetro resto"`), sem precisar de trigonometria de
arco. Ver [`charts.js`](./charts.explicado.md).

**Tabular-nums** — a propriedade CSS que faz todo dígito ocupar a mesma
largura, essencial pra números alinhados em coluna (tabelas, KPIs). Ver
[`app.css`](./app.css.explicado.md).

---

**Próximo:** [`CONCEITOS.md`](./CONCEITOS.md) organiza os padrões técnicos
recorrentes por **tema** (não em ordem alfabética), com mais profundidade
sobre quando usar cada um.
