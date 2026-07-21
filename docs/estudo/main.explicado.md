# `electron/main.js` — explicado

> **O que é este arquivo:** o **processo principal** do Electron — a única parte
> do app com acesso direto e irrestrito ao sistema operacional (arquivos,
> diálogos nativos, janela). É quem decide **onde** o `dados.json` mora, escreve
> nele com segurança, e mantém os backups. Roda em Node.js puro (CommonJS), não
> no navegador.
>
> **Papel na arquitetura:** é o lado "servidor" da ponte de persistência. A UI
> (via [`storage.js`](./storage.explicado.md)) nunca fala com este arquivo
> diretamente — só através da API estreita que o
> [`preload.js`](./preload.explicado.md) expõe. É aqui que a regra "`dados.json`
> é sagrado" do `CLAUDE.md` vira código: escrita atômica + backup automático.

---

## Bloco 0 — dois processos, um app

```js
// main.js — processo principal do Electron. Cria a janela e faz a ponte de
// arquivos (ler/salvar dados.json, exportar/importar backup). CommonJS.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
```

**Conceito por trás — o modelo de dois processos do Electron.** Todo app Electron
tem no mínimo dois "programas" rodando ao mesmo tempo:
- **Processo principal** (este arquivo): Node.js puro, sem tela, mas com acesso
  total ao SO — arquivos, diálogos, menus, ciclo de vida do app.
- **Processo de renderização** (a janela, `src/ui/index.html` + `app.js`): uma
  página web normal, sandboxed, **sem** acesso a `fs`/`path`/Node por padrão.

Os dois só se falam por **IPC** (inter-process communication) — mensagens, não
chamada de função direta. Esse isolamento é proposital: se a UI tivesse acesso
direto a `fs`, qualquer bug de XSS na renderização viraria acesso irrestrito ao
disco do usuário.

**Sintaxe — `require`, não `import`.** Note que este arquivo usa CommonJS
(`require`), enquanto todo `src/core` usa ES Modules (`import`/`export`). Não é
inconsistência: é o processo principal do Electron rodando em Node "clássico" —
o ambiente mais simples e estável para isso continua sendo CommonJS. `src/ui`
(que roda no navegador embutido) já usa `import` porque é carregado como módulo
ES pelo próprio HTML.

---

## Bloco 1 — onde mora o `dados.json` (a prioridade "modo portátil")

```js
function pastaDados() {
  if (process.env.FINANWISE_DIR) return process.env.FINANWISE_DIR;
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
  if (!app.isPackaged) return app.getAppPath();
  return app.getPath('userData');
}
const arquivoDados = () => path.join(pastaDados(), 'dados.json');
```

**O que faz.** Decide em qual pasta o `dados.json` vive, testando possibilidades
em ordem até uma bater — uma cascata de `if`s que é, na prática, uma **lista de
prioridade**.

**A ordem, e o porquê de cada item:**
1. `FINANWISE_DIR` — escape hatch manual (útil pra testes/dev: forçar uma pasta
   específica via variável de ambiente).
2. `PORTABLE_EXECUTABLE_DIR` — variável que o **próprio Electron Builder**
   define quando o `.exe` é do tipo "portable" no Windows: aponta pra pasta onde
   o `.exe` está (o pendrive, por exemplo). Isso é o que faz o app ser
   **portátil de verdade** no Windows — os dados seguem o `.exe`, não ficam
   presos numa pasta de sistema.
3. `APPIMAGE` — o equivalente no Linux: quando rodando como AppImage, essa
   variável de ambiente aponta pro caminho do próprio `.AppImage`;
   `path.dirname(...)` pega a pasta que o contém.
4. `!app.isPackaged` — modo desenvolvimento (`npm start` sem empacotar): usa a
   raiz do projeto (`app.getAppPath()`), então o `dados.json` de dev fica junto
   do código-fonte.
