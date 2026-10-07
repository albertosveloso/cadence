# Cadence

App de bandeja para Windows que impõe ritmo ao dia de trabalho por meio de **dois temporizadores independentes**: um ciclo de foco acionado pelo usuário e um lembrete de hidratação e movimento que roda sozinho.

A especificação de negócio está em [`cadencia-analise-negocio.md`](cadencia-analise-negocio.md). As seções citadas nos comentários do código se referem a esse documento.

---

## A decisão que restringe tudo

Os dois temporizadores são independentes (§4). `src/main/water-timer.ts` **não importa** `src/main/focus-timer.ts`, e vice-versa — nem por evento.

O motivo não é estético. Se o lembrete de água só disparasse durante a pausa de um ciclo de foco, ele deixaria de existir nos dias em que o usuário não inicia nenhum ciclo — que são exatamente os dias em que ele mais precisa. Qualquer refatoração que acople os dois módulos destrói o produto, não só o desenho.

---

## Como rodar

```bash
npm install
npm run dev
```

| Script | O que faz |
|---|---|
| `npm run dev` | Recarga do processo principal e HMR no renderer |
| `npm test` | Verifica as regras temporais, a persistência, o histórico e as etiquetas da bandeja (75 asserções) |
| `npm run typecheck` | Contrato de IPC íntegro entre main, preload e renderer |
| `npm run build` | `typecheck` + `test` + bundle de produção em `out/` |
| `npm run dist` | Instalador **não assinado**, em `dist/` — para iterar |
| `npm run release` | Instalador **assinado**; falha se o appId for provisório ou não houver certificado |

Node ≥ 20.19 ou ≥ 22.12.

---

## Arquitetura

O processo principal é a **única fonte de verdade**. O renderer não conta tempo, não tem `setInterval` de contagem e é descartável sem consequência — fechar a janela não para nada.

```
src/shared/contract.ts     Tipos e canais de IPC. Único arquivo que main, preload e renderer compartilham.
src/main/
  index.ts                 Bootstrap e o único setInterval do app (1 Hz para os dois relógios)
  focus-timer.ts           Máquina de estados do ciclo de foco (§5.1)
  water-timer.ts           Lembrete independente, repetição única, ociosidade (§5.2, §5.3)
  store.ts                 settings.json: escrita atômica e clamp (§5.5)
  history.ts               history.json: ciclos por dia, dono da contagem (§5.6)
  tray.ts                  Ícone, tooltip e menu de contexto (§6.1)
  window.ts, theme.ts, notifications.ts, ipc.ts
src/preload/index.ts       contextBridge com canais enumerados um a um
src/renderer/              React 19 + Tailwind 4 + shadcn/ui
```

Três invariantes que sustentam o resto:

**Nenhum módulo de domínio lê o relógio.** `now` é sempre parâmetro; quem chama `Date.now()` é o `index.ts`. Isso torna as regras temporais verificáveis por asserção em vez de por espera, e elimina a possibilidade de um comando e o tick discordarem sobre que instante é "agora".

**Contagem por alvo absoluto, não por acumulação.** Cada fase guarda `deadlineMs`; o tick recalcula `remaining = deadline - now`. Um contador `remaining -= 1000` acumularia deriva. Ao suspender a máquina, o restante é congelado — dormir não é focar, e isso também torna impossível a rajada de notificações que um alvo vencido de horas atrás provocaria ao acordar.

**Nem o store nem os temporizadores conhecem o Electron.** Diretório e configuração entram por injeção (`configureStore`, `setFocusSettingsProvider`, `setWaterSettingsProvider`), ligados num único ponto no bootstrap.

### Push de estado

O snapshot vai ao renderer a 1 Hz **apenas com a janela na tela**. Escondida, o processo principal segue contando e atualizando o tooltip da bandeja sem pagar serialização de IPC nem trabalho de renderer.

---

## Design system

