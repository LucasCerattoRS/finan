// Testes do que veio da auditoria da planilha: categorização, importação de
// extrato (OFX/CSV) e pagamento de fatura.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/index.js';

const OFX = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260216120000[-3:BRT]<TRNAMT>-89.90<FITID>abc1<MEMO>IFD*IFOOD SAO PAULO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260217<TRNAMT>-250,00<FITID>abc2<MEMO>POSTO IPIRANGA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260205<TRNAMT>3267.65<FITID>abc3<MEMO>SALARIO EMPRESA LTDA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('OFX: lê data, valor, descrição e o sinal vira entrada/saída', () => {
  const txs = C.parseExtrato(OFX, 'extrato.ofx');
  assert.equal(txs.length, 3);
  assert.deepEqual(txs[0], {
    data: '2026-02-16', valor: 89.9, descricao: 'IFD*IFOOD SAO PAULO', tipo: 'saida', fitid: 'abc1',
  });
  assert.equal(txs[1].valor, 250); // aceita vírgula decimal
  assert.equal(txs[2].tipo, 'entrada'); // TRNAMT positivo
});

test('CSV: acha as colunas pelo cabeçalho e entende valor em formato BR', () => {
  const csv = 'Data;Descrição;Valor\n16/02/2026;"Mercado Zaffari";"-1.234,56"\n05/02/2026;Salário;3.000,00\n';
  const txs = C.parseExtrato(csv, 'extrato.csv');
  assert.equal(txs.length, 2);
  assert.deepEqual(txs[0], {
    data: '2026-02-16', valor: 1234.56, descricao: 'Mercado Zaffari', tipo: 'saida', fitid: '',
  });
  assert.equal(txs[1].tipo, 'entrada');
});

test('categorizar: casa ignorando acento e caixa; regra do usuário vence a padrão', () => {
  assert.equal(C.categorizar('IFD*IFOOD SAO PAULO').categoria, 'Alimentação');
  assert.equal(C.categorizar('FARMACIA SAO JOAO').categoria, 'Farmácia');
  assert.equal(C.categorizar('pagamento aleatório xyz'), null);

  const minhas = [{ padrao: 'ifood', categoria: 'Delivery', classificacao: 'Não essencial' }];
  assert.equal(C.categorizar('IFOOD', minhas).categoria, 'Delivery');
});

test('prepararImportacao: sugere categoria e marca duplicata (não reimporta o mesmo)', () => {
  let estado = C.estadoInicial();
  const brutos = C.parseExtrato(OFX, 'extrato.ofx');

  const primeira = C.prepararImportacao(estado, brutos);
  assert.equal(primeira.every((c) => c.importar), true);
  assert.equal(primeira[0].categoria, 'Alimentação');
  assert.equal(C.resumoImportacao(primeira).reconhecidos, 3);

  estado = C.importarTransacoes(estado, primeira);
  assert.equal(estado.transacoes.length, 3);

  // reimportar o MESMO arquivo: tudo marcado como duplicado e desmarcado
  const segunda = C.prepararImportacao(estado, brutos);
  assert.equal(segunda.every((c) => c.duplicado), true);
  assert.equal(C.resumoImportacao(segunda).aImportar, 0);

  estado = C.importarTransacoes(estado, segunda);
  assert.equal(estado.transacoes.length, 3, 'não pode duplicar');
});

