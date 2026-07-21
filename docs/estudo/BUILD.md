# Build, empacotamento e portabilidade

> Como o código vira um app de verdade — que roda do pendrive num Linux e num
> Windows — e as pegadinhas reais que já morderam este projeto. Fonte:
> `package.json`, `electron/main.js` (função `pastaDados`) e `scripts/`.

## Os comandos (`package.json` → `scripts`)

| Comando | O que faz |
|---|---|
| `npm start` | `electron .` — abre o app em modo dev (dados na raiz do projeto) |
| `npm run test:core` | `node --test test/*.test.mjs` — testa o núcleo puro em segundos |
| `npm run test:e2e` | `scripts/smoke-electron.mjs` — sobe o Electron DE VERDADE e dirige a UI pelo DevTools Protocol, numa pasta temporária (`FINANWISE_DIR`), sem tocar nos seus dados |
| `npm run dist:linux` | `electron-builder --linux AppImage` — gera `dist/Finan-*.AppImage` |
| `npm run dist:win` | `electron-builder --win portable` — gera o `.exe` portátil |
| `npm run pendrive:linux` / `pendrive:win` | copia app + código pro pendrive (regras abaixo) |
| `npm run atalho:linux` / `atalho:win` | instala atalho no sistema |
| `npm run atalho-pendrive:*` | idem, apontando pro app do pendrive |
| `npm run categorias:exportar` / `importar` | leva/traz categorias e regras entre máquinas |

Repare no padrão: **todo utilitário de SO é um par** — `foo.sh` (Linux) e
`foo.ps1` (Windows), com o npm script sufixado (`:linux`/`:win`). O núcleo e o
Electron são cross-platform de graça; os scripts de sistema não têm como ser.
Regra do projeto: mexeu num lado do par, confira se o irmão precisa da mesma
mudança.

## Onde os dados moram — a decisão mais importante do `main.js`

`pastaDados()` decide onde fica o `dados.json`, testando nesta ordem:

1. **`FINANWISE_DIR`** (variável de ambiente) — override explícito; é assim que
   o teste e2e roda numa pasta temporária sem encostar nos seus dados.
2. **`PORTABLE_EXECUTABLE_DIR`** — definida pelo empacotador portable do
   Windows: os dados ficam **na pasta do `.exe`** (ou seja, no pendrive).
3. **`APPIMAGE`** — definida pelo runtime do AppImage: dados **ao lado do
   `.AppImage`** (idem, pendrive).
4. **Dev** (não empacotado) — raiz do projeto.
5. **Fallback** — `userData` do SO (app instalado "normal").

É essa cadeia que faz o mesmo binário ser "portátil" sem nenhuma configuração:
o app olha em volta e conclui onde está. Consequência estudada em
[⚠️ os dados podem existir em mais de um lugar]: rodar o app de lugares
diferentes cria `dados.json` diferentes — no uso real, a fonte da verdade é o
do pendrive.

## O pendrive (`scripts/sync-pendrive.*`)

Duas regras de segurança do script, ambas deliberadas:

- **Nunca sobrescreve o `dados.json` do pendrive** — ele é o histórico real.
  O script copia o app (`Finan.AppImage`/`Finan.exe`) e o código, jamais os dados.
- **O código vai via `git archive`** — só o que está versionado. Como
  `dados.json`/`backups/` estão no `.gitignore`, dado financeiro real **não
  tem como vazar** junto com a cópia do código.

Detalhe de sistema de arquivos: pendrive costuma ser exFAT/FAT32, que **não
tem bit de execução** — o `chmod +x` é ignorado (quem dá o "+x" é a opção de
montagem). O script já sabe disso e não falha por causa do `chmod`.

## As pegadinhas que já morderam (documentadas no `CLAUDE.md` do repo)

1. **`.ps1` precisa de UTF-8 COM BOM.** O PowerShell 5.1 (o que vem no
   Windows) assume ANSI quando não há BOM — e um script salvo em UTF-8 "puro"
   tem os acentos corrompidos silenciosamente. Salvou um `.ps1` novo? Confira
   o encoding.
2. **Windows não tem process group.** No Linux, matar uma árvore de processos
   é `kill(-pid)`. No Windows isso não existe — é `taskkill /t /f`. O teste
   e2e precisa disso para derrubar o Electron e seus filhos.
3. **O primeiro `npm run dist:win` numa máquina nova exige terminal
   administrador** — o electron-builder extrai o `winCodeSign`, que contém
   symlinks, e criar symlink no Windows exige privilégio (ou Developer Mode).
   Nas execuções seguintes o cache já existe e o admin não é mais necessário.

## O que o `electron-builder` empacota

O bloco `"build"` do `package.json` define: `appId: com.lukas.finan`, produto
"Finan", e a lista `files` — **só** `electron/**`, `src/**` e `package.json`
entram no binário. Nada de `docs/`, `test/`, `scripts/` — e, principalmente,
nada de dados. Alvos: AppImage no Linux, portable no Windows — os dois únicos
formatos que rodam **sem instalação**, condição para viver num pendrive.

---

**Relacionado:** [`main.explicado.md`](./main.explicado.md) (escrita atômica e
backups), [`storage.explicado.md`](./storage.explicado.md) (fallback
localStorage), [`DECISOES.md`](./DECISOES.md) (por que Electron/portable).