5. Fallback final: `app.getPath('userData')` — a pasta padrão do SO para dados
   de app (`AppData` no Windows, `~/.config` no Linux) — só usado se nenhuma das
   condições portáteis acima se aplicar.

**Conceito por trás.** Isto é a materialização direta da regra do `CLAUDE.md`:
*"portátil (roda do pendrive em Linux e Windows)"*. O código não teoriza sobre
portabilidade — ele **testa o ambiente real** (variáveis que o empacotador
define) e reage. Repare que é o mesmo idioma de "cascata de prioridade resolvida
de cima pra baixo" que aparece em [`regras.js`](./regras.explicado.md) (regras do
usuário antes das padrão) — um padrão que vale reconhecer sempre que várias
fontes concorrem pela mesma resposta.

**Armadilha.** Esta função é **impossível de testar com `test:core`** — depende
de `app` (só existe dentro do Electron rodando de verdade) e de variáveis de
ambiente específicas de cada empacotador. É por isso que ela mora em
`electron/main.js` e não em `src/core`: é puramente "casca", nunca pura.

---

## Bloco 2 — ler os dados (sem quebrar se não existir)

```js
function lerDados() {
  try {
    return fs.readFileSync(arquivoDados(), 'utf8');
  } catch {
    return null; // ainda não existe -> app começa vazio
  }
}
```

**O que faz.** Lê o arquivo; se não existir (primeira vez que o app roda ali),
devolve `null` em vez de deixar a exceção subir.

**Sintaxe:** `catch` sem parâmetro (`catch { ... }`, sem `catch (e) { ... }`) —
sintaxe válida desde ES2019 pra quando você **não precisa** do objeto de erro,
só precisa reagir ao fato de que algo falhou. Aqui, qualquer motivo de falha
(arquivo não existe, sem permissão) vira a mesma resposta: "sem dados ainda".

---

## Bloco 3 — backups datados: por que rotação

```js
// ---- Backups datados com rotação ------------------------------------------
// O app salva a CADA ação, então um backup por gravação encheria o pendrive de
// arquivos (e castigaria o flash) em poucos minutos. Regra: no máximo um backup
// a cada INTERVALO, e sempre um na primeira gravação da sessão — assim toda vez
// que o app abre existe um ponto de restauração de antes do que você fez hoje.
// Mantém os KEEP mais recentes; o resto é apagado do mais velho pro mais novo.
const pastaBackups = () => path.join(pastaDados(), 'backups');
const BACKUP_INTERVALO_MS = Number(process.env.FINANWISE_BACKUP_MIN_MS ?? 15 * 60 * 1000);
const BACKUP_MANTER = Number(process.env.FINANWISE_BACKUP_KEEP ?? 20);
let ultimoBackup = 0; // 0 = ainda não fiz nenhum nesta sessão
```

**O que faz.** Prepara as constantes do sistema de backup: a cada quanto tempo
(15 min por padrão), quantos manter (20 por padrão), e uma variável de módulo
(`ultimoBackup`) que lembra quando foi o último.

**Sintaxe:**
- `?? 15 * 60 * 1000` — *nullish coalescing*: usa o valor da env var **só** se
  ela existir (`??` não confunde `0` ou `""` com "ausente", ao contrário do
  `||`). Aqui não faria diferença prática, mas é o operador correto pra
  configuração numérica (se um dia alguém configurar o intervalo como `0`
  minuto, `||` trocaria erroneamente por 15 min; `??` respeita o `0`).
- `let ultimoBackup = 0` — variável de módulo (não dentro de nenhuma função):
  vive enquanto o processo principal estiver rodando, ou seja, é o "estado da
  sessão atual do app".

**Conceito por trás — por que não é o próprio `dados.json` mais um contador?**
Isso poderia viver dentro do próprio `dados.json` (um campo `ultimoBackupEm`),
mas seria misturar **estado do processo** com **estado financeiro** — não faz
sentido persistir/migrar/versionar junto dos dados do usuário. Fica de fora de
propósito.

---

## Bloco 4 — nomes que já vêm ordenados