test('pagamento de fatura: total, pago, restante e progresso', () => {
  let estado = C.estadoInicial();
  estado = C.adicionarCartao(estado, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartao = estado.cartoes[0];

  // compra de 900 em 3x -> 300 por fatura. Compra dia 16 (<= 25) -> 1ª fatura no mês seguinte.
  estado = C.adicionarTransacao(estado, {
    tipo: 'cartao', data: '2026-02-16', categoria: 'Notebook', valor: 900,
    cartaoId: cartao.id, parcelas: 3,
  });

  const mar = '2026-03';
  assert.equal(C.totalFatura(estado, cartao.id, mar), 300);

  estado = C.registrarPagamentoFatura(estado, { cartaoId: cartao.id, mesFatura: mar, valor: 100 });
  let r = C.resumoFatura(estado, cartao.id, mar);
  assert.equal(r.pago, 100);
  assert.equal(r.restante, 200);
  assert.equal(Math.round(r.progresso * 100), 33);
  assert.equal(r.quitada, false);

  estado = C.registrarPagamentoFatura(estado, { cartaoId: cartao.id, mesFatura: mar, valor: 200 });
  r = C.resumoFatura(estado, cartao.id, mar);
  assert.equal(r.pago, 300);
  assert.equal(r.restante, 0);
  assert.equal(r.quitada, true);

  // pagar fatura NÃO pode virar saída extra (senão conta o mesmo dinheiro 2x)
  assert.equal(C.resumoMes(estado, mar).saidas, 300);
});

test('serieMensal: devolve N meses, incluindo os vazios (buraco não vira reta)', () => {
  let estado = C.estadoInicial();
  estado = C.adicionarTransacao(estado, { tipo: 'entrada', data: '2026-03-05', categoria: 'Salário', valor: 1000 });
  const serie = C.serieMensal(estado, '2026-05', 6);
  assert.equal(serie.length, 6);
  assert.deepEqual(serie.map((p) => p.mes), ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
  assert.equal(serie[3].entradas, 1000);
  assert.equal(serie[4].entradas, 0);
});

test('transferência entre contas próprias: registrada, mas FORA de entradas/saídas', () => {
  let estado = C.estadoInicial();
  estado = { ...estado, config: { ...estado.config, contasProprias: ['05082616005', 'Lucas Ceratto Dagnese'] } };

  const csv = [
    'Data;Descricao;Valor',
    '10/07/2026;PAGAMENTO PIX - 05082616005 Lucas Ceratto Dagnese;- R$ 1.000,00', // eu -> eu
    '10/07/2026;RECEBIMENTO PIX - 05082616005 Lucas Ceratto Dagnese;+ R$ 1.000,00', // eu <- eu
    '11/07/2026;PAGAMENTO PIX - 08811684000113 MERCADO ZILLI;- R$ 200,00', // gasto de verdade
  ].join('\n');

  const cand = C.prepararImportacao(estado, C.parseExtrato(csv, 'x.csv'));
  assert.equal(cand.filter((c) => c.tipo === 'transferencia').length, 2);
  estado = C.importarTransacoes(estado, cand);

  const r = C.resumoMes(estado, '2026-07');
  assert.equal(r.entradas, 0, 'transferência não pode virar entrada');
  assert.equal(r.saidas, 200, 'só o gasto real conta como saída');
  assert.equal(estado.transacoes.length, 3, 'mas as 3 ficam registradas');
});

test('revisar: agrupa os sem categoria por quem recebeu, e só vira regra quem tem nome', () => {
  let estado = C.estadoInicial();
  const csv = [
    'Data;Descricao;Valor',
    '01/07/2026;PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI E LIMA LTDA;- R$ 100,00',
    '05/07/2026;PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI E LIMA LTDA;- R$ 50,00',
    '06/07/2026;PAGAMENTO PIX SICREDI;- R$ 30,00',
  ].join('\n');
  estado = C.importarTransacoes(estado, C.prepararImportacao(estado, C.parseExtrato(csv, 'x.csv')));

  const grupos = C.gruposParaRevisar(estado);
  assert.equal(C.totalARevisar(estado), 3);

  const zilli = grupos.find((g) => g.chave.includes('zilli'));
  assert.equal(zilli.n, 2, 'os dois Pix pro mesmo lugar viram um grupo só');
  assert.equal(zilli.total, 150);
  assert.equal(zilli.nomeado, true, 'tem nome -> pode virar regra');

  const anonimo = grupos.find((g) => !g.nomeado);
  assert.equal(anonimo.chave, 'pagamento pix sicredi');
  assert.equal(anonimo.nomeado, false, 'sem contraparte -> NÃO pode virar regra');

  // categorizar o grupo nomeado, criando a regra
  estado = C.categorizarLote(estado, zilli.ids, 'Mercado', 'Essencial', zilli.chave);
  assert.equal(estado.transacoes.filter((t) => t.categoria === 'Mercado').length, 2);
  assert.equal(C.totalARevisar(estado), 1, 'só sobra o anônimo');

  // e a regra pega o próximo extrato sozinha
  const novo = C.prepararImportacao(estado, C.parseExtrato(
    'Data;Descricao;Valor\n20/08/2026;PAGAMENTO PIX - 08811684000113 COMERCIO ZILLI E LIMA LTDA;- R$ 77,00', 'y.csv',
  ));
  assert.equal(novo[0].categoria, 'Mercado', 'o que você ensinou uma vez, ele acerta sozinho');
});

test('fatura informada pelo banco: manda no total, mas NÃO vira saída (nada em dobro)', () => {
  let estado = C.estadoInicial();
  estado = C.adicionarCartao(estado, { nome: 'Sicredi', fechamento: 26, vencimento: 10 });
  const cartao = estado.cartoes[0];

  // o banco diz: a fatura de agosto é R$ 882,45 (não lançamos as compras uma a uma)
  estado = C.definirFatura(estado, { cartaoId: cartao.id, mes: '2026-08', total: 882.45 });
  assert.equal(C.totalFatura(estado, cartao.id, '2026-08'), 882.45);

  // a saída de agosto vem do EXTRATO quando ele pagar — a fatura informada é compromisso
  assert.equal(C.resumoMes(estado, '2026-08').saidas, 0);

  // reimportar o mesmo print não duplica a fatura
  estado = C.definirFatura(estado, { cartaoId: cartao.id, mes: '2026-08', total: 882.45 });
  assert.equal(estado.faturas.length, 1);
});

test('fatura informada = 0 (print vazio) NÃO apaga as parcelas reais', () => {
  let estado = C.estadoInicial();
  estado = C.adicionarCartao(estado, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartao = estado.cartoes[0];
  // compra de 600 em 2x -> 300 na fatura de março (a saída real são as parcelas)
  estado = C.adicionarTransacao(estado, {
    tipo: 'cartao', data: '2026-02-16', categoria: 'Notebook', valor: 600,
    cartaoId: cartao.id, parcelas: 2,
  });
  // o banco "informou" a fatura de março como 0 (o print veio vazio)
  estado = C.definirFatura(estado, { cartaoId: cartao.id, mes: '2026-03', total: 0 });

  // informado 0 não vence sobre a parcela de 300 (antes do fix, virava 0 e sumia)
  assert.equal(C.totalFatura(estado, cartao.id, '2026-03'), 300);
  // e a fatura continua na lista de próximas (o filtro é total > 0)
  const proximas = C.proximasFaturas(estado, '2026-03', 12);
  assert.ok(
    proximas.some((f) => f.mesFatura === '2026-03' && f.total === 300),
    'a fatura de março continua visível com o valor das parcelas',
  );
});

test('pagamento de fatura no extrato: vira transferência, fora das saídas (nada em dobro)', () => {
  let estado = C.estadoInicial();
  estado = C.adicionarCartao(estado, { nome: 'Sicredi', fechamento: 25, vencimento: 10 });
  const cartao = estado.cartoes[0];
  // compra de 900 em 3x -> 300 na fatura de março (a parcela é a saída de verdade)
  estado = C.adicionarTransacao(estado, {
    tipo: 'cartao', data: '2026-02-16', categoria: 'Notebook', valor: 900,
    cartaoId: cartao.id, parcelas: 3,
  });
  // o extrato de março traz o pagamento da fatura saindo da conta + um gasto real
  const csv = [
    'Data;Descricao;Valor',
    '10/03/2026;PAGAMENTO DE FATURA CARTAO CREDITO VIA DEBITO - Sicredi;- R$ 300,00',
    '11/03/2026;PAGAMENTO PIX - 08811684000113 MERCADO ZILLI;- R$ 200,00',
  ].join('\n');
  const cand = C.prepararImportacao(estado, C.parseExtrato(csv, 'x.csv'));

  const pag = cand.find((c) => c.descricao.includes('FATURA'));
  assert.equal(pag.tipo, 'transferencia', 'pagamento de fatura sai dos totais');
  assert.equal(pag.categoria, 'Fatura');
  assert.equal(pag.reconhecido, true);

  estado = C.importarTransacoes(estado, cand);
  // saídas de março = parcela (300) + gasto real (200) = 500.
  // SEM o fix, o pagamento da fatura (300) somaria de novo -> 800 (o gasto em dobro).
  assert.equal(C.resumoMes(estado, '2026-03').saidas, 500, 'a fatura não conta duas vezes');
});

test('adiantar fatura: pagar em julho a fatura de outubro reduz o comprometido futuro', () => {
  let estado = C.estadoInicial();
  estado = C.adicionarCartao(estado, { nome: 'Sicredi', fechamento: 26, vencimento: 10 });
  const cartao = estado.cartoes[0];
  estado = C.definirFatura(estado, { cartaoId: cartao.id, mes: '2026-09', total: 395.84 });
  estado = C.definirFatura(estado, { cartaoId: cartao.id, mes: '2026-10', total: 395.84 });

  assert.equal(C.comprometidoFuturo(estado, '2026-07'), 791.68);

  // adianta a de outubro, hoje (julho)
  estado = C.registrarPagamentoFatura(estado, {
    cartaoId: cartao.id, mesFatura: '2026-10', valor: 395.84, data: '2026-07-15',
  });

  const out = C.resumoFatura(estado, cartao.id, '2026-10');
  assert.equal(out.quitada, true);
  assert.equal(out.adiantado, 395.84, 'o app sabe que foi adiantamento, não pagamento no mês');
  assert.equal(C.ehAdiantamento(estado.pagamentosFatura[0]), true);

  // sobrou só setembro em aberto
  assert.equal(C.comprometidoFuturo(estado, '2026-07'), 395.84);

  // e não inventou gasto novo em julho (o dinheiro sai no extrato do banco)
  assert.equal(C.resumoMes(estado, '2026-07').saidas, 0);
});

// Revisão 08/10/2026: o comentário do csvValor prometia "R$ -50,00" negativo, mas o
// teste do sinal era s.startsWith('-') — com o "R$ " na frente, a saída virava ENTRADA.
test('CSV: sinal depois do "R$" continua sendo saída', () => {
  const csv = 'Data;Descrição;Valor\n16/02/2026;Padaria;R$ -50,00\n17/02/2026;Pix recebido;R$ 80,00\n';
  const txs = C.parseExtrato(csv, 'extrato.csv');
  assert.equal(txs[0].tipo, 'saida');
  assert.equal(txs[0].valor, 50);
  assert.equal(txs[1].tipo, 'entrada');
});
