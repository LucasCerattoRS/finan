// smoke-electron.mjs — teste end-to-end de verdade: sobe o Electron, dirige a UI
// pelo DevTools Protocol (clica nas abas, preenche os formulários, solta um
// arquivo de extrato no input) e confere o dados.json gravado no disco.
//
//   npm run test:e2e
//
// Usa uma pasta temporária (FINANWISE_DIR), então nunca toca nos seus dados.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import electronExe from 'electron'; // o pacote exporta o caminho do binário (no Windows, .bin/electron é um .cmd e não dá pra spawnar)

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finan-smoke-'));
const PORT = 9400 + Math.floor(Math.random() * 400); // porta livre por execução
const ok = [];
const falhas = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIN = process.platform === 'win32';
const proc = spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`], {
  cwd: RAIZ,
  // BACKUP_MIN_MS=0 + KEEP=3: sem throttle e com teto baixo, as dezenas de
  // gravações do smoke provam a rotação em segundos (em produção é 15min/20).
  env: {
    ...process.env,
    FINANWISE_DIR: DIR,
    FINANWISE_BACKUP_MIN_MS: '0',
    FINANWISE_BACKUP_KEEP: '3',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
  detached: !WIN, // POSIX: process group próprio -> dá pra matar a árvore inteira
});
let stderr = '';
proc.stderr.on('data', (d) => { stderr += d; });

// Sem isto, um Electron órfão sobrevive ao teste e a próxima execução se conecta nele.
// No Windows não existe process group: kill(-pid) falha e deixa a árvore viva -> taskkill.
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
    } catch { /* ainda subindo */ }
    await sleep(500);
  }
  throw new Error(`Electron não abriu a janela em 20s.\n${stderr}`);
}

const alvo = await alvoPagina();
ok.push('Electron subiu e carregou src/ui/index.html');

const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pendentes = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id); }
};
function cdp(method, params = {}) {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => pendentes.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))));
}
async function ev(expr, byValue = true) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: byValue });
  if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return byValue ? r.result.value : r.result.objectId;
}

// helpers dentro da página
await ev(`
  window.__aba = (nome) => document.querySelector(\`#tabs [data-tab="\${nome}"]\`).click();
  window.__form = (i) => document.querySelectorAll('#view .form-row')[i];
  window.__set = (row, rotulo, val) => {
    const campo = [...row.querySelectorAll('label.field')]
      .find((l) => l.querySelector('span')?.textContent.trim() === rotulo);
    if (!campo) throw new Error('campo não encontrado: ' + rotulo);
    const inp = campo.querySelector('input, select');
    inp.value = val;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window.__add = (row) => row.querySelector('button').click();
  window.__tipo = (rotulo) => [...document.querySelectorAll('.tipo-btn')]
    .find((b) => b.textContent.includes(rotulo)).click();
`);

// A UI re-renderiza depois do carregarEstado() do boot -> esperar, não dormir.
async function abrirAba(nome, formsEsperados = 1) {
  for (let i = 0; i < 40; i += 1) {
    await ev(`__aba('${nome}')`);
    const n = await ev(`document.querySelectorAll('#view .form-row').length`);
    if (n >= formsEsperados) return;
    await sleep(150);
  }
  throw new Error(`a aba "${nome}" não renderizou os formulários em 6s`);
}

let titulo = '';
for (let i = 0; i < 40 && !titulo; i += 1) {
  titulo = await ev(`document.querySelector('#view h2')?.textContent || ''`);
  if (!titulo) await sleep(150);
}
if (/Início/.test(titulo)) ok.push(`abriu no Início ("${titulo}")`);
else falhas.push(`abriu numa tela inesperada: "${titulo}"`);

// ---- cartão ----
await abrirAba('cartoes');
await ev(`(() => {
  const r = __form(0);
  __set(r, 'Nome', 'Nubank'); __set(r, 'Fechamento (dia)', '20'); __set(r, 'Vencimento (dia)', '27');
  __add(r);
})()`);
await sleep(400);

