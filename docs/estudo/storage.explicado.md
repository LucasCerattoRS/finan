# `src/ui/storage.js` — explicado

> **O que é este arquivo:** a **ponte de persistência**. É a última parada antes do
> disco: quem chama estas funções não sabe (nem precisa saber) se está rodando
> dentro do Electron ou num navegador comum — as duas implementações têm a
> **mesma assinatura**, então o resto da UI nunca se importa com qual delas está
> ativa.
>
> **Papel na arquitetura:** é a borda externa da "casca impura". Depende de
> [`core/index.js`](./index.explicado.md) (`carregar`, `estadoInicial`) para
> interpretar/migrar os bytes que lê — este arquivo só sabe *buscar* e *guardar*
> bytes, nunca o que eles significam. Do lado Electron, quem responde de verdade é
> [`electron/main.js`](./main.explicado.md), através da ponte definida em
> [`preload.js`](./preload.explicado.md).

---

## Bloco 0 — o cabeçalho e a estratégia de dois modos

```js
// storage.js — persistência. Usa a ponte do Electron (window.finanwise) quando
// disponível; senão cai no localStorage (modo navegador). Mesma interface.

import { carregar, estadoInicial } from '../core/index.js';

const LS_KEY = 'finanwise:dados';
const temElectron = () => typeof window !== 'undefined' && window.finanwise;
```

**O que faz.** Define uma única pergunta — "estou dentro do Electron?" — e usa a
resposta pra decidir onde ler/escrever. `temElectron()` é *feature detection*, não
*platform detection*: não pergunta "é Windows ou Linux?", pergunta "existe
`window.finanwise`?".

**Sintaxe:**
- `typeof window !== 'undefined'` — protege contra ambientes sem `window` (ex.:
  este módulo sendo avaliado fora de um navegador).
- `&& window.finanwise` — `window.finanwise` só existe se o `preload.js` (ver
  adiante) rodou e chamou `contextBridge.exposeInMainWorld('finanwise', ...)`.

**Conceito por trás — Adapter (mesma interface, backends diferentes).** Cada função
pública deste arquivo (`carregarEstado`, `salvarEstado`, ...) tem exatamente **um**
corpo, mas dentro dele um `if (temElectron())` escolhe a implementação. Quem chama
nunca vê essa bifurcação. É o padrão *Adapter*: duas fontes de dados completamente
diferentes (IPC do Electron vs. Web Storage API) atrás de uma fachada idêntica.

**Alternativa/trade-off.** Uma alternativa comum é *dependency injection* — passar o
"backend" como parâmetro (`carregarEstado(backend)`). Aqui optou-se por detecção
automática porque só existem dois backends possíveis e a decisão é sempre a mesma
dentro de uma sessão (o app não troca de Electron pra navegador em tempo de
execução) — DI valeria a pena se houvesse mais backends ou se precisasse trocar em
testes.

---

## Bloco 1 — carregar e salvar

```js
export async function carregarEstado() {
  try {
    if (temElectron()) {
      const json = await window.finanwise.ler();
      return carregar(json || null);
    }
    return carregar(localStorage.getItem(LS_KEY));
  } catch (e) {
    console.error('Falha ao carregar; começando vazio.', e);
    return estadoInicial();
  }
}

export async function salvarEstado(estado) {
  const json = JSON.stringify(estado, null, 2);
  if (temElectron()) {
    await window.finanwise.salvar(json);
  } else {
    localStorage.setItem(LS_KEY, json);
  }
}
```

**O que faz.** `carregarEstado` busca o JSON bruto (de onde for) e entrega pro
`carregar()` do núcleo, que valida/migra e devolve um estado utilizável.
`salvarEstado` faz o caminho inverso: serializa e escreve.

**Sintaxe:**
- `async function` **mesmo quando o backend é síncrono.** `localStorage.getItem` é
  síncrono de verdade, mas a função ainda é `async` — porque o **outro** ramo
  (`window.finanwise.ler()`, que atravessa IPC) é assíncrono por natureza. Uma
  função só tem uma assinatura; como um dos dois caminhos *precisa* ser `async`,
  os dois são. Quem chama sempre dá `await`, não importa o backend.