Fundação em [shadcn/ui](https://ui.shadcn.com/) (estilo `radix-nova`, primitivos `radix-ui` unificados), Tailwind CSS v4 com configuração **CSS-first** — não existe `tailwind.config.ts`.

Tudo que é visual vive em [`src/renderer/src/index.css`](src/renderer/src/index.css). Além dos tokens do shadcn, três tokens semânticos do domínio:

```css
--phase-focus       /* vermelho: fase de foco */
--phase-focus-tail  /* âmbar: ponta do gradiente do anel */
--phase-break       /* pausa */
--phase-water       /* lembrete de hidratação */
```

Para mudar a identidade visual, troque valores de variáveis — não componentes.

**Tons do tema escuro.** Vêm de uma referência do usuário, amostrada pixel a pixel:

| | oklch | Onde |
|---|---|---|
| `#191A1C` | `oklch(0.218 0.004 264)` | `--background` |
| `#1E1F22` | `oklch(0.239 0.006 265)` | `--card`, `--popover` |
| `#26282C` | `oklch(0.276 0.008 264)` | `--border`, `--muted`, `--secondary` |

A família é **fria** (matiz ~264), não quente como era, e o fundo é mais claro (0.218 contra 0.145) — por isso os textos secundários também subiram, senão perderiam contraste. `--border` passou a ser sólido em vez de branco translúcido, como o separador da referência.

**Tipografia:** Outfit variável, instalada por npm (`@fontsource-variable/outfit`) e embutida no bundle. Nenhuma requisição de rede, 47 kB de woff2. O cronômetro usa `font-variant-numeric: tabular-nums`; sem isso os dígitos mudam de largura a cada segundo e o número inteiro tremula.

**Anel de progresso:** SVG inline com `stroke-dashoffset` e uma transição de CSS. Nenhuma biblioteca de animação entra no projeto.

**Borda da janela:** o token `--app-edge` é separado de `--border`. O segundo é fraco de propósito (divisores internos); a moldura externa precisa de contraste próprio, senão no tema escuro o card quase preto se dissolve no fundo da área de trabalho.

**Som:** escolhível entre três opções — Windows (padrão), Sino (o despertador de cozinha do pomodoro clássico) e Suave. O app toca o som ele mesmo, e o toast é criado **sempre** com `silent: true` — ver [`src/main/sound.ts`](src/main/sound.ts). Um toast com `silent: false` deveria usar o som padrão do sistema e não usava, mesmo com o AppUserModelID batendo com o do atalho instalado, sem supressão por app e com um WAV atribuído no esquema de sons. Como o comportamento não é confiável, "Som nas notificações" passou a ter um significado único, e não há risco de tocar duas vezes onde o toast funcionaria.

**Tema:** `nativeTheme.themeSource` no processo principal é a autoridade. O renderer recebe `darkMode` já resolvido no snapshot e aplica a classe `.dark` — nunca decide sozinho. Por isso "conforme o sistema" funciona de verdade: mudar o tema do Windows muda o app sem reiniciar.

**Atalhos:** `Espaço` inicia/pausa/retoma · `Ctrl+,` configurações · `Esc` volta, ou esconde na bandeja.

**Calendário:** o contador "N ciclos hoje" é o botão que o abre — o número que você acompanha é a porta do histórico. Cada célula mostra o dia em cima e os ciclos embaixo; a intensidade da cor vai em degraus, porque num quadrado de 32 px a diferença entre 60% e 70% de opacidade é invisível e o que se lê é "pouco, médio, muito".

**O botão principal recebe o acento em dois estados:** `INICIAR FOCO` e `RETOMAR`. Os dois são o mesmo convite — voltar ao trabalho —, que é a ação que a §3 do documento existe para tornar barata. `Pausar` e `Iniciar pausa` mantêm a pílula neutra: se tudo fosse destacado, o destaque não significaria nada.

**Contraste dos controles secundários.** O shadcn pinta a variante `outline` e a aba ativa com `bg-input/30`. Medido neste tema escuro, isso dava:

| | Antes | Agora |
|---|---|---|
| Botão `−`/`+` sobre o card | L≈0,246 contra 0,218 | **0,276 sólido** |
| Borda desses botões | 0,31 | **0,37** (`--input`) |
| Aba ativa contra a faixa | diferença de **0,01** | diferença de **0,069** |

Trinta por cento de alfa sobre um fundo escuro quase não desloca a luminosidade — o botão existia no DOM e não na tela. As superfícies passaram a ser sólidas, e a aba ativa usa a mesma do seletor de tema e som, que já funcionava. Os dois controles ficaram coerentes entre si.

**Zerar e Concluir** ladeiam o botão principal porque são intenções opostas: à esquerda *abandonei* (não conta o ciclo), à direita *terminei antes* (conta). Ver §5.1 do documento de negócio para o porquê de a contagem ser autodeclarada.

**Pausa longa** a cada 4 ciclos do dia, derivada da contagem do histórico (`ciclos % 4 === 0`) em vez de um contador próprio — assim zera sozinha na virada do dia e não há estado que possa divergir do que o calendário mostra. Ver §5.7 do documento de negócio.

**Limiar de ociosidade.** O tempo de ausência abaixo do limiar conta como tempo sentado — por isso ele é curto (10 min). Duas regras o acompanham: voltar de uma ausência ≥ limiar reinicia o intervalo, e o lembrete não dispara sem atividade nos últimos 60 s, para não gastar seu aviso e sua repetição única com a cadeira vazia. [`scripts/simular-ociosidade.mts`](scripts/simular-ociosidade.mts) reproduz os cenários com relógio sintético; foi o que mostrou que um limiar de 40 min mandava levantar 5 min depois de um almoço de 70.

**Switch de liga/desliga.** O shadcn usa `--primary` para o estado ligado; neste tema `--primary` é um cinza médio e `--input` é branco a 14% sobre preto, então ligado e desligado ficavam quase idênticos. Os tokens `--switch-on` / `--switch-off` / `--switch-thumb` resolvem isso: ligado usa o acento do app, desligado um cinza claramente mais escuro, e o polegar fica claro nos dois.

**Campos de duração digitáveis.** O `StepperRow` mantém um rascunho local enquanto o campo está em edição: sem isso, um campo controlado pelo valor salvo brigaria com quem digita — ao teclar `5` para chegar em `50`, o valor seria salvo e limitado ao mínimo antes do segundo dígito chegar. O rascunho vira valor no blur ou no Enter; Esc descarta.

**Nenhuma fase começa sozinha.** Ao fim do foco a pausa fica preparada e espera o botão, e vice-versa. Por isso o rótulo e o botão dizem *qual* fase aguarda (`pronto` / `pausa pronta`, `Iniciar foco` / `Iniciar pausa`): com o início manual, "parado" sozinho seria ambíguo.

---

## Leveza

`dependencies` está **vazio**. O electron-vite empacota tudo do renderer e o processo principal não tem dependência externa, então o instalador não carrega `node_modules` nenhum — o `app.asar` tem 364 kB e todo o resto é o runtime do Electron. Tudo é `devDependencies`.

### O que foi medido, não estimado

O documento aceita 100–200 MB para um app residente (§7). Duas decisões saíram de medição, não de opinião:

| Estado | RSS | Processos |
|---|---|---|
| Janela aberta | 291 MB | 4 |
| **Residente na bandeja** | **198 MB** | 3 |

**Fechar destrói a janela, não a esconde.** Esconder liberava 8 MB (315 → 307); destruir libera 84 MB e um processo inteiro, porque um renderer escondido continua pago por inteiro. O custo é ~200–300 ms para reabrir. Ver o comentário no topo de [`src/main/window.ts`](src/main/window.ts).

**Renderização por software** (`app.disableHardwareAcceleration()`). Corta outros 29 MB do estado residente, e a janela renderiza idêntica — cantos arredondados, transparência e tema conferidos por captura. A UI é um círculo estático que muda uma vez por segundo; não há o que justifique manter um pipeline de GPU vivo o dia inteiro. Isto **não** é o switch `--disable-gpu` do Chromium, que não consta na lista de switches do Electron e pode quebrar a renderização da bandeja.

O piso restante é o do próprio Electron 44 e não há como descê-lo sem trocar de stack.

### Tamanho do instalador

**106,2 MB → 91,3 MB (−14%).** Descompactado, 368 → 295 MB. Duas mudanças, ambas dimensionadas com LZMA (o que o NSIS usa em `compression: maximum`) antes de serem feitas:

| | Bruto | No instalador |
|---|---|---|
| `electronLanguages: [pt-BR, en-US]` — de 55 locales para 2 | 47,1 MB | **7,7 MB** |
| `dxcompiler.dll` + `dxil.dll` removidos em [`build/after-pack.cjs`](build/after-pack.cjs) | 26,0 MB | **7,5 MB** |

O `app.asar` tem 364 kB: não há nada a otimizar no código. Tudo que resta é runtime do Electron, e a única alavanca é não empacotar o que não se usa.

**`LICENSES.chromium.html` não é alvo**, por mais que 19,5 MB no disco chamem atenção: é texto, comprime para 0,2 MB, e as licenças BSD/MIT do Chromium exigem distribuí-lo.

**Três arquivos foram devolvidos ao pacote depois de quebrarem o app.** `vk_swiftshader.dll`, `d3dcompiler_47.dll` e `ffmpeg.dll` somam 2,6 MB do instalador e parecem peso morto — não há `<canvas>`, WebGL, WebGPU, `<audio>` nem `<video>` em lugar nenhum do renderer. Removidos, o app abre, carrega o `index.html` e **nunca pinta**: `Page.captureScreenshot` não produz quadro e `Runtime.evaluate` estoura o prazo. Janela morta, e **sem uma linha de erro no console** — um build verde que só falha na mão do usuário. O motivo provável do SwiftShader é irônico: como o app chama `disableHardwareAcceleration()`, ele deixa de ser plano B e vira o renderizador principal. O raciocínio completo está no cabeçalho do `after-pack.cjs`.

Toda verificação foi feita abrindo o app empacotado com `--user-data-dir` num perfil limpo e inspecionando as três telas por CDP — nunca só olhando se o build passou.

Abaixo de ~87 MB não há caminho dentro do Electron: `Cadence.exe` sozinho tem 234 MB brutos de Chromium. Um instalador de 5–10 MB exigiria trocar o runtime (Tauri/WebView2), o que é reescrever o processo principal, não ajustar o empacotamento.

Duas armadilhas que valem estar escritas:

**`electron-vite@5` fixa `minify: false` como default nos três ambientes.** Sem as linhas de `minify` em [`electron.vite.config.ts`](electron.vite.config.ts), o bundle de produção sai legível e quase 3× maior (554 kB → 193 kB). Não remova.

**Não desligue `backgroundThrottling` e não use `--disable-renderer-backgrounding`.** São as duas "otimizações" de Electron mais repetidas e as duas fazem o oposto num app residente: a primeira vaza para a janela inteira e força draw/swap de todos os `webContents` irmãos; a segunda impede o Chromium de desprioritizar a janela escondida. Trabalho periódico vai no processo principal.

`contextIsolation`, `sandbox` e `nodeIntegration` ficam nos defaults do Electron 44 (`true`, `true`, `false`). A ação correta é **não** sobrescrever.

---

## Pacote MSIX (Microsoft Store)

```bash
npm run dist:msix     # dist/Cadence-0.1.0.appx — 132,8 MB
```

O alvo `appx` **não** está em `win.target`, de propósito: listado ali, `npm run dist` reconstruiria também o instalador NSIS, e o `.exe` atual é o que está publicado na release, com hash conhecido. O MSIX sai por um script próprio, que passa o alvo pela linha de comando.

### MSIX não é o mesmo app empacotado de outro jeito

Sob MSIX o registro é **virtualizado**: uma gravação em `HKCU\...\Run` vai para um hive privado do pacote que o Windows não lê no logon. A chave é gravada, a releitura confirma, e a inicialização automática simplesmente não acontece. Nada falha, nada registra erro — o defeito aparece no dia seguinte, na máquina do usuário. Três adaptações saíram daí:

| Arquivo | O que faz |
|---|---|
| [`src/main/packaging.ts`](src/main/packaging.ts) | `isMsixPackaged()`, via `process.windowsStore` |
| [`src/main/index.ts`](src/main/index.ts) | não escreve o registro sob MSIX; `msix` entra no snapshot |
| [`build/appx-extensions.xml`](build/appx-extensions.xml) | a extensão `windows.startupTask` que substitui a chave Run |

E a interface acompanha: sob MSIX o switch "Iniciar com o Windows" vira uma linha informativa apontando para Configurações do Windows, e o item some do menu da bandeja. Quem controla a inicialização passa a ser o sistema — **um controle que não consegue mudar o que afirma é pior que nenhum controle**.

### Duas armadilhas encontradas na prática

**O `--hidden` não chega, e a saída não é um argumento.** A `desktop:StartupTask` lança o executável sem argumentos, e o esquema do elemento não tem onde declarar uma linha de comando — só `TaskId`, `Enabled`, `DisplayName` e `rescap5:ImmediateRegistration`. Deduzir pelo ambiente também não serve: o clique no bloco do Menu Iniciar chega igualmente sem argumentos, então os dois lançamentos são indistinguíveis por `argv`.

As saídas do Electron não existem: `wasOpenedAtLogin` é **macOS apenas** e `openAsHidden` foi removido. A API de ativação do WinRT separaria os dois, mas o Electron não a expõe.

Sobra o que sobrevive a um lançamento sem argumentos: **uma preferência armazenada**. Daí a opção `startMinimized`, exposta como "Iniciar minimizado na bandeja" em Configurações › Geral. O argumento continua valendo como sobreposição explícita, e é ele que a chave Run grava na instalação por `.exe`, então o comportamento do NSIS não muda.

Consequência assumida: com a preferência ligada, abrir o app pelo atalho também sobe só a bandeja. Deixa de ser surpresa porque foi o usuário que pediu — e no caso comum nem aparece, porque depois do logon o app já está vivo e o atalho cai no handler de segunda instância, que mostra a janela.

Verificado com o app empacotado, três cenários: sem argumento e preferência desligada cria janela; sem argumento e preferência ligada não cria; `--hidden` com preferência desligada não cria.

**O `TaskId` que o electron-builder gera é de outro produto.** Em `app-builder-lib/out/targets/AppxTarget.js` o identificador da tarefa de inicialização está fixo no código, herdado de quem escreveu o template. Por isso `addAutoLaunchExtension` fica em `false` e a extensão é declarada em `build/appx-extensions.xml`, com `TaskId` nosso.

> Ao editar esse XML: ele é anexado **cru** ao `AppxManifest.xml`. Dois hifens seguidos dentro de um comentário tornam o manifesto inválido, e o `MakeAppx` responde `0x80080204` sem dizer qual linha.

### Validado com o pacote instalado

Não por leitura do manifesto: o pacote foi assinado com um certificado de teste, instalado de verdade e inspecionado por CDP com `Invoke-CommandInDesktopPackage`, que executa o binário **com identidade de pacote** — sem isso, `process.windowsStore` fica indefinido e o ramo MSIX nunca roda.

| O que | Resultado |
|---|---|
| `windows.startupTask` registrada pelo Windows | `State = 2` (Enabled) |
| `about().packaging` | `msix` |
| Nome exibido | `Cadence Pomodoro` |
| Switch "Iniciar com o Windows" | ausente; vira a linha informativa |

**A chave da StartupTask só aparece no primeiro lançamento, não na instalação.** Imediatamente após o `Add-AppxPackage`, `HKCU\...\AppModel\SystemAppData\<PFN>\CadenceStartup` não existe. Ela é criada quando o app é ativado pela primeira vez. Quem for verificar o autostart logo depois de instalar vai concluir, errado, que a extensão não funcionou.

**As duas versões não rodam ao mesmo tempo.** O bloqueio de instância única do Electron deriva do caminho de `userData`, e esse caminho é a mesma string nos dois empacotamentos. Com a versão NSIS na bandeja, o pacote MSIX inicia, registra a StartupTask e **morre em silêncio** — nenhuma janela, nenhum erro. Medido: com a NSIS parada, o MSIX sobe normalmente. Na prática atinge só quem tiver as duas instaladas, mas a falha é muda.

### O que o manifesto gerado declara

Verificado extraindo o `AppxManifest.xml` do pacote, não assumido:

- `<Identity Name="VPixel.Cadence" Publisher="CN=VPixel" Version="0.1.0.0" />` — **provisórios**. Os valores definitivos vêm da página de identidade do app no Partner Center e precisam bater caractere a caractere.
- `<rescap:Capability Name="runFullTrust" />` — obrigatória para qualquer app de integridade média, e **restrita**: o Partner Center exige justificar o uso em *Opções de envio → Funcionalidades restritas*, o que acrescenta tempo à certificação.
- Uma única extensão `windows.startupTask`, com `TaskId="CadenceStartup"`.
- Os cinco tiles de [`build/appx/`](build/appx), gerados por `scripts/generate-appx-assets.mjs` a partir do mesmo desenho do ícone. Sem eles o electron-builder embute os logotipos de **exemplo** que acompanham a ferramenta — outra falha silenciosa.

O pacote sai **não assinado** por decisão do electron-builder (`AppX is not signed — reason=Windows Store only build`): quem assina um pacote de Store é a Microsoft. Para instalar localmente seria preciso assiná-lo com um certificado cujo sujeito seja igual ao `Publisher` e confiar nesse certificado na máquina.

---

## Site de distribuição

`site/` é um site estático com a documentação do usuário final, a identidade visual e o botão de
download do instalador. Sem build e sem dependências — são arquivos prontos para subir em qualquer
hospedagem estática. O instalador **não** faz parte do site: é distribuído como asset de uma
release deste repositório, e os botões de download apontam para a URL versionada da release. O
que publicar, o que trocar a cada versão e as condições que sustentam esse link estão em
[`site/README.md`](site/README.md).

O conteúdo é o mesmo de [`MANUAL.md`](MANUAL.md); as cores são os tokens de
`src/renderer/src/index.css` convertidos por `scripts/listar-cores.mjs`.

---

## Instalador

NSIS de um clique, por usuário: duplo clique instala em `%LOCALAPPDATA%\Programs\cadence` e abre, sem UAC e sem perguntas. Atalho no Menu Iniciar, entrada normal de desinstalação.

A instalação por usuário e o autostart vivem no mesmo lugar, `HKCU\...\Run`, sob o mesmo token não elevado — é a combinação confiável. O valor é reafirmado a cada execução, porque grava o `process.execPath` corrente e uma atualização troca o executável. Quem escreve é [`src/main/autostart.ts`](src/main/autostart.ts).

### O autostart é nomeado pelo appId, não pelo produto

No Windows o Electron usa o **AppUserModelId** — ou seja, o appId — como *nome* do valor na chave `Run`. Duas consequências que custaram uma instalação de verdade para descobrir:

**O desinstalador do electron-builder não remove essa chave.** Ele limpa o registro de AUMID do shell (`WinShell::UninstAppUserModelId`), a pasta, o atalho e a entrada do Painel de Controle — e deixa o autostart apontando para o executável que acabou de apagar. Verificado: depois de desinstalar, `HKCU\...\Run\br.com.vpixel.cadence` continuava lá, com alvo inexistente, e o Windows tentaria lançá-lo a cada boot. Corrigido por [`build/installer.nsh`](build/installer.nsh), injetado via `nsis.include`, que apaga o valor no `customUnInstall`.

**É o segundo motivo para nunca alterar o appId.** Além do `guid` do NSIS, a entrada de autostart antiga fica órfã: o app novo tem outro appId e não tem como removê-la. Só sobra limpeza manual no registro.

> **`appId` (`br.com.vpixel.cadence`) não deve mudar depois do primeiro release.** O `guid` do NSIS deriva dele e é a identidade de upgrade e desinstalação. Alterá-lo torna instalações existentes não atualizáveis e deixa entradas órfãs no Painel de Controle.
>
> Ele é definido em **um único lugar**, [`electron-builder.yml`](electron-builder.yml). O processo principal o recebe por `define` em [`electron.vite.config.ts`](electron.vite.config.ts), de modo que `app.setAppUserModelId()` — que dá identidade aos toasts do Windows — não pode divergir do appId do instalador. Duas constantes iguais em arquivos diferentes divergem na primeira vez que alguém edita uma delas.
>
> `npm run release` executa [`scripts/app-id.mjs`](scripts/app-id.mjs) antes de empacotar e recusa se o appId voltar a ser provisório (prefixo `pendente.`). `npm run dist` não é afetado.

### Assinatura de código

O certificado **não** fica no repositório (`build/*.pfx` está no `.gitignore`). Caminho e senha vêm do ambiente:

```powershell
$env:CSC_LINK = "C:\caminho\para\certificado.pfx"
$env:CSC_KEY_PASSWORD = "senha"
npm run release
```

Sem essas variáveis o electron-builder produz um instalador **não assinado** e registra o fato apenas em nível *debug* — silenciosamente. Por isso `npm run release` liga `forceCodeSigning`, que transforma o descuido em erro de build. Use `npm run dist` quando quiser um instalador não assinado de propósito.

Conferir depois de gerar:

```powershell
Get-AuthenticodeSignature .\dist\Cadence-Setup-0.1.0.exe
```

> No electron-builder 26 as opções de signtool ficam sob `win.signtoolOptions`. O site electron.build já documenta a v27 (alpha), onde isso foi substituído por uma união `win.sign` — colar aquele bloco aqui faz com que ele seja **ignorado em silêncio** e você publica um instalador sem assinatura.

---

## Estado da verificação

Os 11 critérios de aceitação do §9, mais o que este projeto acrescentou.

**Verificado por asserção** (`npm test`, 75 testes) — as regras temporais e a persistência, que à mão custariam 25 minutos de espera por asserção:

- Transição foco → pausa → foco em laço, e contabilização do ciclo só no foco concluído (§5.1). O evento que dispara a notificação é verificado; a renderização do toast do Windows em si não é — ver a lista de pendências abaixo.
- Pausar e retomar preserva o progresso; zerar descarta e **não** conta o ciclo (§5.1)
- O lembrete dispara no intervalo **sem nenhum ciclo de foco ativo** (§5.2)
- Repete **exatamente uma vez** em 10 min e depois silencia até o próximo intervalo regular (§5.2)
- A cadência regular é medida do disparo original, não da repetição (§5.2)
- Suspensão por inatividade e retomada, com o limiar lido em **segundos** (§5.3)
- Suspender a máquina não avança relógio nem dispara rajada de notificações ao acordar
- Persistência sobrevive ao ciclo gravar → reiniciar → ler; JSON corrompido, tipo errado e valor fora de faixa caem em default ou no limite, sem derrubar o app (§5.5)
- A gravação acontece pelo debounce de 300 ms, **sem depender de encerramento gracioso** — um app de bandeja pode ser morto pelo Gerenciador de Tarefas, e nesse caminho `before-quit` não roda
- Etiquetas de tooltip e menu da bandeja em todos os estados (§9, critério 3)

**Verificado no app rodando:**

- Ícone na bandeja, janela sem moldura com cantos arredondados, 400×452 exatos
- Cronômetro, anel com gradiente, traços de ciclo e contador do dia
- Configurações nas três abas, tema claro e escuro
- `settings.json` lido no boot, com valor fora de faixa limitado de ponta a ponta
- Executar o atalho com o app já rodando **não** cria segunda instância e reexibe a janela (§9, critério 11)
- Fechar destrói a janela e o app **continua vivo** na bandeja
- RSS medido nos dois estados

**Verificado instalando de verdade** (sessão não elevada, `asInvoker` no manifesto):

- Duplo clique instala em ~13 s e abre, **sem prompt de UAC** (critério 14)
- Atalho no Menu Iniciar criado; nenhum atalho na área de trabalho, como configurado
- Entrada no Painel de Controle com o `guid` derivado do appId
- Desinstalação remove pasta, atalho, entrada do Painel de Controle **e o autostart**
- A chave `HKCU\...\Run` é gravada com o caminho instalado e a flag `--hidden`, e reafirmada a cada execução

**Ainda não verificado:**

- Renderização do toast do Windows na troca de fase e no lembrete (critério 2). A sessão desta máquina deixou de aceitar mudança de foco no meio da verificação, e um toast não se confere por captura de janela.
- O boot em si (critério 10): a chave de autostart está gravada e correta, mas confirmar que o app sobe para a bandeja sem abrir janela exige reiniciar o Windows. O comportamento com `--hidden` **foi** verificado lançando o executável instalado com a flag: 3 processos, sem janela, tray ativa.
- Reinstalar por cima de uma versão anterior (critério 15). O ciclo verificado foi instalar → desinstalar → instalar, sempre a partir de um estado limpo.
- Assinatura `Valid` (critério 16) — não há certificado disponível. O que **foi** verificado é que `npm run dist` produz um instalador `NotSigned` enquanto o log anuncia "signing with signtool.exe", e que `npm run release` falha com erro explícito nessa situação.

### Dois defeitos que só a instalação real revelou

**O desinstalador deixava o autostart para trás.** Corrigido em [`build/installer.nsh`](build/installer.nsh) — ver a seção Instalador.

**O registro do autostart estava no caminho crítico do bootstrap.** O app lançado pelo próprio instalador ficava com três processos vivos, sem bandeja e sem janela — um zumbi invisível. A chamada agora tem `try/catch` e roda **depois** da bandeja e da janela: registrar autostart é conveniência de sistema operacional e nunca deve poder derrubar o app.

### Uma armadilha de diagnóstico, registrada para não se repetir

Durante a investigação parecia que a gravação do autostart falhava sempre que o app era lançado pelo shell (instalador, ou o próprio Windows no boot). **Era artefato do ambiente de verificação, não do app.**

A sessão de ferramentas usada para inspecionar o registro tinha o registro **virtualizado**. Prova: um valor sentinela criado pela sessão era invisível ao app, e o valor gravado pelo app era invisível à sessão — mesma chave, mesmo usuário, duas visões.

Consequências práticas:

- O autostart **funciona**; não havia defeito a corrigir ali.
- Não é possível conferir a chave `Run` a partir de uma sessão virtualizada. Para verificar de verdade: **Gerenciador de Tarefas → Inicializar**, ou Configurações → Aplicativos → Inicialização.
- A verificação `openAtLogin` do Electron continua não servindo — mas por outro motivo, documentado em [`src/main/autostart.ts`](src/main/autostart.ts): com `args`, a leitura volta `args: []` e `openAtLogin: false` mesmo com a chave correta gravada.

---

## Ícones e sons

Gerados por código, sem dependência de imagem, editor ou arquivo de terceiros:

```bash
node scripts/generate-icons.mjs
node scripts/generate-sounds.mjs
```

Produz `build/icon.ico` (16 a 256 px) e `resources/tray.png` + `@2x`. A paleta do script espelha os tokens de `index.css` — se o acento mudar, regenere.

O ícone de bandeja é único, com trilha em cinza médio. O Electron não expõe o tema real do sistema quando `themeSource` está forçado, então escolher entre variante clara e escura por `shouldUseDarkColors` erraria o ícone justamente quando o usuário força um tema diferente do Windows.
