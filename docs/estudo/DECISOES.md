# Decisões de arquitetura — por que assim, e por que NÃO de outro jeito

> Cada `.explicado.md` justifica decisões locais. Este documento junta as
> decisões **macro** — as que definem o projeto inteiro — no formato: contexto,
> escolha, alternativas rejeitadas (com o que se perdeu ao rejeitá-las, porque
> toda escolha custa algo) e o contexto histórico da tecnologia quando ele
> ajuda a entender. Nada aqui é "a resposta certa universal": é a resposta
> certa **para as restrições deste app** — offline, portátil num pendrive,
> dois SOs, um mantenedor.

---

## 1. Por que Electron — e por que Electron existe

**Contexto histórico.** Até ~2013, escrever um app desktop multiplataforma
significava C++/Qt, Java/Swing ou escrever duas vezes. O GitHub, construindo o
editor Atom, criou o "Atom Shell" (rebatizado Electron em 2015): a ideia era
embutir um **Chromium** (o motor do Chrome, que já resolvia render, layout e
portabilidade de UI) junto com um **Node.js** (que já resolvia acesso a
arquivos, processos e rede) num executável só. De repente, "sei fazer página
web" passou a implicar "sei fazer app desktop". VS Code, Discord, Slack,
Obsidian — todos são Electron. O preço ficou famoso também: cada app carrega o
próprio navegador inteiro (~100 MB e centenas de MB de RAM).

**A escolha aqui.** Electron 33, única dependência de runtime.

**Por que não uma PWA / web app?** O requisito matador é **offline com dados
locais em arquivo**. Navegador não dá acesso confiável ao sistema de arquivos
(File System Access API existe, mas é limitada, pede permissão por sessão e
não funciona igual nos dois SOs), e um web app pressupõe servidor ou depende
de armazenamento do navegador — que é por-máquina e apagável. O `dados.json`
num pendrive, legível por qualquer editor de texto, é o oposto disso.

**Por que não Tauri?** Tauri (2019+) gera binários muito menores usando a
webview do sistema em vez de embutir o Chromium, com backend em Rust. É a
alternativa moderna séria. Custos que pesaram contra, aqui: (1) a webview
**varia por SO** (WebView2 no Windows, WebKitGTK no Linux) — testar num SO não
garante o outro, exatamente o tipo de dor que um projeto de um mantenedor em
dois SOs quer evitar; Electron embute o mesmo Chromium nos dois; (2) exige
toolchain Rust; (3) o modo "portable de pendrive" com dados ao lado do
executável é caminho batido no electron-builder. **O que se perdeu:** ~100 MB
de binário e memória — irrelevante para um app pessoal rodando numa máquina de
desenvolvimento, mas seria a decisão errada para distribuir a milhões de
usuários.

---

## 2. Por que JavaScript puro — sem React, sem bundler

**Contexto histórico.** Frameworks como React (2013) nasceram para um problema
específico: **manter muitas partes da tela sincronizadas com um estado que
muda o tempo todo** (o feed do Facebook), com equipes grandes. A solução —
declarar a UI como função do estado e deixar o framework descobrir o mínimo a
atualizar (virtual DOM) — custa: build step, dependências (centenas de
pacotes transitivos), e uma camada de abstração entre você e o que roda.

**A escolha aqui.** ES modules direto no navegador (o Chromium do Electron é
sempre atual — não existe "e se o navegador do usuário for velho"), DOM
construído com um helper `el()` de ~15 linhas, e a regra "toda mudança
reconstrói a tela inteira".

**Por que não React?** Os dois benefícios centrais dele não se aplicam: não há
equipe (não precisa da padronização), e não há UI de alta frequência (não
precisa do diff eficiente — ver decisão 4). Os custos, porém, se aplicariam
todos: `node_modules` gigante, build step entre editar e rodar, dependência de
cadeia de suprimentos (um app **financeiro offline** com zero pacotes de
terceiros na UI tem superfície de ataque quase nula — não existe "npm install
comprometido" do que não se instala). **O que se perdeu:** JSX (o `el()` é
mais verboso), o ecossistema de componentes prontos, e a familiaridade — quem
chega sabendo React precisa desaprender um pouco. Para *estudar* JavaScript de
verdade, isso é bônus: aqui se vê o DOM cru que os frameworks escondem.

---

## 3. Por que um arquivo JSON — e não SQLite (nem localStorage)

**A escolha.** Todo o estado é **um** objeto, serializado num **único**
`dados.json`, reescrito por inteiro a cada mudança (com escrita atômica e
backups em camadas — ver [`main.explicado.md`](./main.explicado.md)).

