# Arquitetura do FinanWise

Documento vivo. Registra o modelo de dados, as regras de negócio (herdadas da planilha *FinanWise 2026*) e as decisões técnicas.

## 1. Visão geral

```
┌─────────────────────────────────────────────┐
│  Electron (janela desktop, Linux + Windows)  │
│  electron/main.js  ── cria a janela          │
│  electron/preload.js ── ponte segura p/ IO   │
└───────────────┬─────────────────────────────┘
                │ carrega
        ┌───────▼────────┐
        │  src/ui (telas)│  vanilla JS + HTML + CSS
        └───────┬────────┘
                │ usa
        ┌───────▼────────┐
        │  src/core      │  lógica pura, sem DOM, testável com `node --test`
        │  modelo, cálculos de fatura/parcela/score
        └───────┬────────┘
                │ persiste via preload
        ┌───────▼────────┐
        │   dados.json   │  arquivo único, portátil (fora do git)
        └────────────────┘
```

- **`src/core` é puro** (sem `window`/DOM): recebe o estado, devolve derivados. Isso deixa a lógica testável e reaproveitável fora do Electron (ex.: rodar no navegador ou num script Node).
- **`src/ui`** só lê do core e desenha; escrita passa por uma função de storage.
- **Persistência** via Electron (`fs`) num JSON. Fallback no navegador: `localStorage` + export/import.

## 2. Modelo de dados (`dados.json`)

Origem: a planilha tinha abas por mês, uma aba `Base` que consolidava as compras de cartão, uma aba `Parcelas` que explodia cada compra em N parcelas, `Cadastro de Cartão`, `Pagamentos Cartão` e `Categorias`. Aqui isso vira **um estado normalizado**; os derivados (parcelas, faturas, totais) são **calculados**, não armazenados.

```jsonc
{
  "schemaVersion": 1,
  "config": {
    "moeda": "BRL",
    "categorias": ["Salário", "Vale Alimentação", "Mercado", "..."],
    "formasPagamento": ["Pix", "Dinheiro", "Transferência bancária", "Débito", "Boleto"],
    "classificacoes": ["Essencial", "Não essencial"]
  },
  "cartoes": [
    { "id": "c1", "nome": "Sicredi", "fechamento": 25, "vencimento": 10 }
  ],
  "transacoes": [
    // ENTRADA
    { "id": "t1", "tipo": "entrada", "data": "2026-02-06",
      "categoria": "Salário", "descricao": "", "valor": 2935.73,
      "forma": "Transferência bancária", "classificacao": "Essencial" },
    // SAÍDA (dinheiro/pix/débito — sai da conta na hora)
    { "id": "t2", "tipo": "saida", "data": "2026-03-11",
      "categoria": "Psicanalise", "descricao": "", "valor": 320.00,
      "forma": "Pix", "classificacao": "Essencial" },
    // COMPRA NO CARTÃO (vira parcelas; entra na conta como fatura)
    { "id": "t3", "tipo": "cartao", "data": "2026-02-16",
      "categoria": "Notebook", "descricao": "Compra Notebook", "valor": 5099.00,
      "cartaoId": "c1", "parcelas": 10, "classificacao": "Não essencial" }
  ],
  "pagamentosFatura": [
    { "id": "p1", "cartaoId": "c1", "mesFatura": "2026-03", "valor": 598.60,
      "criadoEm": "2026-03-09T09:16:49", "obs": "" }
  ]
}
```

### Por que "tipo" em vez de abas por mês
Na planilha, cada transação morava fisicamente na aba do mês. Aqui a transação tem uma **`data`** e o mês é derivado dela (`data.slice(0,7)` → `"2026-02"`). Filtrar por mês é uma função, não uma aba. Isso elimina as 12 abas duplicadas e as fórmulas gigantes de consolidação.

## 3. Regras de negócio (o "cérebro", herdado das fórmulas)

### 3.1 Parcelas (era a aba `Parcelas`)
Uma transação `tipo: "cartao"` com `parcelas = N` e `valor = V` gera **N parcelas de `V/N`**. A parcela `k` (1..N) cai na fatura do mês da compra + (k−1) meses, ajustado pelo fechamento do cartão (ver 3.2). O valor da última parcela absorve o resíduo do arredondamento para que a soma feche exatamente `V`.

### 3.2 Mês da fatura (fechamento/vencimento)
Cada cartão tem `fechamento` (dia) e `vencimento` (dia). Uma compra feita **até o dia de fechamento** entra na fatura que vence no mês seguinte; feita **depois do fechamento**, pula para a fatura do mês subsequente. `mesFatura` é sempre `"YYYY-MM"`.

### 3.3 Totais mensais (era o Dashboard)
Para um mês `M`:
- **Entradas(M)** = soma de `entrada` com `data` em M.
- **Saídas(M)** = soma de `saida` em M **+** soma das **parcelas** cuja `mesFatura == M` (a fatura é o que efetivamente sai da conta), respeitando os `pagamentosFatura` registrados.
- **Dinheiro em conta** = Entradas − Saídas (acumulável ou por mês, conforme a tela).

### 3.4 Score de saúde financeira
Índice 0–100 (planilha mostrava 74 = "Saudável"). Composto por: saldo positivo, proporção Essencial vs Não essencial, e comprometimento com faturas/parcelas futuras. Fórmula exata documentada junto ao código em `src/core/score.js` (versionada aqui quando estabilizar).

## 4. Decisões técnicas