- `JSON.stringify(estado, null, 2)` — o `2` é a indentação (2 espaços). É o que
  faz o `dados.json` salvo no disco ser legível por humano (abrir num editor de
  texto e entender), não uma linha só comprimida.
- `carregar(json || null)` — se `json` for string vazia, `null`, ou `undefined`,
  o `||` normaliza tudo para `null` antes de entregar pro núcleo, que sabe tratar
  "sem dado ainda" como um caso só.

**Conceito por trás — onde mora a fronteira "puro vs. impuro".** Note a divisão de
trabalho: **este arquivo não entende a estrutura do estado.** Ele não sabe o que é
`schemaVersion`, não sabe migrar, não valida nada — só move bytes. Toda a
inteligência de "isso é um dado válido? precisa de migração?" mora em `carregar()`
(núcleo, puro, testável). `storage.js` é 100% casca: I/O sem regra de negócio. É a
mesma separação que o `CLAUDE.md` pede — núcleo puro, UI com efeito colateral —
vista em código real.

**Armadilha.** O `catch` do `carregarEstado` engole **qualquer** erro (disco
ilegível, IPC quebrada, JSON corrompido) e devolve silenciosamente um estado vazio
(`estadoInicial()`). Do ponto de vista do usuário isso é ótimo (o app nunca trava
na tela branca) — mas um `dados.json` corrompido vira um app "vazio" sem aviso
nenhum na tela, só um `console.error` que ninguém vê fora do DevTools. É por isso
que o `electron/main.js` mantém backups datados: se isso acontecer, a recuperação
existe, mesmo que o app não grite sozinho.

---

## Bloco 2 — onde estão os dados (para a tela de Config)

```js
export async function localDados() {
  if (temElectron()) return await window.finanwise.caminho();
  return 'Navegador (localStorage)';
}
```

**O que faz.** Só informativo: devolve uma string pra mostrar na tela de
Configurações ("seus dados estão em: ..."). Não afeta nada, é transparência.

---

## Bloco 3 — exportar backup