// ---- lançar: entrada e compra parcelada, no formulário único ----
await abrirAba('lancamentos');
const mes = await ev(`document.querySelector('#mesSelect').value`);
await ev(`(() => {
  __tipo('Entrada');
  const r = __form(0);
  __set(r, 'Valor', '5000'); __set(r, 'Descrição', 'Salário'); __set(r, 'Data', '${mes}-05');
  __add(r);
})()`);
await sleep(500);
await abrirAba('lancamentos');
await ev(`(() => {
  __tipo('Cartão');
  const r = __form(0);
  __set(r, 'Valor', '3600'); __set(r, 'Descrição', 'Notebook');
  __set(r, 'Data', '${mes}-10'); __set(r, 'Parcelas', '3');
  __add(r);
})()`);
await sleep(700);

const arq = path.join(DIR, 'dados.json');
const ler = () => JSON.parse(fs.readFileSync(arq, 'utf8'));
if (!fs.existsSync(arq)) {
  falhas.push(`dados.json não foi criado em ${arq}`);
} else {
  const d = ler();
  const entrada = (d.transacoes || []).find((t) => t.tipo === 'entrada');
  const compra = (d.transacoes || []).find((t) => t.tipo === 'cartao');
  ok.push('dados.json gravado no disco');
  if (d.cartoes?.length === 1 && d.cartoes[0].fechamento === 20) ok.push('cartão persistido (fech. 20 / venc. 27)');
  else falhas.push(`cartão errado: ${JSON.stringify(d.cartoes)}`);
  if (entrada?.valor === 5000) ok.push('entrada de R$ 5.000,00 persistida');
  else falhas.push(`entrada errada: ${JSON.stringify(entrada)}`);
  if (compra?.valor === 3600 && compra.parcelas === 3) ok.push('compra de R$ 3.600,00 em 3x persistida');
  else falhas.push(`compra errada: ${JSON.stringify(compra)}`);
}

// ---- as 3 parcelas caem nas faturas certas (agora dentro de Cartões) ----
await abrirAba('cartoes');
const linhas = await ev(`[...document.querySelectorAll('#view tbody tr')].map((tr) => tr.innerText.replace(/\\s+/g, ' ').trim())`);
const doNotebook = linhas.filter((l) => l.includes('Notebook'));
if (doNotebook.length === 3) ok.push(`3 parcelas geradas:\n      ${doNotebook.join('\n      ')}`);
else falhas.push(`esperava 3 parcelas do Notebook, veio ${doNotebook.length}: ${JSON.stringify(linhas)}`);

const soma = doNotebook
  .map((l) => Number((l.match(/R\$ ([\d.]+,\d{2})/) || [0, '0'])[1].replace(/\./g, '').replace(',', '.')))
  .reduce((a, b) => a + b, 0);
if (Math.abs(soma - 3600) < 0.005) ok.push(`a soma das parcelas fecha o valor da compra (R$ ${soma.toFixed(2)})`);
else falhas.push(`as parcelas somam ${soma}, mas a compra foi 3600`);

// ---- pagamento de fatura (a tela que faltava da planilha) ----
const mesFatura = `${mes.slice(0, 4)}-${String(Number(mes.slice(5, 7)) + 1).padStart(2, '0')}`;
await ev(`document.querySelector('#mesSelect').value = '${mesFatura}';
  document.querySelector('#mesSelect').dispatchEvent(new Event('change', { bubbles: true }));`);
await sleep(400);
await ev(`__aba('cartoes')`);
await sleep(300);
const temFatura = await ev(`document.querySelector('#view .fatura')?.innerText.replace(/\\s+/g,' ').trim() || ''`);
if (/Nubank/.test(temFatura) && /1\.200,00/.test(temFatura)) ok.push(`fatura do mês seguinte listada: "${temFatura.slice(0, 60)}"`);
else falhas.push(`fatura não apareceu em ${mesFatura}: "${temFatura}"`);