| Decisão | Escolha | Porquê |
|---|---|---|
| Desktop | **Electron** | node já instalado nos 2 SOs; janela+ícone; cross-platform |
| UI | **Vanilla JS** (sem framework/build) | máxima editabilidade, roda também em `file://` |
| Dados | **JSON em arquivo** | portátil no pendrive; legível; fácil backup |
| Empacote | electron-builder → **AppImage** + **.exe portátil** | um arquivo por SO, sem instalador |
| Precisão monetária | somar em **centavos** / `Math.round`; exibir `toFixed(2)` | evitar erro de float |

## 5. Invariantes (não quebrar)
1. **Cross-platform**: nenhum caminho hardcoded; usar API do Node/Electron.
2. **Nunca corromper `dados.json`**: escrever com backup; migração versionada por `schemaVersion`.
3. **Nada de dado financeiro real no git** (`.gitignore`).
4. **Soma das parcelas == valor da compra** (sempre).

## 6. Paridade com a planilha (auditado em 2026-07-13; macros conferidas)

Comparado aba a aba com a planilha no Drive **e com o código do Apps Script** (o autor colou `Código.gs`, `SidebarEntrada`, `SidebarSaida` e `PlanejamentoPM`). O que as macros revelaram:

- **A regra de fatura do `faturas.js` está certa** — e agora verificada. O script arquiva a compra na aba do mês da compra se `dia <= fechamento`, senão na do mês seguinte (`_getSheetForCreditByClosing_`); a fatura daquela aba é paga no mês seguinte. Isso é exatamente o `+1 / +2` de `mesPrimeiraFatura()`. Confere com os dados reais (compra 01/04 aparece como parcela 1/3 em maio).
- **O modelo de pagamento de fatura já estava correto**: a aba `Pagamentos Cartão` guarda `MesISO | Cartão | Valor | Criado em | Obs`, igual ao nosso `pagamentosFatura`.
- **Bug na planilha (não no app)**: `salvarReservaPM` grava 4 valores (`[mês, valor, obs, data]`) nas colunas 1–4, mas a aba `Reservas PM` tem 5 colunas (`Mês | Ação | Valor | Obs | Criado em`). O valor da reserva cai na coluna "Ação". Metas de reserva registradas por lá estão desalinhadas.
- **A explosão das parcelas (valor ÷ N) e o score NÃO estão nas macros** — são fórmulas das abas `Parcelas`/`Dashboard`. Continuam sendo a única parte não auditada.

Fontes no Drive: *(referências às planilhas originais removidas da versão pública)*

| Recurso da planilha | No app? | Onde |
|---|---|---|
| Cadastro de Cartão (nome, fechamento, vencimento) | ✅ | tela Cartões |
| Cadastro de entradas / saídas (12 abas de mês) | ✅ | tela Lançamentos (mês vem da `data`) |
| Controle de Pagamentos Parcelados (aba `Parcelas`) | ✅ | tela Parcelas + `src/core/parcelas.js` |
| Fatura por fechamento/vencimento | ✅ | `src/core/faturas.js` |
| Categorias / formas de pagamento / Essencial×Não essencial | ✅ | tela Config |
| Dashboard: entradas, saídas, saldo, gastos por categoria | ✅ | tela Dashboard |
| Saúde financeira (score) | ⚠️ | existe, mas é **fórmula nova** (`score.js`), não a da planilha (que está em fórmula, não em macro) |
| Cadastro de pagamento dos cartões (Total pago, Progresso) | ✅ | tela Cartões → "Faturas do mês" + `faturasPagas.js` |
| Resumo de cartões / Resumo de faturas | ✅ | Início → "Faturas deste mês" |
| Dinheiro comprometido (parcelas futuras) | ✅ | `comprometidoFuturo()`, no KPI "Em conta" |
| **Importar extrato do banco (OFX/CSV) + auto-categorizar** | ✅➕ | tela Importar — **não existia na planilha**; é o que mata a digitação |
| **Planejamento mensal** (valor *estimado* por categoria, "repetir p/ demais meses", `$ Estimado × $ Real`) | ✅ | tela **Planejar** + `src/core/planejamento.js` (sessão 6) |
| **Reserva de emergência** (aba `Reservas PM`, Reserva Anual, Disponível para gastar) | ❌ | macro `salvarReservaPM` conhecida (e bugada, ver acima) |
| **Visão anual** (Entrada/Saída/Reserva Anual) | ✅ | card "Visão anual" no Início + `resumoAno`/`anosComMovimento` em `calculos.js` (sessão 6) |
| Bônus: Simulador de Reserva de Emergência, Rastreador de Tarefas (FinanFocus) | ❌ | planilhas **separadas**, fora do escopo até aqui |

### Sobre os "scripts" (Apps Script)
Os botões da planilha (`Enviar`, `Enviar pagamento`, `Clique aqui…`) são macros do Google Apps Script. **O código-fonte desses scripts não foi inspecionado**: a API do Drive não expõe o projeto de script vinculado a uma planilha. Ou seja, o que existe aqui é uma **reimplementação do comportamento observável** (abas, colunas, fórmulas e resultados), não um port linha a linha das macros. Para auditar as macros seria preciso abrir a planilha no navegador em *Extensões → Apps Script* e copiar o código.

## 7. Backlog / melhorias sobre a planilha
- Filtros e busca por categoria/cartão/período.
- Gráficos (usar a skill `graphify`/dataviz para o dashboard).
- Metas e reservas de emergência.
- Recorrências (salário, assinaturas) lançadas automaticamente.
- Exportar CSV/planilha para quem quiser voltar ao Sheets.
