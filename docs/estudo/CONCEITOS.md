# Conceitos — os padrões recorrentes, por tema

> Cada um dos 16 documentos de `docs/estudo/` termina numa tabela "conceitos
> que apareceram". Este arquivo é a **fusão** de todas elas, organizada por
> tema em vez de por arquivo — porque o mesmo padrão aparece em lugares
> distantes do código, e ver as ocorrências juntas ensina mais do que ver
> cada uma isolada. Onde o [`GLOSSARIO`](./GLOSSARIO.md) dá a definição
> rápida, aqui tem o **porquê** e o **quando usar**.

---

## 1. A arquitetura em duas camadas

O projeto inteiro é uma aplicação de uma ideia só, em escalas diferentes:
**separar o que decide (puro, testável) do que executa no mundo real
(efeito colateral, difícil de testar)**.

- **Núcleo puro / casca impura.** `src/core` nunca importa nada de DOM, nunca
  faz IO, nunca muda o objeto que recebe — só devolve um novo. Isso é o que
  permite `npm run test:core` rodar em milissegundos, sem subir Electron
  nenhum. Toda vez que você se pergunta "isso deveria morar no núcleo ou na
  UI?", a resposta é: se depende de `window`, `document`, `fs` ou de
  formatação pra humano (ver item 7), é casca; se é uma regra que seria
  verdade mesmo rodando num servidor sem tela, é núcleo. Ver
  [`index.explicado.md`](./index.explicado.md), `prazoLegivel` em
  [`app.explicado.md`](./app.explicado.md) (Parte 7) é o exemplo mais claro
  do teste aplicado.
- **CQS — Command-Query Separation.** Dentro do próprio núcleo,
  [`calculos.js`](./calculos.explicado.md) (pergunta, nunca muda) é uma
  metade; as mutações em `index.js` são a outra. Nenhuma função de leitura
  tem efeito colateral, nenhuma mutação devolve um cálculo derivado — só o
  estado novo.
- **Adapter.** Quando duas implementações completamente diferentes
  (Electron IPC vs. `localStorage`) precisam ser intercambiáveis sem que
  quem chama saiba a diferença. Ver [`storage.js`](./storage.explicado.md).
  Vale a pena **só** quando o número de backends é pequeno e a escolha entre
  eles não muda no meio de uma sessão — senão, dependency injection explícita
  é mais fácil de testar.
- **Allowlist estreita, nunca um túnel genérico.** Sempre que uma fronteira
  de confiança é cruzada (processo principal → página, dado do usuário →
  regra automática), expor uma lista **fechada e nomeada** de operações, não
  um `invoke(qualquerCoisa)` genérico. Ver
  [`preload.explicado.md`](./preload.explicado.md).

---

## 2. Imutabilidade: copiar, nunca mutar

- **Spread para enriquecer/copiar objetos.** `{ ...obj, campoNovo: valor }`
  aparece centenas de vezes — é como toda mutação do núcleo "atualiza" um
  registro sem tocar o original. Regra prática: se você está prestes a fazer
  `objeto.campo = x`, pare — em 95% do código deste projeto, a resposta certa
  é `{ ...objeto, campo: x }`.
- **Cópia defensiva antes de editar na UI.**
  `comps = lista.map((c) => ({ ...c }))` em
  [`app.js`](./app.explicado.md) (Parte 7) clona cada item antes de deixar a
  tela editá-lo — sem isso, editar um input mutaria o `estado` global por
  referência, por fora do fluxo `persistir()`.
- **Derive, don't store (derive, não armazene).** Nada que possa ser
  **calculado** a partir do que já existe é guardado separadamente: meses com
  movimento, parcelas de uma compra, o saldo acumulado — tudo é recalculado a
  cada leitura, nunca persistido como um campo próprio que precisaria ficar
  sincronizado manualmente. Ver [`calculos.explicado.md`](./calculos.explicado.md)
  e [`parcelas.explicado.md`](./parcelas.explicado.md). O trade-off: mais
  CPU a cada leitura (irrelevante no volume de dado deste app), zero risco de
  dado duplicado ficar desatualizado.

---

## 3. Estruturas de dados como solução, não como detalhe

- **`Set` para deduplicar ou unir fontes.** Sempre que a pergunta é "quais
  valores distintos existem aqui, vindos de 2+ lugares" — meses com
  movimento, fingerprints de importação, categorias visíveis num `<select>`.
- **`Map` para indexar (O(1)) ou agrupar.** Pré-construir um `Map` por id
  antes de um loop evita busca linear repetida (`todasParcelas` indexando
  cartões antes de processar transações — ver
  [`parcelas.explicado.md`](./parcelas.explicado.md)). Agrupar por chave
  (`gruposParaRevisar`) é a outra face da mesma moeda.
