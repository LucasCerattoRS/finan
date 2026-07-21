# Fluxogramas — os caminhos principais

> Os outros documentos explicam **um arquivo de cada vez**. Este junta as
> peças: para uma ação concreta que você faria no app, por quais arquivos o
> dado passa, na ordem, até chegar no disco (ou na tela). Leia isto **depois**
> de já ter passado pelos arquivos individuais — aqui não se reexplica
> nenhuma função, só se mostra a costura entre elas.

---

## 1. Abrir o app (boot)

```
 electron/main.js                electron/preload.js         src/ui/app.js (init)
 ┌─────────────────┐             ┌──────────────────┐        ┌──────────────────────┐
 │ app.whenReady()  │             │ contextBridge     │        │ carregarEstado()      │
 │  → criarJanela() │──carrega──► │ window.finanwise  │        │  → temElectron()? SIM │
 │  loadFile(index. │   HTML      │  .ler()           │◄───────│  → window.finanwise   │
 │  html)           │             └──────────────────┘  invoke │      .ler()           │
 └─────────────────┘                                            └──────────┬────────────┘
                                                                            │ ipcRenderer.invoke('dados:ler')
                                                                            ▼
                                                          ┌─────────────────────────────┐
                                                          │ ipcMain.handle('dados:ler')  │
                                                          │  lerDados() → fs.readFileSync│
                                                          │  (ou null, se não existir)   │
                                                          └──────────────┬───────────────┘
                                                                         │ JSON (ou null)
                                                                         ▼
                                                          C.carregar(json)  ── migra + valida (core/index.js)
                                                                         │
                                                                         ▼
                                                    estado pronto ──► mesAtual = último mês com movimento
                                                                         │
                                                                         ▼
                                                    listeners de #tabs/#mesSelect presos (1x)
                                                                         │
                                                                         ▼
                                                              atualizarTopo() + render()
```

**Arquivos:** [`main.js`](./main.explicado.md) → [`preload.js`](./preload.explicado.md)
→ [`storage.js`](./storage.explicado.md) → [`index.js`](./index.explicado.md) (`carregar`)
→ [`app.js`](./app.explicado.md) (`init`).

**O detalhe que importa:** se `dados.json` não existir ainda (primeiro uso),
`lerDados()` devolve `null` em vez de erro — e `carregar(null)` sabe montar um
`estadoInicial()` limpo. O app nunca trava por falta de arquivo.

---

## 2. Lançar uma transação simples (entrada/saída)

```
 usuário preenche o form (Parte 3 de app.js)
        │  clica "Lançar" ou aperta Enter
        ▼
 estado = C.adicionarTransacao(estado, {tipo, data, categoria, valor, ...})
        │                                        (núcleo: valida, gera id, devolve estado NOVO)
        ▼
 mesAtual = C.mesDe(base.data)   ← pula pro mês do lançamento (senão ele "some" da tela)
        │
        ▼
 await persistir()
        │
        ├─► salvarEstado(estado) ──► storage.js ──► IPC 'dados:salvar' ──► main.js
        │                                                                     │
        │                                                    escreve .tmp → .backup →
        │                                                    backups/ (se der o intervalo) →
        │                                                    rename .tmp → dados.json (atômico)
        │
        ├─► atualizarTopo()  (saldo/mês/badge — fora de #view)
        │
        └─► render()  (reconstrói #view: dashboard ou a própria aba Lançar)
```

**Arquivos:** [`app.js`](./app.explicado.md) (Parte 1 e 3) →
[`index.js`](./index.explicado.md) (`adicionarTransacao`) →
[`storage.js`](./storage.explicado.md) → [`main.js`](./main.explicado.md).

**O detalhe que importa:** este é o **único** ritual de escrita do app inteiro
— toda mutação, em qualquer aba, termina em `persistir()`. Não existe um
segundo caminho que salve sem passar por aqui.

---

## 3. Uma compra no cartão vira parcelas em faturas futuras