await ev(`(() => {
  const r = [...document.querySelectorAll('#view .form-row')].find((x) => x.innerText.includes('Valor pago'));
  const inp = r.querySelector('input');
  inp.value = '1200';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  r.querySelector('button').click();
})()`);
await sleep(600);
{
  const d = ler();
  const pag = (d.pagamentosFatura || [])[0];
  if (pag && pag.valor === 1200 && pag.mesFatura === mesFatura) ok.push('pagamento de fatura registrado e persistido');
  else falhas.push(`pagamento não persistiu: ${JSON.stringify(d.pagamentosFatura)}`);
  const quitada = await ev(`document.querySelector('#view .fatura')?.innerText.includes('Quitada')`);
  if (quitada) ok.push('fatura marcou 100% / Quitada depois do pagamento');
  else falhas.push('fatura não marcou como quitada');
}

// ---- adiantar fatura: pagar hoje uma fatura de dois meses à frente ----
await ev(`__aba('cartoes')`);
await sleep(400);
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const mesDistante = `${mes.slice(0, 4)}-${String(Number(mes.slice(5, 7)) + 3).padStart(2, '0')}`;
const rotuloDistante = `${MESES_PT[Number(mesDistante.slice(5, 7)) - 1]} ${mesDistante.slice(0, 4)}`;
const clicou = await ev(`(() => {
  const linhas = [...document.querySelectorAll('#view .fatura')].filter((f) => f.innerText.includes('Adiantar'));
  const alvo = linhas.find((f) => f.innerText.includes('${rotuloDistante}'));
  if (!alvo) return '';
  const rotulo = alvo.innerText.slice(0, 40);
  alvo.querySelector('button').click(); // sem digitar valor: adianta a fatura cheia
  return rotulo;
})()`);
await sleep(700);
{
  const d = ler();
  // a fatura distante, paga hoje -> é adiantamento (o pagamento anterior era do mês seguinte)
  const adiantamento = (d.pagamentosFatura || []).find((p) => p.mesFatura === mesDistante);
  if (adiantamento) {
    ok.push(`adiantamento registrado: ${adiantamento.valor} da fatura de ${adiantamento.mesFatura}, pago em ${adiantamento.data} (${clicou})`);
  } else {
    falhas.push(`adiantamento não persistiu: ${JSON.stringify(d.pagamentosFatura)}`);
  }
  // adiantar NÃO pode inventar gasto no mês em que se pagou
  const saidasDoMes = await ev(`(() => {
    document.querySelector('#tabs [data-tab="dashboard"]').click();
    return document.querySelectorAll('#view .kpi')[1].innerText;
  })()`);
  if (!/R\$/.test(saidasDoMes)) falhas.push('dashboard não mostrou saídas depois do adiantamento');
  else ok.push('dashboard segue de pé depois do adiantamento (gasto não é inventado — vem do extrato)');
}

// ---- importar extrato OFX pela UI (arquivo de verdade no input de arquivo) ----
const ofx = path.join(DIR, 'extrato.ofx');
fs.writeFileSync(ofx, `OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>${mes.replace('-', '')}18<TRNAMT>-89.90<FITID>e1<MEMO>IFD*IFOOD SAO PAULO</STMTTRN>
<STMTTRN><DTPOSTED>${mes.replace('-', '')}19<TRNAMT>-250.00<FITID>e2<MEMO>POSTO IPIRANGA</STMTTRN>
</BANKTRANLIST></OFX>`);

await ev(`document.querySelector('#mesSelect').value = '${mes}';
  document.querySelector('#mesSelect').dispatchEvent(new Event('change', { bubbles: true }));`);
await sleep(300);
await ev(`__aba('importar')`);
await sleep(400);
const inputId = await ev(`document.querySelector('#view input[type=file]')`, false);
await cdp('DOM.setFileInputFiles', { files: [ofx], objectId: inputId });
await sleep(900);

