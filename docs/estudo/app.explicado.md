# `src/ui/app.js` — explicado

`app.js` é o controlador da UI inteira — o maior arquivo do projeto (1183
linhas) e o ponto onde tudo que os outros documentos explicam se junta: lê e
escreve em [`estado`](./index.explicado.md) através das operações do núcleo
(`import * as C from '../core/index.js'`), persiste via
[`storage.js`](./storage.explicado.md), desenha gráficos via
[`charts.js`](./charts.explicado.md) e enche o `<main id="view">` que
[`index.html`](./index.html.explicado.md) deixou vazio de propósito. Sem
framework — "vanilla JS" com um punhado de helpers caseiros (`el`, `field`,
`kpi`, `persistir`...) — porque um framework pesaria no bundle e exigiria uma
etapa de build, ambos atritos indesejados para um app que roda direto do
pendrive, sem instalação. Por causa do tamanho, o arquivo foi dividido em
**7 partes completas**, cada uma cobrindo um intervalo de linhas exato e sem
sobreposição — juntas, elas somam as 1183 linhas do arquivo, linha por linha:

- **[Parte 1](./app.parte1.explicado.md)** — linhas 1–99. Estado global do
  módulo (`estado`, `mesAtual`, `tabAtual`...), os helpers de DOM (`el`,
  `field`, `opts`, `toast`), o ritual `persistir()` e o roteador `render()`.
- **[Parte 2](./app.parte2.explicado.md)** — linhas 100–323. O dashboard de
  Início (`renderDashboard`): KPIs, sparklines, faturas do mês e a visão
  anual.
- **[Parte 3](./app.parte3.explicado.md)** — linhas 324–447. A tela de
  Lançar (`renderLancar`): formulário de lançamento rápido, categorização ao
  vivo e o cuidado de preservar o foco entre lançamentos.
- **[Parte 4](./app.parte4.explicado.md)** — linhas 448–611. Importar e
  Revisar (`renderImportar`, `renderRevisar`): pré-visualização de extrato
  sem persistir, e a fila de categorização assistida.
- **[Parte 5](./app.parte5.explicado.md)** — linhas 612–698. Cartões
  (`renderCartoes`): faturas do mês, próximas faturas, cadastro de cartões e
  parcelas em aberto.
- **[Parte 6](./app.parte6.explicado.md)** — linhas 699–931. Planejar e
  Reservas (`renderPlanejar`, `renderReservas`): orçamento por categoria
  (estimado × real) e a reserva de emergência como earmark sobre o dinheiro
  em conta.
- **[Parte 7](./app.parte7.explicado.md)** — linhas 932–1183. Metas e
  Config (`renderMetas`, `renderConfig` e seus editores) e, por fim,
  `init()` — o boot do app inteiro.

Cada parte segue o mesmo formato: o código-fonte literal, em blocos
pequenos, seguido de explicação didática (o que faz, como faz, sintaxe,
conceito por trás, alternativas e armadilhas). O conteúdo profundo mora nas
partes — este documento é só o índice.