```
 Lançar (tipo: 'cartao', valor: 900, parcelas: 3, cartaoId: X, data: '2026-07-15')
        │
        ▼
 estado = C.adicionarTransacao(estado, base)   ← só GRAVA a transação original
        │                                          (nenhuma parcela é criada/persistida aqui!)
        │
        │        ... mais tarde, sempre que algo PRECISA saber das parcelas ...
        ▼
 parcelasDaTransacao(tx, cartao)                              [parcelas.js]
        │
        ├─ mesPrimeiraFatura(tx.data, cartao)                 [faturas.js]
        │     dia 15 ≤ fechamento? → cai na fatura de +1 mês; senão +2
        │
        ├─ baseCent = Math.floor(90000 / 3) = 30000  (R$ 300,00)
        ├─ resto = 90000 - 30000*3 = 0
        │
        └─► 3 parcelas: {mesFatura: 08, n:1, valor:300} {09, n:2, valor:300} {10, n:3, valor:300}
                (se não dividisse exato, o resto cairia todo na parcela 3)
        │
        ▼
 essas parcelas são DERIVADAS toda vez que:
   - resumoMes/calculos.js soma "saídas" do mês da fatura
   - faturasPagas.js soma o total de uma fatura (fallback quando não há informado)
   - app.js (Cartões) lista "parcelas em aberto"
```

**Arquivos:** [`app.js`](./app.explicado.md) (Lançar) →
[`parcelas.js`](./parcelas.explicado.md) + [`faturas.js`](./faturas.explicado.md)
(nunca persistidas — recalculadas) → consumido por
[`calculos.js`](./calculos.explicado.md) e
[`faturasPagas.js`](./faturasPagas.explicado.md).

**O detalhe que importa:** parcelas nunca existem como registros gravados —
é o exemplo mais puro de "derive, don't store" do projeto inteiro (ver
[`CONCEITOS.md`](./CONCEITOS.md), tema 2). Se você for procurar "onde estão as
parcelas" no `dados.json`, não vai achar — só a transação original está lá.

---

## 4. Importar um extrato bancário

```
 usuário escolhe o arquivo .ofx/.csv
        │
        ▼
 C.parseExtrato(texto, nomeArquivo)         [importar.js — decide OFX ou CSV pela extensão]
        │
        ▼
 C.prepararImportacao(estado, brutos)       [importar.js]
        │  ├─ chave() de cada um → compara com transações JÁ existentes (fingerprint + fitid)
        │  ├─ marca duplicados (importar: false por padrão)
        │  ├─ reclassifica conta própria / pagamento de fatura → tipo: 'transferencia'
        │  └─ C.categorizar() sugere categoria via regras (mesmo motor da Parte 3 do Lançar)
        ▼
 candidatos = [...]   ← variável de MÓDULO, transiente — NADA foi salvo ainda
        │
        ▼
 render()   (NÃO persistir() — só mostra a tabela de pré-visualização)
        │
        │   usuário revisa linha a linha: desmarca, troca categoria, troca classificação
        │   (cada edição muta candidatos[i] DIRETO, sem re-render da tabela inteira)
        │
        ▼  clica "Importar selecionados"
 estado = C.importarTransacoes(estado, candidatos)   ← SÓ AGORA vira dado real
        │
        ├─ candidatos = null   (limpa a pré-visualização)
        ├─ tabAtual = 'lancamentos'   (pula pra ver o resultado)
        │
        ▼
 await persistir()   ← o mesmo ritual do Fluxo 2
```

**Arquivos:** [`app.js`](./app.explicado.md) (Parte 4) →
[`importar.js`](./importar.explicado.md) (`parseExtrato`, `prepararImportacao`,
`importarTransacoes`) → [`regras.js`](./regras.explicado.md) (`categorizar`).

**O detalhe que importa:** este é o exemplo mais claro de `render()` **sem**
`persistir()` no app inteiro — ver [`CONCEITOS.md`](./CONCEITOS.md), tema 7.
Ler um arquivo só popula uma prévia; nada toca o disco até a confirmação
explícita.

---

## 5. Revisar em lote — e uma regra nascer sozinha