```js
export async function exportarBackup(estado) {
  const json = JSON.stringify(estado, null, 2);
  const nome = `finanwise-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (temElectron()) {
    return await window.finanwise.exportar(json, nome);
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
  return nome;
}
```

**O que faz.** Gera um arquivo de backup nomeado por data. No Electron, pede pro
processo principal abrir uma caixa de diálogo "Salvar como" de verdade. No
navegador, dispara o download usando só APIs do browser.

**Sintaxe — o truque do download no navegador (sem backend nenhum):**
1. `new Blob([json], {type: 'application/json'})` — empacota a string como um
   arquivo "virtual" em memória.
2. `URL.createObjectURL(blob)` — o browser gera uma URL temporária
   (`blob:...`) que aponta pra esse arquivo em memória.
3. Cria um `<a>` **que nunca entra na tela** (não é anexado ao `document`), seta
   `href` pra essa URL e `download` pro nome do arquivo, e chama `.click()` nele
   programaticamente — simulando um clique de usuário num link de download.
4. `URL.revokeObjectURL(url)` — libera a memória depois do clique; sem isso, a
   URL temporária vazaria memória (ficaria viva até a aba fechar).

**Conceito por trás.** Não existe API "baixar um arquivo" direta em JavaScript de
navegador — isso é o *idioma padrão* pra simular. Vale reconhecer porque aparece
em praticamente todo app web que gera CSV/JSON/PDF no cliente sem backend.

**`new Date().toISOString().slice(0, 10)`** — outro idioma recorrente: ISO
`"2026-07-20T14:30:00.000Z"`, corta os 10 primeiros caracteres → `"2026-07-20"`.
Data no nome do arquivo, sem depender de biblioteca de datas.

---

## Bloco 4 — importar backup

```js
export async function importarBackup() {
  if (temElectron()) {
    const json = await window.finanwise.importar();
    return json ? carregar(json) : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(carregar(reader.result));
      reader.readAsText(file);
    };
    input.click();
  });
}
```

**O que faz.** Caminho inverso do export: abre um seletor de arquivo (nativo no
Electron, um `<input type="file">` no navegador) e devolve o estado já migrado
por `carregar()` — pronto pra uso, mas **ainda não salvo** (quem chama decide se
confirma antes de persistir).

**Sintaxe — transformando um input de arquivo (baseado em evento) num
`Promise`:**
- `document.createElement('input')` + `input.type = 'file'` — cria um seletor de
  arquivo sem precisar dele existir no HTML.
- `input.onchange = () => {...}` — o evento dispara quando o usuário escolhe (ou
  cancela) um arquivo.
- `new FileReader()` + `.readAsText(file)` + `.onload` — a API padrão do browser
  pra ler o conteúdo de um arquivo escolhido pelo usuário como texto.
- O `input.click()` programático abre a caixa de diálogo do SO — igual ao truque
  do Bloco 3, mas pra abrir em vez de salvar.
- Tudo isso embrulhado num `new Promise((resolve) => {...})`: o código que
  **chama** `importarBackup()` só precisa de um `await`, sem se importar que por
  baixo existem três callbacks aninhados (`onchange` → `onload` → `resolve`).

**Conceito por trás — promisificar uma API baseada em callback.** APIs antigas do
browser (input de arquivo, `FileReader`) foram desenhadas numa era pré-Promise:
tudo é callback/evento. `new Promise((resolve, reject) => {...})` é o jeito
padrão de "embrulhar" essas APIs pra que o resto do código moderno (`async/await`)
possa tratá-las como qualquer outra operação assíncrona.

**Armadilha.** Repare que nenhum dos dois caminhos (Electron ou browser) chama
`resolve`/`reject` em caso de erro de leitura — se `FileReader` falhar,
`onload` simplesmente nunca dispara e a Promise fica **pendente para sempre**
(nem resolve nem rejeita). Um `reader.onerror` não foi implementado. É um roteiro
"caminho feliz": funciona bem quando o usuário escolhe um arquivo legível, mas um
arquivo corrompido/sem permissão trava a espera silenciosamente. Vale saber
reconhecer esse padrão de Promise-sem-reject como um risco ao herdar código assim.

---

## Mapa mental

```
        carregarEstado() / salvarEstado() / exportarBackup() / importarBackup()
                                    │
                    temElectron()? ─┴─ (feature detection, não platform detection)
                   SIM │                              │ NÃO
                       ▼                              ▼
            window.finanwise.*              localStorage / Blob+<a> / <input type=file>
            (IPC → electron/main.js)         (APIs nativas do navegador)
                       │                              │
                       └──────────────┬───────────────┘
                                      ▼
                    carregar() do núcleo (valida/migra — não é tarefa deste arquivo)
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Adapter / mesma interface, backends diferentes** | `temElectron()` em cada função | quem chama nunca sabe qual backend respondeu |
| **Feature detection** | `typeof window !== 'undefined' && window.finanwise` | pergunta "existe a capacidade?", não "qual SO é este?" |
| **`async` contamina a assinatura inteira** | `carregarEstado`/`salvarEstado` | um caminho assíncrono obriga a função toda a ser `async` |
| **Blob + ObjectURL + `<a download>`** | `exportarBackup` | o idioma padrão pra "baixar arquivo" sem backend |
| **Promisificar callback/evento** | `importarBackup` | embrulhar `onchange`/`onload` num `new Promise` |
| **Casca fina, sem regra de negócio** | o arquivo inteiro | migração/validação ficam no núcleo (`carregar`), aqui só se move bytes |

**Próximo:** [`electron/main.js`](./main.explicado.md) — o processo principal que
responde do outro lado da ponte: onde o `dados.json` realmente mora, e o sistema
de backups com rotação.
