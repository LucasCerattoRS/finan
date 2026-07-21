# Mapa da arquitetura — comece por aqui

> A visão de cima, antes de mergulhar em qualquer arquivo. Este documento
> responde três perguntas: **o que mora onde**, **por onde o app começa**, e
> **quais padrões se repetem** em todo lugar. Os detalhes de cada arquivo moram
> nos `.explicado.md`; a ordem de leitura mora no [`ROTEIRO.md`](./ROTEIRO.md).

## A árvore de pastas (só o que importa)

```
finanwise/
├── package.json           ← identidade do projeto + todos os comandos (ver BUILD.md)
├── electron/              ← a CASCA desktop — processo principal (CommonJS)
│   ├── main.js            ← cria a janela, decide ONDE salvar, escrita atômica + backups, IPC
│   └── preload.js         ← a ponte segura: contextBridge expõe window.finanwise (5 métodos)
├── src/
│   ├── core/              ← o NÚCLEO PURO: sem DOM, sem disco, sem Electron. 100% testável.
│   │   ├── index.js       ← fachada: re-exporta tudo + operações de mutação (estado novo)
│   │   ├── model.js       ← schema, estado inicial, migração, dinheiro (centavos), datas
│   │   ├── faturas.js     ← ┐
│   │   ├── parcelas.js    ← ├ a cadeia do cartão: em que mês cai → vira N parcelas →
│   │   ├── faturasPagas.js← ┘ quanto custa/quanto falta pagar
│   │   ├── calculos.js    ← totais, saldos, séries, gasto por categoria (só LEITURA)
│   │   ├── score.js / planejamento.js / reserva.js / metas.js  ← as métricas
│   │   └── regras.js / importar.js / revisar.js  ← texto, extratos, categorização
│   ├── ui/
│   │   ├── index.html     ← esqueleto mínimo: um <main id="view"> vazio
│   │   ├── app.js         ← TODA a interface (1183 linhas — estudada em 7 partes)
│   │   ├── charts.js      ← gráficos desenhados à mão, em SVG
│   │   └── storage.js     ← persistência com fallback: Electron (IPC) ou localStorage
│   └── styles/app.css     ← tema claro/escuro automático + layout
├── test/core.test.mjs     ← a rede de segurança do núcleo (node:test, zero dependências)
├── scripts/               ← utilitários, sempre em PAR por SO: *.sh (Linux) + *.ps1 (Windows)
└── docs/
    ├── ARQUITETURA.md     ← modelo de dados + regras herdadas da planilha (doc do repo)
    └── estudo/            ← você está aqui
```

**Fora do git, de propósito:** `dados.json`, `*.backup`, `backups/` — dado
financeiro real nunca é versionado (está no `.gitignore`). Por isso os exemplos
de estudo usam o [`EXEMPLO-DADOS.md`](./EXEMPLO-DADOS.md), um estado fictício.

## Ponto de entrada e cadeia de boot

`npm start` roda `electron .` → o Electron lê `"main": "electron/main.js"` no
`package.json` → `main.js` cria a `BrowserWindow` (com `preload.js` injetado e
`contextIsolation: true`) e carrega `src/ui/index.html` → o HTML importa
`app.js` como ES module → `init()` (fim do `app.js`) pede os dados via
`storage.js` → que chama `window.finanwise.ler()` (a ponte do preload) → que
via IPC chega de volta ao `main.js`, único processo com acesso a disco →
`carregar()` do núcleo migra/valida o JSON → `render()` desenha a primeira tela.

O desenho completo, seta a seta, é o **Fluxo 1** do
[`FLUXOGRAMA.md`](./FLUXOGRAMA.md).

## A stack — e por que ela é tão curta

| Camada | Tecnologia | Papel |
|---|---|---|
| Desktop | **Electron 33** | única dependência de runtime: Chromium + Node numa janela |
| Empacotamento | **electron-builder 25** (dev) | gera AppImage (Linux) e .exe portátil (Windows) |
| UI | **JavaScript puro (ES modules)** | sem React, sem bundler, sem transpiler |
| Gráficos | **SVG à mão** (`charts.js`) | sem biblioteca de chart |
| Dados | **um arquivo JSON** | sem banco, sem ORM |
| Testes | **node:test** | sem Jest/Vitest |

Isso não é acidente nem limitação — é uma decisão com trade-offs pensados
(offline, portátil em pendrive, um mantenedor, zero cadeia de suprimentos).
O raciocínio completo de cada escolha, incluindo "por que NÃO a alternativa
famosa", está no [`DECISOES.md`](./DECISOES.md).

## Os padrões-mestres (o vocabulário que se repete em tudo)

| Padrão | Uma frase | Onde é ensinado |
|---|---|---|
| **Núcleo puro / casca impura** | `src/core` seria verdade até num servidor sem tela; DOM e disco só na borda | [`CONCEITOS.md`](./CONCEITOS.md) tema 1, [`index.explicado.md`](./index.explicado.md) |
| **`(estado, dados) → novo estado`** | toda mutação devolve uma cópia nova; nada é alterado no lugar | [`index.explicado.md`](./index.explicado.md), CONCEITOS tema 2 |
| **Dinheiro em centavos** | converte na entrada, soma em inteiro, divide por 100 uma vez na saída | [`model.explicado.md`](./model.explicado.md), CONCEITOS tema 5 |
| **Derive, don't store** | parcelas, meses e saldos são calculados dos dados, nunca gravados | [`parcelas.explicado.md`](./parcelas.explicado.md), FLUXOGRAMA fluxo 3 |
| **Render total** | qualquer mudança → `persistir()` salva, `render()` reconstrói `#view` do zero | [`app.explicado.md`](./app.explicado.md), FLUXOGRAMA fluxo 7 |
| **Migração tolerante** | todo JSON lido passa por `migrar()`; campo desconhecido sobrevive | [`model.explicado.md`](./model.explicado.md) |
| **Par `.sh`/`.ps1`** | utilitário de SO existe em dupla; mexeu num, confira o irmão | [`BUILD.md`](./BUILD.md) |

**Regra de bolso para se localizar:** se a pergunta é "quanto/quando/como se
calcula" → `src/core`. Se é "como aparece na tela" → `src/ui`. Se é "onde o
arquivo é salvo / como vira app" → `electron/` + `scripts/` (ver
[`BUILD.md`](./BUILD.md)).
