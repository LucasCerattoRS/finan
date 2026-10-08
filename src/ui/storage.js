// storage.js — persistência. Usa a ponte do Electron (window.finanwise) quando
// disponível; senão cai no localStorage (modo navegador). Mesma interface.

import { carregar, estadoInicial } from '../core/index.js';

const LS_KEY = 'finanwise:dados';
const temElectron = () => typeof window !== 'undefined' && window.finanwise;

// Dados que existem mas não deu para ler (JSON corrompido): o app abre vazio para não
// travar, mas NÃO grava. O primeiro save trocaria o arquivo do usuário por um estado vazio.
// A gravação volta quando um backup é importado (liberarGravacao).
let falhaLeitura = null;
export const falhaDeLeitura = () => falhaLeitura;
export const liberarGravacao = () => { falhaLeitura = null; };

export async function carregarEstado() {
  try {
    if (temElectron()) {
      const json = await window.finanwise.ler();
      return carregar(json || null);
    }
    return carregar(localStorage.getItem(LS_KEY));
  } catch (e) {
    console.error('Falha ao carregar; começando vazio e com gravação bloqueada.', e);
    falhaLeitura = e && e.message ? e.message : String(e);
    return estadoInicial();
  }
}

export async function salvarEstado(estado) {
  if (falhaLeitura) {
    throw new Error(`Gravação bloqueada: os dados salvos não puderam ser lidos (${falhaLeitura}).`);
  }
  const json = JSON.stringify(estado, null, 2);
  if (temElectron()) {
    await window.finanwise.salvar(json);
  } else {
    localStorage.setItem(LS_KEY, json);
  }
}

// Onde os dados estão guardados (para exibir na tela de Config).
export async function localDados() {
  if (temElectron()) return await window.finanwise.caminho();
  return 'Navegador (localStorage)';
}

// Exportar: baixa/gera um arquivo .json de backup.
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

// Importar: lê um .json e devolve o estado migrado (não salva sozinho).
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