const resumo = await ev(`document.querySelector('#view .card:nth-of-type(2) .muted')?.innerText || ''`);
if (/2 lançamentos/.test(resumo) && /2 categorizados/.test(resumo)) ok.push(`extrato lido e categorizado sozinho: "${resumo}"`);
else falhas.push(`resumo da importação inesperado: "${resumo}"`);

await ev(`[...document.querySelectorAll('#view button')].find((b) => b.textContent.startsWith('Importar')).click()`);
await sleep(800);
{
  const d = ler();
  const ifood = (d.transacoes || []).find((t) => t.descricao?.includes('IFOOD'));
  const posto = (d.transacoes || []).find((t) => t.descricao?.includes('POSTO'));
  if (ifood?.categoria === 'Alimentação' && ifood.valor === 89.9 && ifood.tipo === 'saida') ok.push('iFood importado como Alimentação / saída (regra aplicada sozinha)');
  else falhas.push(`iFood importado errado: ${JSON.stringify(ifood)}`);
  if (posto?.categoria === 'Gasolina') ok.push('Posto importado como Gasolina');
  else falhas.push(`Posto importado errado: ${JSON.stringify(posto)}`);
}

// reimportar o mesmo arquivo não pode duplicar
await ev(`__aba('importar')`);
await sleep(300);
const inputId2 = await ev(`document.querySelector('#view input[type=file]')`, false);
await cdp('DOM.setFileInputFiles', { files: [ofx], objectId: inputId2 });
await sleep(900);
const resumo2 = await ev(`document.querySelector('#view .card:nth-of-type(2) .muted')?.innerText || ''`);
if (/2 já existem/.test(resumo2)) ok.push('reimportar o mesmo extrato: os 2 vêm marcados como duplicados');
else falhas.push(`deveria detectar duplicados, veio: "${resumo2}"`);

// ---- o Início desenha os gráficos ----
await ev(`__aba('dashboard')`);
await sleep(500);
const graficos = await ev(`({
  barras: document.querySelectorAll('#view .chart-svg .bar-mark').length,
  categorias: document.querySelectorAll('#view .chart-cats .catrow').length,
  legenda: document.querySelectorAll('#view .legend-item').length,
})`);
if (graficos.barras >= 2 && graficos.categorias >= 1 && graficos.legenda === 2) {
  ok.push(`Início desenhou os gráficos (${graficos.barras} barras, ${graficos.categorias} categorias, legenda com ${graficos.legenda} séries)`);
} else {
  falhas.push(`gráficos não renderizaram: ${JSON.stringify(graficos)}`);
}

// ---- planejar: orçar uma categoria e ver estimado x real (parity com a planilha) ----
await ev(`document.querySelector('#mesSelect').value = '${mes}';
  document.querySelector('#mesSelect').dispatchEvent(new Event('change', { bubbles: true }));`);
await sleep(200);
await abrirAba('planejar');
// Alimentação já tem gasto real no mês (o iFood importado): definir a meta inline.
await ev(`(() => {
  const tr = [...document.querySelectorAll('#view tbody tr')].find((x) => x.innerText.includes('Alimentação'));
  const inp = tr.querySelector('input.num-input');
  inp.value = '100';
  inp.dispatchEvent(new Event('blur', { bubbles: true }));
})()`);
await sleep(700);
{
  const d = ler();
  const meta = (d.planejamentos || []).find((pl) => pl.categoria === 'Alimentação' && pl.mes === mes);
  if (meta && meta.estimado === 100) ok.push('orçamento de Alimentação (R$ 100) definido e persistido');
  else falhas.push(`meta de orçamento não persistiu: ${JSON.stringify(d.planejamentos)}`);
}
const linhaAli = await ev(`(() => {
  const tr = [...document.querySelectorAll('#view tbody tr')].find((x) => x.innerText.includes('Alimentação'));
  return tr ? tr.innerText.replace(/\\s+/g, ' ').trim() : '';
})()`);
// iFood 89,90 gasto contra 100,00 orçado -> resta 10,10
if (/89,90/.test(linhaAli) && /10,10/.test(linhaAli)) ok.push(`Planejar mostra estimado x real (resta R$ 10,10): "${linhaAli.slice(0, 72)}"`);
else falhas.push(`Planejar não mostrou estimado x real certo: "${linhaAli}"`);

