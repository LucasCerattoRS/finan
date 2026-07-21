// screenshots.mjs — gera as screenshots do README com DADOS FICTÍCIOS.
// Sobe o app de verdade (mesma técnica do smoke-electron.mjs), navega por
// todas as abas e captura cada tela via DevTools Protocol.
//
//   node scripts/screenshots.mjs [--out docs/screenshots]
//
// Usa uma pasta temporária (FINANWISE_DIR) com um dados.json de demonstração,
// então NUNCA toca nos seus dados reais.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// electron resolvido a partir do diretório atual (funciona após `npm install`)
const require2 = createRequire(path.join(process.cwd(), 'package.json'));
const electronExe = require2('electron');

const outIdx = process.argv.indexOf('--out');
const OUT = path.resolve(outIdx > -1 ? process.argv[outIdx + 1] : 'docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finan-shots-'));
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Massa de demonstração — TODA fictícia, determinística e em meses relativos
// ao mês atual (os gráficos de 6 meses sempre aparecem cheios).
// ---------------------------------------------------------------------------
const hoje = new Date();
const mesISO = (desloc) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + desloc, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const M = [-5, -4, -3, -2, -1, 0].map(mesISO); // 6 meses, M[5] = mês atual

let seq = 0;
const id = (p) => `${p}_demo${String(++seq).padStart(3, '0')}`;
const tx = (mes, dia, dados) => ({
  id: id('tx'),
  data: `${mes}-${String(dia).padStart(2, '0')}`,
  classificacao: dados.tipo === 'entrada' ? 'Essencial' : (dados.classificacao || ''),
  forma: dados.tipo === 'cartao' ? undefined : (dados.forma || 'Pix'),
  ...dados,
});

const CARD_NU = { id: 'card_demo1', nome: 'Nubank', fechamento: 20, vencimento: 27 };
const CARD_IN = { id: 'card_demo2', nome: 'Inter', fechamento: 5, vencimento: 12 };

const transacoes = [];
const varia = [0.94, 1.03, 0.98, 1.06, 0.91, 1.0]; // variação mês a mês (fixa)
M.forEach((mes, i) => {
  const v = (base) => Math.round(base * varia[i] * 100) / 100;
  transacoes.push(
    tx(mes, 5, { tipo: 'entrada', valor: 5200, descricao: 'Salário', categoria: 'Salário', forma: 'Transferência bancária' }),
    tx(mes, 5, { tipo: 'entrada', valor: 600, descricao: 'Vale alimentação', categoria: 'Vale Alimentação' }),
    tx(mes, 3, { tipo: 'saida', valor: 1400, descricao: 'Aluguel', categoria: 'Casa', classificacao: 'Essencial', forma: 'Boleto' }),
    tx(mes, 8, { tipo: 'saida', valor: v(720), descricao: 'SUPERMERCADO BOM PRECO', categoria: 'Mercado', classificacao: 'Essencial', forma: 'Débito' }),
    tx(mes, 12, { tipo: 'saida', valor: v(215), descricao: 'IFD*IFOOD', categoria: 'Alimentação', classificacao: 'Não essencial' }),
    tx(mes, 14, { tipo: 'saida', valor: v(92), descricao: 'PADARIA PAO QUENTE', categoria: 'Padaria', classificacao: 'Essencial', forma: 'Débito' }),
    tx(mes, 15, { tipo: 'saida', valor: v(84), descricao: 'DROGARIA SAO PAULO', categoria: 'Farmácia', classificacao: 'Essencial' }),
    tx(mes, 16, { tipo: 'saida', valor: v(295), descricao: 'POSTO IPIRANGA', categoria: 'Gasolina', classificacao: 'Essencial', forma: 'Débito' }),
    tx(mes, 10, { tipo: 'saida', valor: 44.9, descricao: 'NETFLIX.COM', categoria: 'Assinaturas', classificacao: 'Não essencial' }),
    tx(mes, 10, { tipo: 'saida', valor: 21.9, descricao: 'SPOTIFY', categoria: 'Assinaturas', classificacao: 'Não essencial' }),
    tx(mes, 6, { tipo: 'saida', valor: 89.9, descricao: 'ACADEMIA CORPO EM DIA', categoria: 'Saúde', classificacao: 'Essencial' }),
    tx(mes, 22, { tipo: 'saida', valor: v(68), descricao: 'UBER *TRIP', categoria: 'Transporte', classificacao: 'Não essencial' }),
  );
});
// compras no cartão (algumas parceladas — as parcelas explodem nas faturas)
transacoes.push(
  tx(M[0], 18, { tipo: 'cartao', valor: 180, descricao: 'Jantar de aniversário', categoria: 'Lazer', cartaoId: CARD_NU.id, parcelas: 1 }),
  tx(M[1], 9, { tipo: 'cartao', valor: 2400, descricao: 'Notebook Dell', categoria: 'Educação', cartaoId: CARD_NU.id, parcelas: 6 }),
  tx(M[2], 21, { tipo: 'cartao', valor: 320, descricao: 'Roupas de inverno', categoria: 'Vestuário', cartaoId: CARD_IN.id, parcelas: 2 }),
  tx(M[3], 7, { tipo: 'cartao', valor: 250, descricao: 'Presente dia das mães', categoria: 'Lazer', cartaoId: CARD_NU.id, parcelas: 1 }),
  tx(M[4], 11, { tipo: 'cartao', valor: 1800, descricao: 'Celular Samsung', categoria: 'Outros', cartaoId: CARD_NU.id, parcelas: 3 }),
  tx(M[5], 4, { tipo: 'cartao', valor: 420, descricao: 'Tênis de corrida', categoria: 'Vestuário', cartaoId: CARD_IN.id, parcelas: 2 }),
  tx(M[5], 9, { tipo: 'cartao', valor: 160, descricao: 'Livros', categoria: 'Educação', cartaoId: CARD_NU.id, parcelas: 1 }),
);
// lançamentos importados ainda SEM categoria útil -> populam a tela Revisar
transacoes.push(
  tx(M[5], 13, { tipo: 'saida', valor: 145.3, descricao: 'PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI E LIMA LTDA', categoria: 'Outros', forma: 'Importado', fitid: 'demo-rev-1' }),
  tx(M[5], 14, { tipo: 'saida', valor: 23.5, descricao: 'CARTAO DEBITO - PADARIA ESTRELA - BR', categoria: 'Outros', forma: 'Importado', fitid: 'demo-rev-2' }),
  tx(M[5], 17, { tipo: 'saida', valor: 31.8, descricao: 'CARTAO DEBITO - PADARIA ESTRELA - BR', categoria: 'Outros', forma: 'Importado', fitid: 'demo-rev-3' }),
  tx(M[5], 15, { tipo: 'saida', valor: 60, descricao: 'PIX ENVIADO MARIA OLIVEIRA', categoria: 'Outros', forma: 'Importado', fitid: 'demo-rev-4' }),
  // com fitid conhecido: reimportar o extrato de demonstração marca como duplicado
  tx(M[5], 8, { tipo: 'saida', valor: 74.9, descricao: 'IFD*IFOOD SAO PAULO', categoria: 'Alimentação', forma: 'Importado', fitid: 'demo-dup-1' }),
);