**Por que não SQLite?** SQLite é a resposta padrão para dados locais — e seria
a escolha certa se os dados fossem grandes ou as consultas complexas. Aqui:
(1) o volume é de **milhares** de linhas, não milhões — o estado inteiro cabe
em memória com folga, e "consulta" vira `filter`/`reduce` em arrays, que o
núcleo puro testa sem mock nenhum; (2) JSON é **legível e recuperável à mão**
— num app de finanças pessoais, poder abrir o arquivo no editor e conferir/
consertar é uma feature de soberania sobre os próprios dados; (3) SQLite no
Electron exige módulo nativo compilado **por SO e por versão de Electron** —
fricção permanente no requisito Linux+Windows. **O que se perdeu:** escrita
incremental (reescrever tudo a cada ação seria proibitivo com dados grandes),
transações e consultas indexadas. Com este volume, nada disso pesa; o dia em
que pesar, a migração é possível porque toda a leitura/escrita passa por um
único funil (`storage.js` + `migrar()`).

**Por que não só localStorage?** Ele existe como *fallback* (rodar no
navegador em dev), mas seria péssimo como principal: preso ao perfil do
navegador daquela máquina (adeus pendrive), limite de ~5 MB, e apagável por
"limpar dados de navegação". O arquivo é a fonte da verdade; o localStorage é
uma conveniência.

---

## 4. Por que reconstruir a tela inteira — e não virtual DOM / patch fino

**A escolha.** `render()` faz `innerHTML = ''` no `#view` e reconstrói a aba
atual do zero a partir do estado (com duas exceções cirúrgicas, estudadas nos
espelhos: o topo fixo e a troca de tipo no formulário de Lançar).

**O raciocínio.** Atualização fina (mudar só o que mudou) é o problema mais
traiçoeiro de UI — é fácil esquecer um pedaço e a tela mentir sobre o estado.
O virtual DOM do React existe para automatizar exatamente isso. Só que a
automação vale a pena quando a atualização é **frequente e cara**; aqui uma
"mudança" é um clique humano (dezenas por sessão, não milhares por segundo) e
a tela inteira é reconstruída em milissegundos. Reconstruir tudo dá, de graça,
a mesma garantia central do React — **a tela é sempre função do estado atual**
— sem framework. **O que se perdeu:** foco e posição de scroll morrem a cada
render (por isso as duas exceções cirúrgicas existem), e a técnica não escala
para UIs grandes/animadas. Trade-off local, consciente.

---

## 5. Por que dinheiro em centavos — e por que float binário erra

**Contexto histórico.** O padrão IEEE 754 (1985) representa números em fração
**binária**. Assim como 1/3 não tem escrita decimal finita (0.333…), **1/10
não tem escrita binária finita** — 0.1 em binário é uma dízima periódica, e o
computador guarda uma aproximação. Por isso `0.1 + 0.2 === 0.30000000000000004`
em qualquer linguagem que use float binário (JS, Python, C…). Para física, o
erro na 16ª casa é irrelevante; para dinheiro, somas repetidas **acumulam** o
erro até ele aparecer no centavo — e contabilidade que não fecha no centavo
não fecha. As soluções clássicas: tipos decimais (`DECIMAL` de SQL, `Decimal`
de Python) ou **inteiros na menor unidade** — centavos. JS não tem tipo
decimal; sobrou (e basta) a segunda.

**A escolha aqui.** `paraCentavos()` na entrada (com `Math.round` absorvendo o
erro residual do `× 100`), toda aritmética em inteiros, `paraReais()` uma vez
na saída. Inteiros em float de 64 bits são **exatos** até 2⁵³ — nove
quatrilhões de centavos de margem. A regra irmã: parcelas usam `Math.floor` +
resíduo na última, para a soma fechar **exatamente** o valor da compra
([`parcelas.explicado.md`](./parcelas.explicado.md)).

---

## 6. Por que ES modules na UI/núcleo mas CommonJS no `electron/main.js`

**Contexto histórico.** JS nasceu (1995) sem sistema de módulos. O Node
(2009) inventou o seu — CommonJS, o `require()` — e por uma década foi o
padrão de fato. O módulo **oficial** da linguagem (ESM, `import`/`export`) só
chegou em 2015 e demorou a ser suportado nativamente. Resultado: o ecossistema
vive até hoje com os dois.

**No projeto:** `src/` inteiro é ESM — é o padrão da linguagem, funciona
nativo no Chromium e no `node --test`, e o `export` explícito demarca o
contrato de cada arquivo do núcleo. Já o `electron/main.js` é CommonJS porque
o processo principal do Electron carrega CJS sem fricção nenhuma, e um arquivo
de 147 linhas não justifica brigar com a configuração. É uma inconsistência
**assumida e barata** — e um bom exemplo de que pragmatismo pontual vence
pureza: a fronteira (2 arquivos em `electron/`) é pequena e estável.

---

## O padrão por trás de todas elas

Todas as seis decisões apontam na mesma direção: **minimizar o que existe
entre o código e o que ele faz** — sem framework, sem banco, sem build step,
sem dependência além do Electron. Para um produto comercial com equipe e
milhões de usuários, várias seriam decisões erradas. Para um app pessoal,
offline, portátil e mantido por uma pessoa que precisa entendê-lo por inteiro
(inclusive daqui a dois anos), cada camada a menos é um lugar a menos onde um
bug pode se esconder — e é o que torna este código *estudável*: o que você lê
é literalmente tudo o que roda.