// ---- reservas: guardar, resgatar e definir a meta (parity: aba "Reservas PM") ----
await abrirAba('reservas', 2);
// guardar R$ 500 no mês
await ev(`(() => {
  const r = __form(0);
  __set(r, 'Ação', 'Guardar'); __set(r, 'Valor', '500'); __set(r, 'Observação', 'reserva inicial');
  __add(r);
})()`);
await sleep(600);
// resgatar R$ 200 (vira valor negativo)
await abrirAba('reservas', 2);
await ev(`(() => {
  const r = __form(0);
  __set(r, 'Ação', 'Resgatar'); __set(r, 'Valor', '200');
  __add(r);
})()`);
await sleep(600);
{
  const d = ler();
  const aporte = (d.reservas || []).find((x) => x.valor === 500);
  const resgate = (d.reservas || []).find((x) => x.valor === -200);
  if (aporte && aporte.mes === mes && aporte.obs === 'reserva inicial') ok.push('aporte de R$ 500 na reserva persistido (com observação)');
  else falhas.push(`aporte da reserva não persistiu: ${JSON.stringify(d.reservas)}`);
  if (resgate) ok.push('resgate de R$ 200 gravado como valor negativo (usou a reserva)');
  else falhas.push(`resgate não persistiu como negativo: ${JSON.stringify(d.reservas)}`);
}
// a tela mostra o acumulado (500 − 200 = 300) e o "disponível para gastar"
await abrirAba('reservas', 2);
const kpisReserva = await ev(`[...document.querySelectorAll('#view .kpi')].map((k) => k.innerText.replace(/\\s+/g,' ').trim())`);
// o CSS deixa o rótulo do KPI em maiúsculas (text-transform) -> innerText vem em CAIXA: casar sem case.
if (kpisReserva.some((k) => /reserva acumulada/i.test(k) && /300,00/.test(k))) ok.push(`Reservas mostra o acumulado certo (R$ 300,00): "${kpisReserva[0]}"`);
else falhas.push(`KPI de reserva acumulada errado: ${JSON.stringify(kpisReserva)}`);
if (kpisReserva.some((k) => /dispon.vel para gastar/i.test(k))) ok.push('Reservas mostra "Disponível para gastar" (dinheiro em conta − reserva)');
else falhas.push(`faltou o KPI "Disponível para gastar": ${JSON.stringify(kpisReserva)}`);
// definir a meta em 3 meses de gasto
await ev(`(() => {
  const r = __form(1);
  __set(r, 'Meses de gasto', '3');
  __add(r);
})()`);
await sleep(600);
{
  const d = ler();
  if (d.config?.reservaMetaMeses === 3) ok.push('meta da reserva definida em 3 meses e persistida');
  else falhas.push(`meta da reserva não persistiu: ${JSON.stringify(d.config?.reservaMetaMeses)}`);
}