const estado = {
  schemaVersion: 1,
  config: {
    moeda: 'BRL',
    reservaMetaMeses: 6,
    metas: {
      rendaComponentes: [{ nome: 'Salário', valor: 5200 }, { nome: 'Freelas', valor: 800 }],
      patrimonioInvestido: 24500,
      aporteMensal: 600,
      taxaAnual: 0.10,
      libFinanceiraMeses: 6,
      dividendosYield: 0.10,
    },
    regras: [
      { padrao: 'comercio zilli', categoria: 'Mercado', classificacao: 'Essencial' },
      { padrao: 'padaria estrela', categoria: 'Padaria', classificacao: 'Essencial' },
    ],
    contasProprias: ['Fulano de Tal', '111.222.333-44'],
  },
  cartoes: [CARD_NU, CARD_IN],
  transacoes,
  pagamentosFatura: [
    { id: id('pag'), cartaoId: CARD_NU.id, mesFatura: M[2], valor: 830.5, data: `${M[2]}-27`, criadoEm: new Date().toISOString() },
    { id: id('pag'), cartaoId: CARD_NU.id, mesFatura: M[3], valor: 650, data: `${M[3]}-27`, criadoEm: new Date().toISOString() },
    { id: id('pag'), cartaoId: CARD_NU.id, mesFatura: M[4], valor: 400, data: `${M[4]}-27`, criadoEm: new Date().toISOString() },
    { id: id('pag'), cartaoId: CARD_IN.id, mesFatura: M[3], valor: 160, data: `${M[3]}-12`, criadoEm: new Date().toISOString() },
  ],
  faturas: [],
  planejamentos: [
    ...[M[4], M[5]].flatMap((mes) => [
      { id: id('plan'), mes, categoria: 'Mercado', estimado: 800 },
      { id: id('plan'), mes, categoria: 'Alimentação', estimado: 300 },
      { id: id('plan'), mes, categoria: 'Gasolina', estimado: 350 },
      { id: id('plan'), mes, categoria: 'Casa', estimado: 1500 },
      { id: id('plan'), mes, categoria: 'Lazer', estimado: 200 },
      { id: id('plan'), mes, categoria: 'Farmácia', estimado: 150 },
    ]),
  ],
  reservas: [
    ...M.map((mes) => ({ id: id('res'), mes, valor: 500, obs: 'aporte mensal', criadoEm: new Date().toISOString() })),
    { id: id('res'), mes: M[3], valor: -300, obs: 'pneu do carro', criadoEm: new Date().toISOString() },
  ],
};
fs.writeFileSync(path.join(DIR, 'dados.json'), JSON.stringify(estado, null, 2));