```js
function nomeBackup(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `dados-${data}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

const ehBackupNosso = (n) => /^dados-\d{8}-\d{6}(-\d+)?\.json$/.test(n);
```

**O que faz.** `nomeBackup` gera nomes tipo `dados-20260720-143005.json`.
`ehBackupNosso` reconhece esse padrão (com um sufixo opcional `-2`, `-3`... pra
colisões no mesmo segundo).

**Conceito por trás — codificar ordem no nome.** `AAAAMMDDHHMMSS` como prefixo
numérico faz **ordenação alfabética de string coincidir com ordenação
cronológica** — `"20260720-143005" < "20260721-090000"` compara certo dígito por
dígito, sem nunca precisar fazer `new Date(nome)` de volta pra comparar. É o
mesmo truque, na prática, que `mesesComMovimento` explora ao ordenar chaves
`"YYYY-MM"` como texto puro (ver [`calculos.explicado.md`](./calculos.explicado.md)).

**A regex como "gate" de segurança.** `ehBackupNosso` funciona como uma lista de
permissão: **só** arquivos que batem exatamente com o padrão entram na rotação
(e por consequência, só eles podem ser apagados automaticamente). Um backup
manual do usuário (`meu-backup-importante.json`, ou até `dados-backup-final.json`
fora do padrão) nunca é tocado pela limpeza automática — mesmo estando na mesma
pasta.

**Armadilha.** Essa mesma regex protege **hoje**, mas é uma faca de dois gumes
no futuro: se o formato do nome mudar um dia (por exemplo, incluir
milissegundos), backups antigos no formato velho deixam de ser "nossos" pros
olhos do código novo — não são apagados (fica seguro), mas também não entram
mais na rotação/contagem (acumulam pra sempre, silenciosamente).

---

## Bloco 5 — a rotação em si

```js
function rotacionar(dir, manter = BACKUP_MANTER) {
  // O nome ordena cronologicamente (AAAAMMDD-HHMMSS), então ordenar por nome basta.
  const nossos = fs.readdirSync(dir).filter(ehBackupNosso).sort();
  for (const velho of nossos.slice(0, Math.max(0, nossos.length - manter))) {
    try { fs.unlinkSync(path.join(dir, velho)); } catch { /* ignore */ }
  }
}
```

**O que faz.** Lista os backups "nossos", ordena (cronologicamente, de graça,
porque o nome já é ordenável), e apaga todos exceto os `manter` mais recentes.

**Sintaxe:** `nossos.slice(0, Math.max(0, nossos.length - manter))` — se há 25
backups e `manter=20`, isso é `slice(0, 5)`: os **5 primeiros** da lista
ordenada (os mais antigos, já que ordenamos crescente) são os que sobram pra
apagar. `Math.max(0, ...)` evita `slice` com número negativo quando há **menos**
backups que o limite (nada a apagar).

**Armadilha.** `fs.unlinkSync` dentro de um `try { } catch { /* ignore */ }` —
se apagar falhar (arquivo em uso, permissão), o erro é **engolido** em silêncio.
Trade-off proposital: uma falha de limpeza não pode nunca impedir o app de
continuar funcionando — só significa que aquele arquivo específico sobrevive
mais um ciclo.

---

## Bloco 6 — quando de fato criar um backup

```js
function backupDatado(alvo) {
  const agora = Date.now();
  if (ultimoBackup && agora - ultimoBackup < BACKUP_INTERVALO_MS) return;
  try {
    const dir = pastaBackups();
    fs.mkdirSync(dir, { recursive: true });
    // Dois backups no mesmo segundo (intervalo curto) não podem se sobrescrever.
    let destino = path.join(dir, nomeBackup());
    for (let i = 2; fs.existsSync(destino); i += 1) {
      destino = path.join(dir, nomeBackup().replace(/\.json$/, `-${i}.json`));
    }
    fs.copyFileSync(alvo, destino);
    ultimoBackup = agora;
    rotacionar(dir);
  } catch { /* ignore */ }
}
```

**O que faz.** O guarda de frequência: só cria um novo backup se já passou
`BACKUP_INTERVALO_MS` desde o último (ou se este é o primeiro da sessão).

**Sintaxe — o `0` inicial como sentinela.** `if (ultimoBackup && ...)` — como
`ultimoBackup` começa em `0` (falsy), essa condição é `false` na primeira
chamada da sessão inteira, então o `return` antecipado **não** acontece e o
backup **sempre roda** na primeira gravação depois de abrir o app — exatamente o
que o comentário do Bloco 3 promete ("sempre um na primeira gravação da
sessão"). É um truque elegante, mas depende de `Date.now()` nunca
legitimamente valer `0` — verdade em qualquer data depois de 1970, então seguro
na prática.

**A guarda de colisão:** `for (let i = 2; fs.existsSync(destino); i += 1)` —
`nomeBackup()` tem resolução de 1 segundo; dois saves no mesmo segundo gerariam
o mesmo nome. Este loop testa se o nome já existe e, se sim, tenta `-2`, depois
`-3`, etc., até achar um livre. É por isso que a regex do Bloco 4 tem o grupo
opcional `(-\d+)?`.

**Conceito por trás — backup como rede de segurança, nunca como requisito.**
Repare que **tudo** aqui está dentro de um `try { } catch { /* ignore */ }` que
engloba a função inteira. Se criar a pasta falhar, se copiar falhar, se
qualquer coisa der errado — o erro morre ali. Isso é proposital e está dito no
comentário do arquivo: *"Backup é rede de segurança: se falhar, NÃO pode
derrubar a gravação do dado."* A prioridade #1 é sempre salvar o dado real; o
backup é um extra que nunca pode competir com essa prioridade.

---

## Bloco 7 — salvar de verdade (escrita atômica)

```js
function salvarDados(json) {
  const alvo = arquivoDados();
  // grava com backup: escreve num tmp e renomeia (evita corromper se cair no meio)
  const tmp = `${alvo}.tmp`;
  fs.writeFileSync(tmp, json, 'utf8');
  if (fs.existsSync(alvo)) {
    // .backup = a versão imediatamente anterior (desfazer na hora);
    // backups/ = o histórico datado (desfazer o que você só percebeu depois).
    try { fs.copyFileSync(alvo, `${alvo}.backup`); } catch { /* ignore */ }
    backupDatado(alvo);
  }
  fs.renameSync(tmp, alvo);
  return true;
}
```

**O que faz.** A gravação real do `dados.json`, com três camadas de proteção
empilhadas.

**Conceito por trás — escrita atômica via tmp+rename.** Escrever direto em cima
de `dados.json` é perigoso: se o processo morrer (queda de luz, o usuário
arranca o pendrive) **no meio** da escrita, o arquivo fica meio-escrito —
corrompido, sem chance de recuperação automática. A técnica aqui:
1. Escreve o conteúdo **novo inteiro** num arquivo separado (`dados.json.tmp`).
2. Só então `fs.renameSync(tmp, alvo)` — um rename é, na prática, uma operação
   **atômica** no sistema de arquivos (POSIX e, majoritariamente, NTFS): ou o
   arquivo de destino vira o novo conteúdo por completo, ou (se cair antes do
   rename) o `dados.json` original permanece intacto. **Nunca existe um estado
   "meio trocado."**

**As duas camadas de backup, e a diferença de propósito:**
- `${alvo}.backup` — cópia da versão **imediatamente anterior**, sobrescrita a
  cada save. Serve pra "acabei de bagunçar algo, desfaz rapidinho".
- `backups/dados-AAAAMMDD-HHMMSS.json` (o sistema dos Blocos 3–6) — histórico
  **datado e limitado** (até `BACKUP_MANTER` cópias). Serve pra "percebi um
  problema dias depois, preciso voltar a um ponto no tempo".

Juntas, essas três camadas (tmp+rename, `.backup`, `backups/`) são a
implementação concreta da regra do `CLAUDE.md`: *"Integridade dos dados:
`dados.json` é sagrado (...) sempre com backup."*

**Armadilha.** Se dois saves acontecessem **verdadeiramente em paralelo**, ambos
escreveriam no mesmo `dados.json.tmp` e um `rename` corromperia o outro. Isso
não acontece na prática aqui porque cada chamada IPC (`ipcMain.handle`) é
processada uma de cada vez e o app tem uma única janela — mas é uma suposição
implícita do código, não uma garantia explícita (não há lock de arquivo).

---

## Bloco 8 — a janela, e o par que garante segurança

```js
function criarJanela() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#14161c',
    title: 'Finan',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'src', 'ui', 'index.html'));
}
```

**O que faz.** Cria a janela do app com as dimensões/aparência definidas e
carrega o HTML da UI.

**Sintaxe/conceito — o par de segurança em `webPreferences`:**
- `nodeIntegration: false` — a página carregada **não** tem acesso a `require`,
  `fs`, `process`, nada de Node. É só uma página web comum.
- `contextIsolation: true` — mesmo o `preload.js` (que **tem** acesso a Node)
  roda num escopo JavaScript **separado** do da página. Sem isso, a página
  poderia manipular objetos globais do preload e "escapar" pra Node de outras
  formas.
- `preload: path.join(__dirname, 'preload.js')` — o **único** canal permitido:
  o que quer que o preload decida expor via `contextBridge` (ver
  [`preload.js`](./preload.explicado.md)) é tudo que a página ganha.

Essas três linhas juntas são a receita padrão e recomendada do Electron pra
"página web comum, sem superpoderes, com uma porta estreita e controlada pro
sistema operacional". Tirar qualquer uma delas (por exemplo, ligar
`nodeIntegration`) abriria a porta pra qualquer XSS na UI virar acesso total ao
disco do usuário.

**`backgroundColor: '#14161c'`** — evita o "flash branco" entre a janela abrir
e o HTML/CSS terminar de carregar (a cor de fundo já bate com o tema escuro do
app antes mesmo do CSS chegar).

---

## Bloco 9 — IPC: o menu de operações que a UI pode pedir

```js
ipcMain.handle('dados:ler', () => lerDados());
ipcMain.handle('dados:salvar', (_e, json) => salvarDados(json));
ipcMain.handle('dados:caminho', () => arquivoDados());