- **`reduce` para agregação.** Somar centavos, achar o maior valor, montar um
  objeto de totais — o idioma padrão sempre que "preciso de **um** resultado
  a partir de **muitos** itens".
- **União via `Set` de duas fontes que deveriam concordar, mas podem
  divergir.** `proximasFaturas` une meses vindos de `estado.faturas` **e** de
  parcelas, porque um mês pode ter uma fonte sem ter a outra — se usasse só
  uma fonte, esconderia informação real.

---

## 4. Controle de fluxo: dado como configuração

- **Guard clause (retorno antecipado).** `if (condição-ruim) return
  padrão;` no topo, sem aninhar o resto num `else`. O idioma mais repetido do
  núcleo inteiro — qualquer função com mais de uma "saída válida" quase
  sempre usa isso em vez de `if/else` profundo.
- **Cascata de prioridade resolvida de cima pra baixo.** Uma sequência de
  `if`s que na prática é uma lista ordenada de preferência — regras do
  usuário antes das padrão ([`regras.js`](./regras.explicado.md)), variáveis
  de ambiente antes do fallback de pasta
  ([`main.js`](./main.explicado.md)). O padrão sempre tem a mesma forma: teste
  o mais específico primeiro, caia pro mais genérico por último.
- **Tabela de despacho (objeto como `switch`).** `{chave: função}[valor] ||
  padrão` substitui uma cadeia de `if/else if` por uma busca O(1) — usado
  pelo roteador de abas em [`app.js`](./app.explicado.md) (Parte 1) e,
  conceitualmente, por `regras.js` também.
- **First-match-wins + mais específico primeiro.** Quando várias regras
  poderiam casar o mesmo dado, a ordem do array decide, e regras específicas
  vêm antes de regras genéricas — do contrário, uma regra genérica capturaria
  o caso antes da regra específica ter chance.

---

## 5. Números, dinheiro e o que pode dar errado com eles

- **Tudo em centavos, inteiro.** Nunca somar valores em reais (float) — a
  soma vira centavos (`paraCentavos`), toda a aritmética acontece em inteiro,
  e só se converte de volta pra reais (`paraReais`) na borda de saída. Evita
  o clássico `0.1 + 0.2 !== 0.3` do IEEE 754 aplicado a dinheiro.
- **O resíduo vai pro último item.** Dividir uma compra em N parcelas usa
  `Math.floor(total/n)` pra cada uma, com o resto inteiro somado **só na
  última** — garante que a soma das parcelas feche exatamente o valor da
  compra (a regra do `CLAUDE.md`), nunca perdendo ou inventando 1 centavo.
- **Clamp (saturação) + guarda de divisão por zero.** Quase todo "progresso
  rumo a uma meta" no app segue o mesmo esqueleto:
  `alvo > 0 ? Math.max(0, Math.min(atual/alvo, 1)) : 0`. Reconhecer esse
  esqueleto poupa reler a lógica cada vez que aparece (fatura, reserva,
  metas, planejamento).
- **Juros compostos via raiz 12ª, nunca dividir por 12.** Converter uma taxa
  anual pra mensal é `(1+taxaAnual)^(1/12) - 1`, não `taxaAnual/12` — a
  segunda forma **parece** razoável mas está matematicamente errada (ignora
  o efeito composto mês a mês). Ver
  [`metas.explicado.md`](./metas.explicado.md).
  Simulação iterativa mês a mês, com teto de 1200 meses (100 anos) devolvendo
  `null` — "nunca chega" é um resultado válido, não um erro.
- **"Nice numbers" para eixo de gráfico.** O topo de um eixo Y não é o valor
  máximo exato — é o menor número "redondo" (de uma lista fina de
  multiplicadores) que já cobre o máximo, pra não desperdiçar altura de
  gráfico nem cortar dado. Ver [`charts.explicado.md`](./charts.explicado.md).

---

## 6. Parsing e texto

- **Heurística de formato ao invés de configuração explícita.** O parser de
  CSV decide se um número é formato BR (`1.234,56`) ou US (`1,234.56`) **sem
  perguntar** — olhando qual separador aparece **por último** na string. Da
  mesma forma, o parser detecta `;` vs `,` como separador de coluna testando
  qual aparece mais na primeira linha. Ver
  [`importar.explicado.md`](./importar.explicado.md).
- **State machine pra CSV com aspas.** Dividir uma linha de CSV respeitando
  campos entre aspas (que podem conter o próprio separador) exige lembrar
  "estou dentro de aspas?" enquanto anda caractere a caractere — não dá pra
  resolver com um `.split(',')` ingênuo.