// extrato OFX de demonstração — usado na tela Importar (pré-visualização)
const ofx = path.join(DIR, 'extrato-demo.ofx');
const mmAtual = M[5].replace('-', '');
fs.writeFileSync(ofx, `OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>${mmAtual}08<TRNAMT>-74.90<FITID>demo-dup-1<MEMO>IFD*IFOOD SAO PAULO</STMTTRN>
<STMTTRN><DTPOSTED>${mmAtual}18<TRNAMT>-186.40<FITID>demo-new-1<MEMO>POSTO SHELL RODOVIA</STMTTRN>
<STMTTRN><DTPOSTED>${mmAtual}19<TRNAMT>-52.30<FITID>demo-new-2<MEMO>DROGARIA PACHECO</STMTTRN>
<STMTTRN><DTPOSTED>${mmAtual}19<TRNAMT>-18.50<FITID>demo-new-3<MEMO>PADARIA PAO QUENTE</STMTTRN>
</BANKTRANLIST></OFX>`);

// ---------------------------------------------------------------------------
// Sobe o Electron e conecta no DevTools Protocol
// ---------------------------------------------------------------------------
const WIN = process.platform === 'win32';
const proc = spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`], {
  cwd: process.cwd(),
  env: { ...process.env, FINANWISE_DIR: DIR },
  stdio: ['ignore', 'ignore', 'pipe'],
  detached: !WIN,
});
let stderr = '';
proc.stderr.on('data', (d) => { stderr += d; });
const encerrar = () => {
  try {
    if (WIN) execFileSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
    else process.kill(-proc.pid, 'SIGKILL');
  } catch { /* já morreu */ }
};
process.on('exit', encerrar);
process.on('uncaughtException', (e) => { encerrar(); console.error(e); process.exit(1); });

async function alvoPagina() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const alvos = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = alvos.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (p) return p;
    } catch { /* subindo */ }
    await sleep(500);
  }
  throw new Error(`Electron não abriu em 20s.\n${stderr}`);
}
const alvo = await alvoPagina();
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let idMsg = 0;
const pendentes = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id); }
};
const cdp = (method, params = {}) => {
  const i = ++idMsg;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => pendentes.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))));
};
const ev = async (expr, byValue = true) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: byValue });
  if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return byValue ? r.result.value : r.result.objectId;
};

await cdp('Page.enable');
// tema escuro consistente, independente do SO de quem gera
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

// espera o boot terminar (título do Início renderizado)
for (let i = 0; i < 40; i += 1) {
  if (await ev(`!!document.querySelector('#view h2')`)) break;
  await sleep(200);
}
await sleep(600);

// o app abre no último mês com movimento (parcelas futuras de cartão contam!)
// -> volta para o mês atual, que é o que tem os dados cheios
await ev(`(() => {
  const s = document.querySelector('#mesSelect');
  s.value = '${M[5]}';
  s.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(400);

async function capturar(nome) {
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${nome}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  📸 ${nome}.png`);
}

// as abas na ordem em que aparecem na navegação
const abas = await ev(`[...document.querySelectorAll('#tabs [data-tab]')].map((b) => b.dataset.tab)`);
console.log(`abas encontradas: ${abas.join(', ')}`);
let n = 0;
for (const aba of abas) {
  await ev(`document.querySelector('#tabs [data-tab="${aba}"]').click()`);
  await sleep(aba === 'dashboard' ? 900 : 600);
  if (aba === 'importar') {
    // solta o extrato de demonstração no input de arquivo -> pré-visualização
    const inputId = await ev(`document.querySelector('#view input[type=file]')`, false);
    await cdp('DOM.setFileInputFiles', { files: [ofx], objectId: inputId });
    await sleep(900);
  }
  n += 1;
  await capturar(`${String(n).padStart(2, '0')}-${aba}`);
}

ws.close();
encerrar();
console.log(`\n${n} screenshots em ${OUT} (dados 100% fictícios — pasta temporária ${DIR})`);
process.exit(0);