ipcMain.handle('dados:exportar', async (_e, json, nomeSugerido) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar backup',
    defaultPath: nomeSugerido || 'finanwise-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, json, 'utf8');
  return path.basename(filePath);
});

ipcMain.handle('dados:importar', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Importar backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  return fs.readFileSync(filePaths[0], 'utf8');
});
```

**O que faz.** Registra 5 canais nomeados (`'dados:ler'`, `'dados:salvar'`...)
que a UI pode "chamar" via IPC. Cada `ipcMain.handle(canal, fn)` diz: "quando a
UI pedir por este canal, rode `fn` aqui no processo principal e devolva o
resultado."

**Sintaxe:**
- `ipcMain.handle` (não `ipcMain.on`) — a diferença importa: `.handle` é
  **requisição/resposta** (a UI faz `invoke(canal)` e recebe uma `Promise` com o
  retorno de `fn`); `.on`/`.send` seria "dispara e esquece", sem resposta. Como
  a UI sempre precisa de uma resposta (o conteúdo lido, o caminho, etc.),
  `.handle` é a escolha certa em todos os 5 canais.
- `(_e, json) => ...` — todo handler de IPC recebe o "evento" como primeiro
  argumento; `_e` (com underscore) é a convenção pra "este parâmetro existe
  porque a assinatura exige, mas não vou usá-lo".
- `dialog.showSaveDialog` / `showOpenDialog` — caixas de diálogo **nativas** do
  sistema operacional (a mesma janela "Salvar como" que qualquer outro programa
  do SO mostra) — não são HTML, o Electron fala direto com o SO.

**Conceito por trás — a superfície de API é exatamente estes 5 nomes.** Compare
com [`preload.js`](./preload.explicado.md): os 5 métodos que ele expõe
(`ler`, `salvar`, `caminho`, `exportar`, `importar`) mapeiam 1-para-1 com estes 5
canais. Não há como a UI pedir nada além disso — a superfície de ataque possível
(o que um bug na UI *poderia* fazer de pior) é exatamente estas 5 operações,
nada mais.

---

## Bloco 10 — ciclo de vida do app

```js
app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

