# Um `dados.json` de exemplo, anotado campo a campo

> O schema que [`model.explicado.md`](./model.explicado.md) define, em estado
> **concreto**: uma pessoa fictícia com um cartão, um salário, um mercado, uma
> compra parcelada, uma fatura informada, um orçamento e uma reserva.
>
> ⚠️ **Os comentários `//` abaixo são anotação de estudo — JSON de verdade não
> aceita comentários.** O arquivo real é este mesmo conteúdo, sem os `//`.
> O `dados.json` real nunca vai pro git (`.gitignore`); este aqui é fictício.

```jsonc
{
  // Escrito por migrar() (model.js) em TODA gravação — sempre a versão atual.
  // Serve pra uma versão futura do app saber transformar um arquivo antigo.
  "schemaVersion": 1,

  // ---- config: preferências e listas do usuário -------------------------
  // Nasce de CONFIG_PADRAO (model.js) e é editada na aba Config.
  "config": {
    "moeda": "BRL",
    // As listas alimentam os <select> da UI. categorizarLote/definirPlanejamento
    // acrescentam aqui sozinhos se você usar uma categoria nova.
    "categorias": ["Salário", "Mercado", "Alimentação", "Lazer", "Transporte", "Outros"],
    "formasPagamento": ["Pix", "Dinheiro", "Transferência bancária", "Débito", "Boleto", "Cartão"],
    "classificacoes": ["Essencial", "Não essencial"],

    // Meta da reserva de emergência, em MESES de gasto médio (reserva.js).
    "reservaMetaMeses": 6,

    // Calculadora de metas (metas.js). Preenchido à mão na aba Metas.
    "metas": {
      "rendaComponentes": [{ "nome": "Salário", "valor": 4200 }],
      "patrimonioInvestido": 12000,   // informado à mão — o app é offline, não puxa corretora
      "aporteMensal": 600,            // ritmo de investimento mensal
      "taxaAnual": 0.10,              // 10% a.a. esperado (projeção de prazo, juros compostos)
      "libFinanceiraMeses": 6,        // "liberdade" = 6 meses de RENDA guardados
      "dividendosYield": 0.10         // "viver de dividendos" a um yield de 10% a.a.
    },

    // Regras de categorização criadas na tela Revisar (regras.js).
    // `padrao` casa por trecho, sem acento/caixa (normalizar() do model.js).
    "regras": [
      { "padrao": "mercado bom preco", "categoria": "Mercado", "classificacao": "Essencial" }
    ],

    // Textos que identificam VOCÊ no extrato: Pix entre contas próprias vira
    // tipo "transferencia" na importação (fora dos totais — senão infla os dois lados).
    "contasProprias": ["Fulano de Tal", "111.222.333-44"],

    // Descrições de pagamento de fatura no extrato — também viram "transferencia"
    // (a saída já conta pela PARCELA no mês da fatura; contar o pagamento dobraria).
    "padroesFaturaPagamento": ["pagamento de fatura", "pagamento fatura", "pagto fatura"]
  },

  // ---- cartoes: os cartões de crédito -----------------------------------
  // Escrito por adicionarCartao/atualizarCartao (index.js), lido pela cadeia
  // faturas.js → parcelas.js → faturasPagas.js.
  "cartoes": [
    {
      "id": "card_mdblt41s1a9k2x",  // gerado por novoId('card') — prefixo diz o tipo
      "nome": "Roxinho",
      "fechamento": 10,             // DIA do fechamento: compra até o dia 10 → fatura de +1 mês; depois → +2
      "vencimento": 20              // DIA do vencimento (informativo, aparece na UI)
    }
  ],

  // ---- transacoes: o coração do arquivo ---------------------------------
  // Escrito por adicionarTransacao/importarTransacoes/categorizarLote (index.js).
  // Lido por praticamente tudo (calculos.js em especial).
  // `tipo` ∈ "entrada" | "saida" | "cartao" | "transferencia":
  //   entrada/saida  → contam nos totais NO MÊS DA DATA
  //   cartao         → NÃO conta na data; vira parcelas que contam no MÊS DA FATURA
  //   transferencia  → fora dos totais (dinheiro seu mudando de bolso)
  // `valor` sempre em REAIS positivos — o sinal vem do tipo, não do número.
  "transacoes": [
    {
      "id": "tx_mdblt41s2b0q7f",
      "tipo": "entrada",
      "data": "2026-07-05",              // sempre ISO "YYYY-MM-DD" (mesDe() fatia por posição)
      "categoria": "Salário",
      "descricao": "Salário julho",
      "valor": 4200,
      "classificacao": "",               // Essencial/Não essencial — vazio = não classificado
      "forma": "Pix"
    },
    {
      "id": "tx_mdblt41s3c1r8g",
      "tipo": "saida",
      "data": "2026-07-08",
      "categoria": "Mercado",
      "descricao": "MERCADO BOM PRECO LTDA",
      "valor": 312.45,
      "classificacao": "Essencial",
      "forma": "Débito",
      "fitid": "20260708001"             // id do banco (extrato OFX) — deduplica reimportação
    },
    {
      // Compra parcelada: 3x de um valor total de R$ 250,00.
      // As PARCELAS não existem aqui — são derivadas (parcelas.js) toda vez:
      // dia 15 > fechamento 10 → 1ª fatura em 2026-09; 83,33 + 83,33 + 83,34.
      "id": "tx_mdblt41s4d2s9h",
      "tipo": "cartao",
      "data": "2026-07-15",
      "categoria": "Lazer",
      "descricao": "Show",
      "valor": 250,
      "classificacao": "Não essencial",
      "cartaoId": "card_mdblt41s1a9k2x",  // qual cartão (define o fechamento)
      "parcelas": 3                        // em quantas vezes
    },
    {
      // Pix pra conta própria, reclassificado na importação via config.contasProprias:
      // fica FORA de todos os totais.
      "id": "tx_mdblt41s5e3t0i",
      "tipo": "transferencia",
      "data": "2026-07-20",
      "categoria": "Transferência entre contas",
      "descricao": "PIX ENVIADO - Fulano de Tal",
      "valor": 500,
      "classificacao": "",
      "forma": "Importado",
      "fitid": "20260720003"
    }
  ],

  // ---- pagamentosFatura: acompanhamento do que você já pagou ------------
  // Escrito por registrarPagamentoFatura (index.js), lido por faturasPagas.js.
  // NUNCA conta como saída (a saída é a parcela) — é só progresso/quitação.
  // `data` = quando o dinheiro saiu; se for ANTES de mesFatura → adiantamento.
  "pagamentosFatura": [
    {
      "id": "pag_mdblt41s6f4u1j",
      "cartaoId": "card_mdblt41s1a9k2x",
      "mesFatura": "2026-09",            // qual fatura está sendo paga
      "valor": 83.33,
      "data": "2026-07-25",              // pago em julho, fatura de setembro → adiantamento
      "criadoEm": "2026-07-25T14:32:10.000Z"
    }
  ],

  // ---- faturas: o total que o BANCO informou ----------------------------
  // Escrito por definirFatura (index.js) — upsert por (cartaoId, mes).
  // Em totalFatura(), o informado VENCE a soma das parcelas quando > 0
  // (informado 0 = print vazio, não apaga parcelas reais — bug da sessão 12).
  "faturas": [
    {
      "id": "fat_mdblt41s7g5v2k",
      "cartaoId": "card_mdblt41s1a9k2x",
      "mes": "2026-08",                  // "YYYY-MM" da fatura
      "total": 431.9,                    // o número da tela do banco
      "fonte": "banco"
    }
  ],

  // ---- planejamentos: orçamento por mês × categoria ---------------------
  // Escrito por definirPlanejamento/repetirPlanejamento (index.js);
  // upsert por (mes, categoria); estimado <= 0 apaga (não guarda zero).
  "planejamentos": [
    { "id": "plan_mdblt41s8h6w3l", "mes": "2026-07", "categoria": "Mercado", "estimado": 400 },
    { "id": "plan_mdblt41s9i7x4m", "mes": "2026-07", "categoria": "Lazer", "estimado": 150 }
  ],

  // ---- reservas: o ledger da reserva de emergência ----------------------
  // Escrito por registrarReserva (index.js). valor > 0 aporta, < 0 resgata.
  // A reserva acumulada é a SOMA de todos os movimentos (derivada, nunca gravada).
  // É earmark: guardar não é gasto — só "carimba" dinheiro que já está em conta.
  "reservas": [
    { "id": "res_mdblt41sak8y5n", "mes": "2026-07", "valor": 300, "obs": "sobra do mês", "criadoEm": "2026-07-28T09:00:00.000Z" }
  ]
}
```

