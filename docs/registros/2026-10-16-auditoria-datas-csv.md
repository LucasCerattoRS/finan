# Auditoria 16/10/2026 — fuso nas datas e cabeçalho do CSV

- Base: `main` @ `42fece9`. Branch: `fix/auditoria-datas-csv`.
- Dados: exclusivamente sintéticos nos testes novos.

## Defeitos encontrados e corrigidos
1. **"Hoje" em UTC.** `app.js` (`hoje()`, `mesAtual`) e `registrarPagamentoFatura` usavam
   `new Date().toISOString().slice(...)`. Em `America/Sao_Paulo`, às 23:30 de 31/10 isso dá
   `2026-11-01`: o formulário sugeria o dia seguinte e o app abria no mês seguinte.
   Correção: `dataLocalISO`/`mesLocalISO` em `src/core/model.js` (getFullYear/getMonth/getDate).
2. **CSV: descrição = coluna da data.** Cabeçalho `Data Lançamento` contém `lancamento`, um dos
   sinônimos de descrição; `acha` devolvia a mesma coluna para os dois. Correção: `acha` tenta os
   sinônimos em ordem de prioridade e pula colunas já usadas.
3. **CSV com linhas antes do cabeçalho devolvia `[]`.** O cabeçalho era sempre a linha 0.
   Correção: o cabeçalho é a primeira linha (entre as 20 primeiras) com coluna de data e de valor.

## Testes
- Antes da correção: `node --test test/importacao.test.mjs test/datas-locais.test.mjs` →
  13 pass, 4 fail (os 4 testes novos).
- Depois: `node --test test/*.test.mjs` → 64 pass, 0 fail (Node v22.22.0).
- Espelhos de estudo atualizados (`app.parte1`, `app.parte7`, `importar`, `index`, `model`).

## Limites / pendências
- `test:e2e` (Electron) não foi executado: sem Electron instalado e sem abrir janela.
- O nome do arquivo de backup (`src/ui/storage.js`) e `criadoEm` continuam em UTC; `criadoEm`
  é carimbo de tempo (UTC é o correto), o nome do backup só afeta o rótulo do arquivo.
- Datas impossíveis no CSV/OFX (ex.: `31/02/2026`) ainda passam sem validação.
- A varredura de dados pessoais encontrou um item no repositório; relatado ao dono fora do
  repositório, sem reproduzir o conteúdo aqui.
