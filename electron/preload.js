// preload.js — expõe uma API mínima e segura para a UI (window.finanwise).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finanwise', {
  ler: () => ipcRenderer.invoke('dados:ler'),
  salvar: (json) => ipcRenderer.invoke('dados:salvar', json),
  caminho: () => ipcRenderer.invoke('dados:caminho'),
  exportar: (json, nome) => ipcRenderer.invoke('dados:exportar', json, nome),
  importar: () => ipcRenderer.invoke('dados:importar'),
});
