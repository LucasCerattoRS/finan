// main.js — processo principal do Electron. Cria a janela e faz a ponte de
// arquivos (ler/salvar dados.json, exportar/importar backup). CommonJS.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Onde guardar o dados.json. Prioriza modo PORTÁTIL (pendrive):
//  - Windows portable: PORTABLE_EXECUTABLE_DIR (pasta do .exe)
//  - Linux AppImage: pasta do próprio .AppImage
//  - Dev (não empacotado): raiz do projeto
//  - Fallback empacotado: userData do SO
function pastaDados() {
  if (process.env.FINANWISE_DIR) return process.env.FINANWISE_DIR;
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
  if (!app.isPackaged) return app.getAppPath();
  return app.getPath('userData');
}
const arquivoDados = () => path.join(pastaDados(), 'dados.json');

function lerDados() {
  try {
    return fs.readFileSync(arquivoDados(), 'utf8');
  } catch {
    return null; // ainda não existe -> app começa vazio
  }
}

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

// dados-AAAAMMDD-HHMMSS.json (hora local, mesmo padrão dos backups já existentes)
function nomeBackup(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `dados-${data}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

// Só mexe em arquivos com ESTE padrão de nome — qualquer outra coisa na pasta
// (export manual, cópia solta) fica intocada. Backups antigos feitos à mão com o
// mesmo padrão contam como nossos e entram na rotação, o que é o esperado.
const ehBackupNosso = (n) => /^dados-\d{8}-\d{6}(-\d+)?\.json$/.test(n);

function rotacionar(dir, manter = BACKUP_MANTER) {
  // O nome ordena cronologicamente (AAAAMMDD-HHMMSS), então ordenar por nome basta.
  const nossos = fs.readdirSync(dir).filter(ehBackupNosso).sort();
  for (const velho of nossos.slice(0, Math.max(0, nossos.length - manter))) {
    try { fs.unlinkSync(path.join(dir, velho)); } catch { /* ignore */ }
  }
}

// Backup é rede de segurança: se falhar, NÃO pode derrubar a gravação do dado.
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

// ---- IPC (a UI chama via window.finanwise) ----
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

app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
