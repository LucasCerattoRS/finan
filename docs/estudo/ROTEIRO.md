# Roteiro de estudo — por onde começar

> A porta de entrada de `docs/estudo/`. Os outros 36 documentos podem ser
> lidos em qualquer ordem, mas esta ordem foi pensada pra que cada arquivo já
> chegue com o vocabulário do anterior pronto — evita reler nada por falta de
> contexto. Se você só tem uma hora, leia o [`MAPA.md`](./MAPA.md) e o
> [`FLUXOGRAMA.md`](./FLUXOGRAMA.md) e já sai com o mapa inteiro na cabeça.

## Antes de começar

Não leia isto só na tela — o `CLAUDE.md` do projeto é categórico: **prove que
roda antes de confiar**. Abra dois terminais lado a lado:

```
npm install        # uma vez só
npm start           # abre o app de verdade — deixe aberto enquanto estuda
npm run test:core   # roda em segundos — rode de novo depois de CADA arquivo
```

A cada arquivo que você terminar de ler, faça a ação correspondente no app
aberto (a sugestão vem no fim de cada etapa abaixo). Ler que "uma compra em 3x
explode em parcelas" e depois **ver** as 3 parcelas aparecerem na aba Cartões
fecha o entendimento de um jeito que nenhuma leitura sozinha fecha.

---

## Etapa 0 — o mapa antes do território

**Leia:** [`MAPA.md`](./MAPA.md)

Antes de abrir qualquer arquivo, veja onde ele mora. O `MAPA.md` responde três
perguntas em uma página: o que fica em cada pasta, por onde o app começa
(`npm start` → `main.js` → `app.js` → `init()`), e os sete padrões que se
repetem em todo o resto do estudo. É a única etapa sem exercício correspondente
— é orientação, não conteúdo novo.

---

## Etapa 1 — o alicerce: modelo e fachada

**Leia:** [`model.explicado.md`](./model.explicado.md) →
[`index.explicado.md`](./index.explicado.md) →
[`EXEMPLO-DADOS.md`](./EXEMPLO-DADOS.md)

Aqui mora o vocabulário que todo o resto assume como dado: dinheiro em
centavos, `schemaVersion` e migração, o contrato "toda mutação é
`(estado, dados) → novo estado`", e a ideia de núcleo puro / casca impura que
o `CLAUDE.md` do projeto exige. Sem esses dois arquivos, tudo o que vem
depois vai parecer arbitrário; com eles, quase tudo o que vem depois vai
parecer óbvio. O `EXEMPLO-DADOS.md` fecha a etapa tornando tudo isso concreto:
um `dados.json` fictício, anotado campo a campo, contra o schema que você
acabou de ler.

**No app:** abra a aba Config, veja as categorias/regras que já vêm prontas —
isso é o `CONFIG_PADRAO` de `model.js` na tela.

**Depois:** tente a seção A de [`EXERCICIOS.md`](./EXERCICIOS.md).

---

## Etapa 2 — o coração financeiro: cartão e totais

**Leia, nesta ordem:** [`calculos.explicado.md`](./calculos.explicado.md) →
[`faturas.explicado.md`](./faturas.explicado.md) →
[`parcelas.explicado.md`](./parcelas.explicado.md) →
[`faturasPagas.explicado.md`](./faturasPagas.explicado.md)

`calculos.js` primeiro porque ele é consumido por quase tudo mais adiante
(é a metade "leitura" do núcleo). Os outros três formam uma cadeia: uma data
de compra decide o mês da fatura (`faturas.js`), o valor se divide em
parcelas que caem nesse mês em diante (`parcelas.js`), e o valor final de
cada fatura reconcilia o que o banco informou com o que as parcelas somam
(`faturasPagas.js`) — a lógica mais sutil (e mais bug-prone historicamente,
ver `PLANO.md`) do projeto inteiro.

**No app:** cadastre um cartão de teste (Cartões → Meus cartões), lance uma
compra em 3x (Lançar → tipo Cartão), e veja as 3 parcelas aparecerem nos
3 meses certos (Cartões → Parcelas em aberto).

**Depois:** seção B de [`EXERCICIOS.md`](./EXERCICIOS.md).

---

## Etapa 3 — texto, regras e importação

**Leia, nesta ordem:** [`regras.explicado.md`](./regras.explicado.md) →
[`importar.explicado.md`](./importar.explicado.md) →
[`revisar.explicado.md`](./revisar.explicado.md)

`regras.js` primeiro porque `importar.js` o usa internamente. `importar.js`
é o arquivo mais denso do núcleo em técnica de parsing (regex, heurística
BR/US, state machine de CSV) — vá com calma, é o único arquivo do roteiro
que vale reler um trecho duas vezes. `revisar.js` fecha o ciclo: o que a
importação não conseguiu categorizar sozinha, vira fila de revisão em lote.

**No app:** exporte um extrato de teste do seu banco (ou peça um `.ofx`/`.csv`
de exemplo) e importe pela aba Importar; veja a pré-visualização, desmarque
uma linha, confirme, e depois veja o que sobrou em Revisar.

**Depois:** seção C de [`EXERCICIOS.md`](./EXERCICIOS.md).

---

## Etapa 4 — métricas e metas de longo prazo

**Leia, nesta ordem:** [`score.explicado.md`](./score.explicado.md) →
[`planejamento.explicado.md`](./planejamento.explicado.md) →
[`reserva.explicado.md`](./reserva.explicado.md) →
[`metas.explicado.md`](./metas.explicado.md)

Estes quatro são os mais independentes entre si — cada um é uma "pergunta"
diferente feita ao mesmo estado (como estou indo? gastei dentro do
orçamento? tenho reserva? quando chego na liberdade financeira?). O destaque
conceitual de `reserva.js` é o **earmark** (dinheiro carimbado, não gasto);
o de `metas.js` é a simulação de **juros compostos** mês a mês.