- **RegExp dinâmica pra extrair tags.** Construir um `new RegExp(tag, ...)`
  a partir de uma variável, em vez de escrever um literal por tag, quando o
  mesmo padrão de extração se repete pra N nomes de tag diferentes (parser
  OFX).
- **Regex: âncoras, grupos de captura, quantificador preguiçoso.**
  `^`/`$` prendem o casamento ao início/fim; `(...)` captura uma parte
  específica pra reusar; `*?` (preguiçoso) para no primeiro fechamento
  possível em vez do último — importante quando o texto pode ter múltiplas
  ocorrências do delimitador de fechamento.
- **Fingerprint + `Set` para deduplicar sem ID.** Quando os dados de origem
  não trazem um identificador único confiável, derive uma chave (data +
  valor + descrição normalizada) e use um `Set` pra saber "já vi isso".

---

## 7. UI sem framework

- **Hyperscript.** Uma função `(tag, props, filhos) → elemento` reimplementa,
  em ~15 linhas, o que frameworks de componente resolvem com JSX. Duas
  variantes no projeto: `s()` (SVG, namespace obrigatório) e `el()` (HTML).
- **Reconstruir tudo é o padrão; patch cirúrgico é a exceção deliberada.**
  `render()` apaga e reconstrói `#view` inteiro a cada mudança de aba/mês —
  simples de raciocinar (a tela é sempre função do estado atual). As exceções
  (alternar visibilidade de campo sem re-render, mutar `candidatos[i]` sem
  redesenhar a tabela inteira, atualizar o cabeçalho fora de `#view`) sempre
  existem por um motivo concreto: preservar o que o usuário estava digitando,
  ou evitar o custo de redesenhar algo grande a cada tecla. Ver
  [`app.explicado.md`](./app.explicado.md), Partes 1, 3 e 4.
- **Formatação humana pertence à UI, nunca ao núcleo.** `mesesParaAlvo`
  devolve um inteiro; `prazoLegivel` (só existe em `app.js`) decide como
  fraseá-lo em português. O núcleo entrega fatos; a casca decide como
  apresentá-los.
- **Design tokens.** Nomear cor/espaçamento pelo **papel** (`--pos`,
  `--surface`) e não pela aparência, centralizados em custom properties —
  permite reskinning completo (tema claro/escuro) trocando só ~20 variáveis,
  nunca as regras dos componentes.
- **Promisificar API antiga baseada em evento.** `new Promise((resolve) => {
  input.onchange = ... })` deixa `FileReader`/`<input type=file>` (préviamente
  callback-only) usáveis com `await`.

---

## 8. Persistência e integridade

- **Migração versionada (`schemaVersion`).** Todo dado carregado passa por
  `migrar()`, que preenche campos novos com default sem exigir que dado
  antigo seja reescrito à força — e preserva qualquer campo desconhecido em
  vez de descartá-lo (a correção mais crítica de integridade feita no
  projeto até hoje, ver `PLANO.md`, sessão 9).
  Aditivo por padrão: a maioria das mudanças de schema não precisa nem
  incrementar `schemaVersion` — só ganhar um `|| valorPadrão` no lugar certo.
- **Escrita atômica via tmp+rename.** Nunca escrever por cima do arquivo
  real diretamente — escrever num `.tmp` e só then renomear (operação
  indivisível no sistema de arquivos) evita corromper o dado se o processo
  cair no meio da gravação.
- **Backup em camadas, cada uma com um propósito diferente.** `.backup`
  (a versão imediatamente anterior, pra desfazer erro percebido na hora) e
  `backups/dados-AAAAMMDD-HHMMSS.json` (histórico datado, com rotação, pra
  erro percebido dias depois) não são redundantes — resolvem problemas de
  escala de tempo diferentes.
- **Nome de arquivo ordenável = timestamp no prefixo.** `AAAAMMDD-HHMMSS`
  como prefixo faz ordenação de string coincidir com ordenação cronológica,
  sem nunca precisar re-parsear a data pra comparar.
- **Sentinela `0`/`null` para "ainda não aconteceu".** Explorar que `0` é
  falsy em JS pra sinalizar "primeira vez" sem precisar de um booleano
  explícito à parte — cuidado: só funciona quando o valor real nunca é
  legitimamente `0`/`null` em uso normal.
- **Backup como rede de segurança, nunca como requisito.** Toda a lógica de
  backup datado roda dentro de um `try/catch` que nunca deixa uma falha ali
  impedir a gravação real do dado — a prioridade #1 é sempre salvar o que o
  usuário pediu.

---

**Próximo:** [`FLUXOGRAMA.md`](./FLUXOGRAMA.md) — os mesmos conceitos, agora
seguidos **através** do app, mostrando o caminho completo de um dado desde a
tela até o disco (e de volta).