**O que faz.** `whenReady()` — só cria a janela quando o Electron terminou de
inicializar. `activate` — recria a janela se o app for "reativado" sem janelas
abertas (dock do mac). `window-all-closed` — decide se o processo inteiro deve
morrer quando a última janela fecha.

**Conceito por trás — a convenção mac vs. resto do mundo.** `process.platform
!== 'darwin'` é uma bifurcação **intencional** por SO — a única deste arquivo.
No macOS, a convenção de UX é o app **continuar rodando** (visível no dock)
mesmo sem janelas abertas, até o usuário fechar explicitamente (Cmd+Q); no
Windows/Linux, fechar a última janela = sair do app. Isso não fere a regra de
"nada de SO-específico" do `CLAUDE.md` — é boilerplate padrão do próprio
Electron, presente até em templates oficiais, e o FinanWise não empacota pra
mac hoje; o código simplesmente herda o padrão inteiro por completude.

---

## Mapa mental

```
        app.whenReady() ──► criarJanela() ──► carrega index.html (preload.js na ponte)
                                                        │
                              window.finanwise.*  (definido no preload)
                                                        │  IPC (invoke/handle)
                                                        ▼
        ┌──────────────────────────── electron/main.js ─────────────────────────────┐
        │  pastaDados()  → prioridade: env var > portable > AppImage > dev > userData│
        │  lerDados()    → readFileSync ou null                                      │
        │  salvarDados() → escreve .tmp → renomeia (atômico) → dispara backups       │
        │                                    │                                       │
        │                     .backup (última versão)   backups/ (histórico datado,  │
        │                                                 rotação por BACKUP_MANTER) │
        └──────────────────────────────────────────────────────────────────────────┘
```