**No app:** defina uma meta de orçamento numa categoria (Planejar), guarde
um valor na Reserva, e veja as duas telas de Metas com números reais em vez
de zero.

**Depois:** seção D de [`EXERCICIOS.md`](./EXERCICIOS.md).

---

## Etapa 5 — a ponte: como isso vira um app de desktop

**Leia, nesta ordem:** [`storage.explicado.md`](./storage.explicado.md) →
[`main.explicado.md`](./main.explicado.md) →
[`preload.explicado.md`](./preload.explicado.md)

Até aqui, tudo era núcleo puro — nenhum arquivo tocou disco. Esta etapa
mostra a "casca": como o app decide **onde** salvar (modo portátil no
pendrive), como ele protege contra corrupção (escrita atômica, backups em
camadas), e como a segurança do Electron (`contextBridge`,
`contextIsolation`) impede a página de ter acesso direto ao sistema de
arquivos.

**No app:** vá em Config → veja "Dados salvos em: ..." (é `localDados()` na
tela) e confira que esse caminho bate com onde você rodou o app.

**Depois:** seção E de [`EXERCICIOS.md`](./EXERCICIOS.md).

---

## Etapa 6 — a interface: o que você realmente vê

**Leia, nesta ordem:** [`index.html.explicado.md`](./index.html.explicado.md)
→ [`charts.explicado.md`](./charts.explicado.md) →
[`app.css.explicado.md`](./app.css.explicado.md) →
[`app.explicado.md`](./app.explicado.md)

Deixe `app.js` por último de propósito — é o maior arquivo do projeto, e por
isso foi dividido em **7 partes** (`app.parte1.explicado.md` a
`app.parte7.explicado.md`), cada uma com um intervalo de linhas exato e sem
sobreposição. `app.explicado.md` agora é só o índice dessas partes — comece
por ele, mas o conteúdo de verdade mora nas partes. Ele **usa** tudo dos três
anteriores (o HTML vazio que preenche, os gráficos de `charts.js`, as classes
de `app.css`) e tudo do núcleo das etapas 1–4. Chegando aqui depois de todo o
resto, a maior parte do que `app.js` faz vai parecer familiar — ele não
introduz regra de negócio nova, só orquestra o que já existe.

**No app:** alterne o tema claro/escuro do seu sistema operacional e veja o
app inteiro re-temizar sozinho (é o Bloco 1 de `app.css.explicado.md` na
prática).

**Depois:** seção F de [`EXERCICIOS.md`](./EXERCICIOS.md).

---

## Etapa 7 — amarrando tudo

Os documentos que sobram não são "mais arquivos pra ler" — são ferramentas de
consulta e de contexto que você já deveria ter usado de relance ao longo do
caminho:

- **[`GLOSSARIO.md`](./GLOSSARIO.md)** — um termo que você já viu mas
  esqueceu o que significa. Consulte sob demanda, não leia de ponta a ponta.
- **[`CONCEITOS.md`](./CONCEITOS.md)** — releia inteiro agora. Os padrões que
  pareciam coincidência arquivo a arquivo (guard clause, `Set`/`Map`, clamp,
  spread imutável...) vão se revelar como um vocabulário só, reaparecendo o
  tempo todo.
- **[`FLUXOGRAMA.md`](./FLUXOGRAMA.md)** — releia inteiro agora também. Cada
  fluxo atravessa arquivos de 2 ou 3 etapas diferentes; só faz sentido
  completo depois de ter lido todas.
- **[`DECISOES.md`](./DECISOES.md)** — o "por quê" macro que nenhum arquivo
  individual cobre sozinho: por que Electron (e não PWA/Tauri), por que JS
  puro (e não React), por que JSON (e não SQLite), por que reconstruir a tela
  inteira, por que centavos, por que ESM+CommonJS convivem. Contexto histórico
  incluído — é a etapa que explica as origens das ferramentas, não só o uso.
- **[`BUILD.md`](./BUILD.md)** — como o código vira o `.AppImage`/`.exe`
  portátil, a cadeia de decisão de `pastaDados()`, e as três pegadinhas reais
  de Linux×Windows que já morderam o projeto (BOM do `.ps1`, `taskkill`,
  admin no primeiro `dist:win`).
- **[`testes.explicado.md`](./testes.explicado.md)** — os 19 testes de
  `test/core.test.mjs`, um a um: o que cada um trava e a armadilha que
  pegaria se não existisse. Leia antes da verificação final abaixo.
- **[`EXERCICIOS.md`](./EXERCICIOS.md)**, seções G e H — G é
  integração/arquitetura (se a G3, a pegadinha do earmark, fizer sentido de
  primeira, o roteiro cumpriu o que prometia); H é prática — prever saída,
  implementar função nova reusando o núcleo, e caçar um bug plantado sem
  gabarito revelado de cara.

**Verificação final:** rode `npm run test:core` e `npm run test:e2e` uma
última vez. Compare com o que `testes.explicado.md` acabou de te mostrar e
veja quantos dos comportamentos que você acabou de estudar têm um teste
travando regressão — é o `CLAUDE.md` do projeto em ação: comportamento
importante nunca fica só na cabeça de quem escreveu, fica escrito em teste.

---

## Se você só tem tempo pra uma coisa

Na dúvida, leia **[`FLUXOGRAMA.md`](./FLUXOGRAMA.md)** primeiro, de ponta a
ponta, antes de decidir por onde entrar nos arquivos individuais. Ele dá o
mapa completo em 10 minutos; qualquer arquivo que você abrir depois já vai
ter um lugar óbvio nesse mapa.