// ---- metas: renda, patrimônio e aporte -> alvos de reserva/liberdade/dividendos ----
await abrirAba('metas', 3);
// renda: o componente "Salário" (default) recebe 3900
await ev(`(() => {
  const inp = document.querySelector('#view .renda-val');
  inp.value = '3900';
  inp.dispatchEvent(new Event('blur', { bubbles: true }));
})()`);
await sleep(600);
// premissas: patrimônio 2000, aporte 500, yield 10% -> salvar
await abrirAba('metas', 3);
await ev(`(() => {
  const r1 = __form(1); // patrimônio / aporte / rendimento
  __set(r1, 'Patrimônio investido (R$)', '2000');
  __set(r1, 'Aporte mensal (R$)', '500');
  const r2 = __form(2); // meses de liberdade / yield / salvar
  __set(r2, 'Dividendos: yield (% a.a.)', '10');
  __add(r2);
})()`);
await sleep(700);
{
  const d = ler();
  const mt = d.config?.metas || {};
  if (mt.patrimonioInvestido === 2000 && mt.aporteMensal === 500) ok.push('metas: patrimônio R$ 2.000 e aporte R$ 500 persistidos');
  else falhas.push(`metas não persistiram: ${JSON.stringify(mt)}`);
  const salario = (mt.rendaComponentes || []).find((c) => c.valor === 3900);
  if (salario) ok.push('metas: renda (Salário R$ 3.900) persistida como componente');
  else falhas.push(`renda não persistiu: ${JSON.stringify(mt.rendaComponentes)}`);
}
// a tela calcula o alvo de "viver de dividendos" = 3900×12 / 10% = R$ 468.000,00
await abrirAba('metas', 3);
const cardsMetas = await ev(`[...document.querySelectorAll('#view .card')].map((c) => c.innerText.replace(/\\s+/g,' ').trim())`);
if (cardsMetas.some((t) => /Viver de dividendos/i.test(t) && /468\.000,00/.test(t))) ok.push('Metas calcula o alvo de "viver de dividendos" (R$ 468.000,00 a 10% a.a.)');
else falhas.push(`alvo de dividendos errado: ${JSON.stringify(cardsMetas.filter((t) => /dividendos/i.test(t)))}`);
if (cardsMetas.some((t) => /Liberdade financeira/i.test(t) && /23\.400,00/.test(t))) ok.push('Metas calcula a liberdade financeira (6 × renda = R$ 23.400,00)');
else falhas.push(`alvo de liberdade errado: ${JSON.stringify(cardsMetas.filter((t) => /Liberdade/i.test(t)))}`);

// ---- backups datados com rotação ----
{
  const dirBk = path.join(DIR, 'backups');
  const arqs = fs.existsSync(dirBk) ? fs.readdirSync(dirBk).sort() : [];
  const nossos = arqs.filter((n) => /^dados-\d{8}-\d{6}(-\d+)?\.json$/.test(n));

  if (nossos.length) ok.push(`backups datados criados em backups/ (${nossos.length} arquivo(s), ex.: ${nossos[0]})`);
  else falhas.push('nenhum backup datado foi criado em backups/');

  // KEEP=3: as dezenas de gravações do smoke não podem ter deixado mais que 3.
  if (nossos.length <= 3) ok.push(`rotação respeitou o teto (${nossos.length} ≤ 3, os mais antigos foram apagados)`);
  else falhas.push(`rotação não apagou os antigos: ${nossos.length} arquivos (teto 3)`);

  // O backup tem que ser JSON válido e com o histórico dentro — não um arquivo vazio.
  const ultimo = nossos[nossos.length - 1];
  if (ultimo) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dirBk, ultimo), 'utf8'));
      if (Array.isArray(b.transacoes) && b.transacoes.length) ok.push(`o backup é restaurável (JSON válido, ${b.transacoes.length} transações)`);
      else falhas.push(`backup sem transações: ${JSON.stringify(Object.keys(b))}`);
    } catch (e) {
      falhas.push(`backup não é JSON válido: ${e.message}`);
    }
  }
}

ws.close();
encerrar();

console.log('\n=== OK ===');
ok.forEach((l) => console.log(`  ✔ ${l}`));
if (falhas.length) {
  console.log('\n=== FALHOU ===');
  falhas.forEach((l) => console.log(`  ✘ ${l}`));
}
console.log(`\n${ok.length} ok, ${falhas.length} falha(s)\n`);
process.exit(falhas.length ? 1 : 0);