## Conceitos que apareceram

| Conceito | Onde | Ideia de uma frase |
|---|---|---|
| **Processo principal vs. renderização** | o arquivo inteiro | só o principal tem acesso a SO; a UI só fala por IPC |
| **CommonJS (`require`) vs. ESM (`import`)** | topo do arquivo | ambiente Node "clássico" do processo principal |
| **Cascata de prioridade por ambiente** | `pastaDados()` | testa variáveis reais do empacotador, do mais específico ao fallback |
| **Nome de arquivo ordenável = timestamp no prefixo** | `nomeBackup`/`ehBackupNosso` | ordenar strings ordena o tempo, sem parsear datas |
| **Regex como allowlist de segurança** | `ehBackupNosso` | só o que bate o padrão entra na rotação automática |
| **`0` como sentinela "ainda não aconteceu"** | `ultimoBackup` | falsy no início força o primeiro backup da sessão |
| **Escrita atômica via tmp+rename** | `salvarDados` | rename é atômico; nunca existe arquivo "meio escrito" |
| **Backup como rede de segurança, não requisito** | `try/catch` cobrindo tudo | falhar o backup não pode falhar o save real |
| **`contextIsolation` + `nodeIntegration:false` + preload** | `criarJanela` | o trio que impede a UI de ter acesso direto a Node |
| **IPC requisição/resposta (`handle`/`invoke`)** | os 5 canais `dados:*` | a UI sempre espera uma resposta, nunca dispara-e-esquece |

**Próximo:** [`preload.js`](./preload.explicado.md) — o arquivo mais curto dos
três, mas o que de fato define a fronteira de segurança: a única porta entre a
página e o processo principal.
