# Armazenamento local corrompido — verificação e correção

- Base: `main` @ `46b3b4547e7513355c74747d5e81f0ccbe82cdd8` (PR #2 já presente)
- Dados: exclusivamente sintéticos (strings de teste em `localStorage` simulado).

## Relato anterior: "abre vazio sem avisar"
**Não se confirma para JSON corrompido.** No main atual, `storage.js` já abre vazio,
bloqueia `salvarEstado` (`falhaDeLeitura`), `app.js` mostra `AVISO_LEITURA` ao abrir e
ao tentar gravar, e `liberarGravacao()` só é chamado após importar backup
(`test/storage-leitura.test.mjs`, 3 testes passavam antes de qualquer edição).

## Lacunas reais encontradas (ainda no main)
1. JSON **válido porém não-objeto** (`[]`, `null`, `123`, `"texto"`): `carregar` devolvia
   estado vazio sem erro → sem aviso e com gravação liberada → o próximo save sobrescrevia.
2. Electron `lerDados()` engolia **qualquer** erro de leitura e devolvia `null`
   (permissão negada, falha de E/S no pendrive) → app vazio e gravável sobre o arquivo existente.

## Correção mínima
- `src/ui/storage.js`: `lerSeguro` rejeita não-objeto → mesmo bloqueio + aviso existentes.
- `electron/main.js`: `lerDados` só trata `ENOENT` como "não existe"; outros erros sobem
  e caem no bloqueio. Docs de estudo atualizadas (o `estudo.test.mjs` exige o espelho).
- Teste de regressão: `JSON válido mas que não é um objeto de dados também bloqueia o save`.
  Falhou antes (`not ok 4`) e passa depois.

## Comandos e resultados
- `node --test test/storage-leitura.test.mjs` antes da correção: 3 pass, 1 fail (novo teste).
- `node --test test/*.test.mjs` depois: 60 testes, 60 pass, 0 fail (Node v22.22.0).

## Limites
- A mudança em `electron/main.js` não tem teste automatizado (o módulo depende de `electron`;
  `test:e2e` não foi executado — sem display/Electron). Verificada por leitura e pelo caminho
  já testado (rejeição do IPC → `carregarEstado` captura → bloqueio).
- Arquivo vazio (0 bytes) continua tratado como "sem dados" (nada a perder).
- JSON objeto com campos de tipo errado (ex.: `{"transacoes":"x"}`) é normalizado por `migrar`
  e não bloqueia; fora do escopo desta correção.
- Não foi feito merge nem deploy.