## Quem escreve × quem lê (resumo)

| Coleção | Quem escreve | Quem lê |
|---|---|---|
| `config` | Config, Revisar (regras), Metas, Planejar | UI (selects), `regras.js`, `importar.js`, `metas.js`, `reserva.js` |
| `cartoes` | Cartões (CRUD) | `parcelas.js`, `faturasPagas.js`, UI |
| `transacoes` | Lançar, Importar, Revisar | `calculos.js`, `parcelas.js`, `revisar.js`, `reserva.js` (gasto médio) |
| `pagamentosFatura` | Cartões (pagar/adiantar) | `faturasPagas.js` |
| `faturas` | Cartões (informar total do banco) | `faturasPagas.js` (`totalFatura`) |
| `planejamentos` | Planejar | `planejamento.js` |
| `reservas` | Reservas (guardar/resgatar) | `reserva.js`, `metas.js` |

## O que você NÃO encontra no arquivo (porque é derivado)

Procure e não vai achar: **parcelas** (recalculadas de `transacoes` +
`cartoes`), **lista de meses/anos** (projetada das datas), **saldos e totais**
(somados na hora), **score**, **reserva acumulada**, **restante de cada
fatura**. É o padrão *derive, don't store* ([`CONCEITOS.md`](./CONCEITOS.md)):
o arquivo guarda só **fatos primários**; tudo que dá pra calcular, se calcula
— assim não existe duas verdades pra dessincronizar.

## Valores válidos — as regras que o arquivo assume

- **Datas**: sempre `"YYYY-MM-DD"`; meses sempre `"YYYY-MM"` (ordem alfabética
  = ordem cronológica, por causa do zero à esquerda).
- **Dinheiro**: em **reais** no arquivo (o app converte pra centavos por
  dentro na hora de somar). Sempre positivo em `transacoes` (o sinal é o
  `tipo`); em `reservas`, o sinal é significado (+aporta/−resgata).
- **ids**: `novoId(prefixo)` — prefixo (`tx_`, `card_`, `pag_`, `fat_`,
  `plan_`, `res_`) + timestamp base-36 + contador + aleatório. Únicos por
  construção, e o prefixo documenta o tipo no olho.
- **Campo faltando não quebra**: todo leitor usa `|| []` / `|| 0` / defaults
  (`migrar()` + programação defensiva) — um arquivo velho ou editado à mão
  abre mesmo assim.