```
 transações sem categoria (vieram de uma importação anterior)
        │
        ▼
 C.gruposParaRevisar(estado)                [revisar.js]
        │  chaveDescricao() "descasca" prefixos de banco (PIX, TED, COMPRA...)
        │  agrupa por (tipo | chave), soma valor, ordena desc (Pareto: maiores primeiro)
        ▼
 grupos = [{chave: "MERCADO XYZ", nomeado: true, ids:[...], total: 450}, ...]
        │
        │   usuário escolhe categoria + classificação, clica "Aplicar"
        ▼
 C.categorizarLote(estado, ids, categoria, classificacao, g.nomeado ? g.chave : null)
        │                                                          │
        │                                            se null: só categoriza ESSAS transações
        │                                            se chave: TAMBÉM chama adicionarRegra
        │                                                     (nasce uma regra nova)
        ▼
 await persistir()
        │
        ▼
 da próxima vez que este mesmo destino aparecer numa importação:
 C.categorizar() (regras.js) já casa a nova regra → categoria automática, sem revisar de novo
```

**Arquivos:** [`app.js`](./app.explicado.md) (Parte 4) →
[`revisar.js`](./revisar.explicado.md) (`gruposParaRevisar`) →
[`index.js`](./index.explicado.md) (`categorizarLote`, `adicionarRegra`) →
[`regras.js`](./regras.explicado.md) (fecha o ciclo na próxima importação).

**O detalhe que importa:** a regra **só** nasce quando `g.nomeado` é
verdadeiro — um Pix anônimo ("PIX SICREDI", sem contraparte) pode ser
categorizado uma vez, mas nunca vira regra automática, porque não há garantia
de que o próximo Pix anônimo seja da mesma pessoa.

---

## 6. Earmark: guardar reserva e ver o "disponível" mudar

```
 tela Reservas: usuário escolhe "Guardar", digita R$ 500
        │
        ▼
 sinal = +1  (Guardar) ou -1 (Resgatar)
        │
        ▼
 estado = C.registrarReserva(estado, {mes: mesAtual, valor: sinal * 500, obs})
        │                                            [reserva.js: é só um novo item no ledger]
        ▼
 await persistir()
        │
        ▼
 na PRÓXIMA leitura de resumoReserva(estado, ano):
        │
        ├─ reservaAcumulada = soma de TODOS os movimentos (+aportes, −resgates)
        │
        ├─ disponivelCent = paraCentavos(dinheiroEmConta(estado)) − totalCent
        │                          [calculos.js]                    [earmark: nunca conta 2x]
        │
        └─ progresso = clamp(total / (gastoMedioMensal × metaMeses), 0, 1)
        │
        ▼
 tela Início (hero) E tela Reservas mostram o "disponível" já atualizado —
 SEM que "guardar" tenha aparecido em nenhum lugar como uma saída
```

**Arquivos:** [`app.js`](./app.explicado.md) (Parte 6) →
[`reserva.js`](./reserva.explicado.md) (`registrarReserva`, `resumoReserva`) →
lê [`calculos.js`](./calculos.explicado.md) (`dinheiroEmConta`).

**O detalhe que importa:** `dinheiroEmConta` não muda com um aporte de
reserva (é dinheiro que já estava ali) — só o `disponivel` muda, porque ele
subtrai a reserva. Ver o conceito de *earmark* no
[`GLOSSARIO.md`](./GLOSSARIO.md).

---

## 7. O ciclo de renderização (visão de 10.000 pés)

```
                    ┌─────────────────────────────────────────┐
                    │   QUALQUER mutação em QUALQUER aba       │
                    │   estado = C.operacaoQualquer(estado,…)  │
                    └───────────────────┬───────────────────────┘
                                        ▼
                              await persistir()
                    ┌───────────────────┼───────────────────────┐
                    ▼                   ▼                       ▼
           salvarEstado(estado)   atualizarTopo()            render()
          (storage → IPC → main)  (patch: #mesSelect,      v.innerHTML = ''
                                    #saldoPill, #badge —    { tabAtual: renderX }[tabAtual](v)
                                    fora de #view)                 │
                                                                     ▼
                                                     renderX constrói DOM com el()/charts.js
                                                     lendo SÓ o estado atual — nunca guarda
                                                     nada de uma renderização pra outra
```

**O detalhe que importa:** repare que **as três setas saem do mesmo
`persistir()`** — não existe uma aba que só salva, ou que só redesenha. É
essa uniformidade que torna o app inteiro previsível: não importa qual botão
você clicou, o caminho até a tela atualizar é sempre o mesmo.

---

**Próximo:** [`EXERCICIOS.md`](./EXERCICIOS.md) — agora que você viu os
arquivos isolados e os fluxos completos, é hora de testar se ficou.
