# `electron/preload.js` — explicado

> **O que é este arquivo:** o mais curto dos três da ponte, mas o mais
> importante pra segurança. É o **único lugar** onde algo do processo principal
> (Node/Electron) atravessa pra dentro da página. Roda antes do HTML carregar,
> num contexto especial que enxerga tanto Node quanto (em breve) a página.
>
> **Papel na arquitetura:** o meio-termo entre
> [`electron/main.js`](./main.explicado.md) (quem responde de verdade) e
> [`src/ui/storage.js`](./storage.explicado.md) (quem chama, achando que está só
> usando `window.finanwise`).

---

## Bloco único — a ponte inteira

```js
// preload.js — expõe uma API mínima e segura para a UI (window.finanwise).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finanwise', {
  ler: () => ipcRenderer.invoke('dados:ler'),
  salvar: (json) => ipcRenderer.invoke('dados:salvar', json),
  caminho: () => ipcRenderer.invoke('dados:caminho'),
  exportar: (json, nome) => ipcRenderer.invoke('dados:exportar', json, nome),
  importar: () => ipcRenderer.invoke('dados:importar'),
});
```

**O que faz.** Cria um objeto global `window.finanwise` **dentro da página**,
com exatamente 5 métodos. Cada método, quando chamado, dispara um `invoke` de
IPC pro canal correspondente em `electron/main.js` e devolve a `Promise` do
resultado.

**Sintaxe:**
- `contextBridge.exposeInMainWorld(nome, objeto)` — a **única** API sancionada
  do Electron pra isso, quando `contextIsolation: true` está ligado (ver Bloco 8
  de [`main.js`](./main.explicado.md)). Sem `contextBridge`, não há como um
  script com acesso a Node entregar algo pra página com segurança.
- `ipcRenderer.invoke(canal, ...args)` — o lado "cliente" do par
  `ipcMain.handle(canal, fn)`: manda a mensagem e devolve uma `Promise` que
  resolve com o que `fn` retornar do outro lado.
- Cada método aqui é uma **função de uma linha** que só repassa argumentos —
  não há lógica nenhuma neste arquivo, só encanamento.

**Conceito por trás — por que não expor `ipcRenderer` inteiro?** Uma tentação
comum (e perigosa) seria `exposeInMainWorld('ipc', ipcRenderer)` — exporia
`invoke` genérico, deixando a página chamar **qualquer** canal, inclusive
`dados:salvar` com argumentos arbitrários vindos de qualquer lugar, ou canais
que um dev adicione no futuro sem pensar nas implicações de segurança. Ao invés
disso, este arquivo expõe **5 verbos fixos e nomeados**
(`ler`/`salvar`/`caminho`/`exportar`/`importar`) — uma *allowlist* fechada. É o
princípio do menor privilégio: a página ganha exatamente a capacidade que
precisa, nem uma a mais.

**Conceito por trás — `contextIsolation` na prática.** Mesmo este arquivo tendo
`require('electron')` (acesso real a Node), o `contextBridge` garante que o
objeto que ele cria em `window.finanwise` seja uma cópia segura, isolada do
escopo onde o `require` existe. A página nunca vê `contextBridge`, nunca vê
`ipcRenderer` — só vê os 5 métodos finais.

**Armadilha — a simetria com `main.js` não é verificada por nenhuma
ferramenta.** Os nomes dos canais (`'dados:ler'`, `'dados:salvar'`, ...) aqui
precisam bater **exatamente** com os registrados em `ipcMain.handle(...)` em
`main.js` — são strings soltas nos dois arquivos, sem import compartilhado, sem
tipo, sem checagem em tempo de compilação. Um typo em qualquer um dos dois lados
(`'dados:ller'`) não dá erro de sintaxe: a `Promise` de `invoke` simplesmente
rejeita em tempo de execução, e só se descobre testando (ou lendo o erro no
DevTools). Se algum dia crescer, vale considerar extrair os nomes de canal pra
uma lista de constantes compartilhada entre os dois arquivos.

---

## Mapa mental

```
  src/ui/storage.js               electron/preload.js                electron/main.js
  window.finanwise.ler() ──────►  ipcRenderer.invoke('dados:ler') ──► ipcMain.handle('dados:ler', lerDados)
                                  (contextBridge: só isso atravessa)
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **`contextBridge.exposeInMainWorld`** | única forma segura de cruzar o contextIsolation | só o que é passado aqui existe do lado da página |
| **`ipcRenderer.invoke` ↔ `ipcMain.handle`** | par cliente/servidor do IPC | mesmo canal nomeado dos dois lados |
| **Allowlist estreita, não API genérica** | 5 métodos fixos, não um `invoke` cru | menor privilégio: a página só pode o que precisa |
| **Simetria de nomes não verificada em compilação** | strings de canal repetidas nos 2 arquivos | typo só aparece rodando, não é erro de sintaxe |

**Próximo:** com a ponte inteira documentada (`storage.js` ↔ `preload.js` ↔
`main.js`), o roteiro segue pra UI de verdade — começando por `index.html` (a
estrutura da página que tudo isso serve).
