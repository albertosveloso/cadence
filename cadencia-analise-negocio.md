# Cadência — Documento de Análise de Negócio

**Versão:** 1.1
**Data:** 28/09/2026
**Objetivo deste documento:** servir de especificação de entrada para desenvolvimento assistido (Claude Code).

### Histórico de versões

**1.1 — 28/09/2026.** Duas funcionalidades entram no escopo, e uma delas reverte uma exclusão deliberada da versão 1.0:

- **Início sempre manual** (§5.1). Nenhuma fase começa sozinha; ao fim de uma, a seguinte aguarda o botão. Reverte a transição automática descrita na 1.0.
- **Concluir a fase antes da hora** (§5.1). Botão que encerra o foco ou a pausa corrente imediatamente.
- **Pausa longa** a cada 4 ciclos do dia, com duração configurável (§5.7).
- **Entrada digitada** nos campos de duração, além dos botões de mais e menos (§6.1).
- **Limiar de ociosidade** padrão de 5 para **10 minutos**, mais duas regras que o tornam coerente: ausência longa reinicia o intervalo, e o lembrete não dispara sem ninguém presente (§5.3).
- **Histórico de ciclos por dia, com calendário mensal** (§5.6). Isto **contradiz** a versão 1.0, que declarava a contagem volátil (§5.5) e listava "histórico de ciclos" como fora de escopo (§6.2). A exclusão original tinha uma justificativa explícita — ser "o ponto onde o projeto tende a crescer sem limite" — e continua válida como alerta: o que entra é o registro por dia e a visualização mensal, **não** gráficos, relatórios nem exportação, que seguem fora.

---

## 1. Visão geral

Cadência é um aplicativo de bandeja (system tray) para Windows que impõe ritmo ao dia de trabalho por meio de dois temporizadores independentes: um ciclo de foco (Pomodoro) acionado pelo usuário e um lembrete recorrente de hidratação e movimento que roda sozinho.

O nome reflete a proposta: o app não organiza tarefas nem mede produtividade — ele fornece um ritmo externo para que o usuário não precise decidir, a cada momento, quando começar e quando parar.

---

## 2. Problema

O usuário identificou duas dores, com pesos diferentes:

**Dor primária — dificuldade de iniciar tarefas.** A procrastinação foi apontada tanto no contexto de trabalho quanto na rotina geral. O gargalo não é sustentar atenção: quando o usuário engata, mantém de 30 a 60 minutos de foco contínuo. O problema é exclusivamente a barreira de entrada.

**Dor secundária — sedentarismo prolongado.** O usuário permanece horas sentado sem se levantar, sem nenhum mecanismo de interrupção.

## 3. Hipótese de solução

Reduzir o custo de decisão inicial. Comprometer-se com "25 minutos nisso" é psicologicamente mais fácil que comprometer-se com "esta tarefa até acabar". O temporizador transfere a decisão de parada para o app, o que remove o peso de iniciar.

Para a dor secundária, a solução é um lembrete que não dependa do comportamento do usuário — precisa funcionar justamente nos dias em que ele não usa o Pomodoro.

---

## 4. Decisão de arquitetura de negócio

**Os dois temporizadores são independentes.** Esta é a decisão mais importante do documento.

O lembrete de água e movimento **não** pode ser acoplado às pausas do Pomodoro. Se o lembrete só disparar durante o intervalo de um ciclo de foco, ele deixa de existir nos dias em que o usuário não inicia nenhum ciclo — e esses são exatamente os dias em que ele mais precisa. Os dois relógios rodam em paralelo, com estados separados e sem comunicação entre si.

---

## 5. Regras de negócio

### 5.1 Ciclo de foco (Pomodoro)

| Regra | Definição |
|---|---|
| Duração padrão do foco | 25 minutos |
| Duração padrão da pausa curta | 5 minutos |
| Duração padrão da pausa longa | 15 minutos (§5.7) |
| Configurabilidade | Ambas as durações editáveis pelo usuário |
| Acionamento | Manual, pelo menu do tray ou pela janela |
| Sequência | Foco → pausa → foco, com pausa longa a cada 4 ciclos (§5.7). **Nenhuma fase começa sozinha**: ao fim de uma, a seguinte fica preparada e aguarda o botão |

**Contabilização de ciclo cumprido:**
- Pausa curta (usuário aciona "Pausar" e depois retoma) **não invalida** o ciclo — o cronômetro congela e continua de onde parou.
- Abandono (usuário aciona "Zerar") **invalida** o ciclo e descarta o progresso.
- Conclusão antecipada (usuário aciona "Concluir") **valida** o ciclo e prepara a fase seguinte, que aguarda o botão.

Justificativa: pausas legítimas acontecem (telefone, alguém chamando) e penalizá-las faria o usuário evitar o botão, distorcendo a contagem.

**Início sempre manual (novo em 1.1):**

| Regra | Definição |
|---|---|
| Início do foco | Manual |
| Início da pausa | Manual |
| Ao terminar uma fase | A seguinte é preparada com a duração cheia, e o cronômetro para |
| Duração aplicada | Lida no instante do início, não no da preparação |

Justificativa: uma pausa que começa sozinha enquanto a pessoa ainda está escrevendo simplesmente passa — e o app terá contado um descanso que não houve. O mesmo vale para o foco: retomar deve ser uma decisão, não um empurrão. Isto é coerente com §3, que descreve o app como um ritmo externo que **remove o custo de decidir quando parar**, não como algo que decide sozinho quando recomeçar.

Consequência de interface: "parado" deixa de ser suficiente. O app precisa dizer *qual* fase está esperando — daí os rótulos "pronto"/"pausa pronta" e o botão "Iniciar foco"/"Iniciar pausa".

> **Alterado em 1.1.** A versão 1.0 dizia "Foco → pausa → foco, em loop, até o usuário parar", o que implicava transição automática entre fases.

**Conclusão antecipada (novo em 1.1):**

| Regra | Definição |
|---|---|
| Efeito no foco | Contabiliza o ciclo e **prepara** a pausa, que aguarda o botão |
| Efeito na pausa | **Prepara** o foco; não contabiliza nada, porque pausa não é ciclo |
| Disponibilidade | Enquanto houver ciclo em andamento, inclusive pausado |
| Notificação | Nenhuma |

Justificativa: "Zerar" e "Concluir" existem para expressar intenções opostas — *abandonei* e *terminei antes*. Se a conclusão antecipada não contasse, o botão seria apenas um "Zerar" com outro nome, e o usuário que de fato terminou a tarefa aos 18 minutos não teria como registrar isso.

A contagem deste app é **autodeclarada por desenho**, não medida. A regra de pausa acima já permite congelar um ciclo indefinidamente e ainda contá-lo. Isso é coerente com §3: o app reduz o custo de começar, não fiscaliza o que a pessoa fez. Um contador que pune o usuário faz com que ele deixe de usar os botões, e aí a contagem passa a valer menos ainda.

Sobre a ausência de notificação: o app só avisa o que acontece **sem** o usuário pedir. Concluir é uma ação dele — anunciá-la seria informá-lo do que acabou de fazer.

### 5.2 Lembrete de água e movimento

| Regra | Definição |
|---|---|
| Intervalo padrão | 50 a 60 minutos |
| Configurabilidade | Intervalo editável pelo usuário |
| Acionamento | Automático, desde que o app esteja em execução |
| Dependência do Pomodoro | Nenhuma |

**Comportamento em caso de lembrete ignorado:**
- Repete **uma única vez**, 10 minutos após o disparo original.
- Se ignorado novamente, silencia até o próximo intervalo regular.

Justificativa: insistência excessiva leva o usuário a desativar o app inteiro. Uma repetição cobre o caso de distração momentânea sem virar incômodo.

### 5.3 Janela de atividade

Não há janela de horário configurada. O lembrete opera enquanto o app estiver rodando.

**Pausa por ociosidade:** para cobrir o cenário de computador ligado sem usuário presente (ex.: madrugada, download em andamento), o lembrete se suspende automaticamente após um período sem entrada de mouse ou teclado, e retoma quando a atividade volta.

| Regra | Definição |
|---|---|
| Limiar padrão | **10 minutos** sem mouse nem teclado |
| Configurabilidade | Editável pelo usuário, na seção "Lembretes" |
| Ao voltar de uma ausência ≥ limiar | O intervalo **recomeça do zero** |
| Com o alvo vencido e ninguém presente | O lembrete **espera**; não gasta o aviso nem a repetição |

**Por que o limiar é curto.** O tempo de ausência abaixo do limiar conta como tempo sentado. Com um limiar longo, uma caminhada de 30 minutos é contabilizada como 30 minutos na cadeira, e o lembrete dispara logo depois de a pessoa sentar — o oposto do que ele existe para fazer. Dez minutos é curto o bastante para que nenhuma ausência real caiba nele, e longo o bastante para não confundir leitura ou reflexão com ausência.

**Por que voltar de uma ausência reinicia o intervalo.** Se o limiar define "esta pessoa saiu", então voltar significa que ela levantou — que era exatamente o pedido do lembrete. Preservar o tempo que faltava fazia com que quem voltava de um almoço de 70 minutos fosse mandado levantar poucos minutos depois de sentar.

**Por que o lembrete espera quando não há ninguém.** A seção 5.2 dá ao lembrete um aviso e uma única repetição. Sem essa proteção, os dois podiam ser gastos com a cadeira vazia, e a pessoa voltava sem ter visto nada — com o próximo lembrete a um intervalo inteiro de distância. A tolerância é de 60 segundos sem atividade.

> **Alterado em 1.1.** O limiar padrão era de 5 minutos. Chegou a ser definido em 40, valor revertido após simulação: ver [`scripts/simular-ociosidade.mts`](scripts/simular-ociosidade.mts), que reproduz os cenários acima com relógio sintético.

Justificativa: substitui a configuração manual de horário por um comportamento que se adapta sozinho. No Electron, resolve-se com `powerMonitor.getSystemIdleTime()`.

### 5.4 Inicialização automática

| Regra | Definição |
|---|---|
| Estado padrão | Ativado |
| Controle | Item de menu tipo checkbox, direto no tray |
| Comportamento na inicialização | App sobe direto para a bandeja, sem abrir janela |

Implementação: `app.setLoginItemSettings()` para escrita, `app.getLoginItemSettings().openAtLogin` para leitura do estado atual. Passar `args: ['--hidden']` e tratar a flag para suprimir a abertura de janela no boot.

### 5.5 Persistência

Dois arquivos JSON no diretório retornado por `app.getPath('userData')`, separados de propósito: configuração e histórico têm ciclos de vida diferentes, e um arquivo de histórico corrompido não pode levar junto as preferências do usuário.

| Arquivo | Conteúdo |
|---|---|
| `settings.json` | Durações de foco e pausa, intervalo do lembrete, limiar de ociosidade, tema, som escolhido, inicialização automática |
| `history.json` | Ciclos de foco concluídos por dia (§5.6) |

Ambos com escrita atômica e leitura tolerante: valor fora de faixa é limitado, tipo errado cai no padrão, e arquivo ilegível recomeça vazio em vez de derrubar o app. O documento prevê editar `settings.json` à mão como alternativa à tela de configurações, o que torna essa tolerância um requisito, não um zelo.

> **Alterado em 1.1.** A versão 1.0 dizia: "Contagem de ciclos do dia é volátil — reinicia a cada execução." Isso deixou de valer com a introdução do histórico.

### 5.6 Histórico de ciclos (novo em 1.1)

| Regra | Definição |
|---|---|
| O que é registrado | Apenas ciclos de **foco** concluídos — por tempo ou por conclusão antecipada |
| Granularidade | Um total por dia. Não se registra horário nem duração |
| Data de referência | Data **local** do usuário, não UTC |
| Retenção | Indefinida. Sem expurgo automático |
| Visualização | Calendário mensal, com navegação entre meses |

**Sobre a data local:** um ciclo concluído às 22h pertence ao dia que a pessoa viveu. Usar UTC jogaria as noites de quem está em fuso negativo para o dia seguinte, e o calendário passaria a discordar da memória do usuário.

**Sobre a granularidade:** um número por dia é o suficiente para responder "eu mantive o ritmo esta semana?", que é a única pergunta que o §3 justifica. Registrar horários abriria caminho para relatórios e gráficos — exatamente o crescimento sem limite que §6.2 existe para conter.

### 5.7 Pausa longa (novo em 1.1)

| Regra | Definição |
|---|---|
| Duração padrão | 15 minutos |
| Configurabilidade | Editável pelo usuário, na seção "Durações" |
| Quando acontece | A cada **4** ciclos de foco concluídos no mesmo dia |
| Cadência | Constante do produto, não configuração |
| Início | Manual, como qualquer outra fase (§5.1) |
| Origem da contagem | Derivada do histórico do dia (§5.6) |

**Sobre "4 seguidos".** A cadência é derivada da contagem do dia — a pausa longa acontece quando o total de ciclos do dia é múltiplo de 4 — e não de um contador próprio de "consecutivos".

Duas consequências, ambas desejadas:

- A sequência **zera sozinha na virada do dia**, sem estado escondido que possa divergir do histórico.
- **Zerar um ciclo em andamento não quebra a sequência.** Abandonar já custa o ciclo; punir duas vezes contraria a justificativa da §5.1, que evita penalizar o uso dos botões justamente para que o usuário não passe a evitá-los.

**Por que a cadência de 4 não é configurável.** Quatro é a cadência clássica do Pomodoro, e torná-la ajustável multiplicaria as combinações de estado sem responder a nenhuma das duas dores do §2. A *duração* é configurável porque varia com a rotina de cada um; o *ritmo* é o que o app existe para impor.

---

## 6. Escopo funcional

### 6.1 Dentro do escopo (versão 1)

- Ícone permanente na bandeja do Windows
- Menu de contexto: Iniciar foco / Pausar / Zerar / Configurações / Iniciar com o Windows / Sair
- Temporizador de foco com durações configuráveis
- Notificação sonora e visual na troca de fase
- Tooltip do ícone exibindo o tempo restante
- Temporizador de água e movimento, independente, com intervalo configurável
- Repetição única do lembrete após 10 minutos
- Suspensão automática por ociosidade
- Janela de configurações com campos de duração
- Contador de ciclos concluídos no dia, visível no menu do tray
- Inicialização automática com o Windows, alternável pelo tray
- **Conclusão antecipada** da fase de foco ou de pausa (§5.1) — *novo em 1.1*
- **Calendário mensal** de ciclos por dia, acessível por botão (§5.6) — *novo em 1.1*
- **Pausa longa** de duração configurável, a cada 4 ciclos do dia (§5.7) — *novo em 1.1*
- **Campos de duração digitáveis**, além dos botões de mais e menos — *novo em 1.1*

### 6.2 Fora do escopo (versão 1)

Itens deliberadamente excluídos. A lista existe para conter o crescimento de escopo, dado que o tempo de desenvolvimento é limitado.

- Lista de tarefas integrada
- Gráficos, relatórios e exportação de dados
- Registro de horário ou duração dos ciclos (só o total por dia é guardado)
- Contagem de copos de água consumidos
- Sequência de dias consecutivos (streak)
- Sincronização entre dispositivos
- Sons personalizados (os três disponíveis são fixos)

**Nota sobre o histórico, revista em 1.1:** a versão 1.0 excluiu o histórico persistente por ser "o ponto onde o projeto tende a crescer sem limite". O alerta continua de pé, e por isso o que entrou foi deliberadamente magro: **um inteiro por dia**, e uma tela que o mostra. Sem horários, sem durações, sem séries, sem exportação. A fronteira nova é essa — e ela é o que impede o calendário de virar um painel de produtividade, que é justamente o que este app não é (§1).

---

## 7. Decisão técnica

**Stack: Electron + JavaScript**

Critério de escolha: familiaridade do usuário com JavaScript pesou mais que qualquer ganho técnico de alternativas.

APIs nativas que cobrem os requisitos sem bibliotecas de terceiros:

| Requisito | API |
|---|---|
| Ícone e menu de bandeja | `Tray`, `Menu` |
| Detecção de ociosidade | `powerMonitor.getSystemIdleTime()` |
| Inicialização com o sistema | `app.setLoginItemSettings()` |
| Notificações | `Notification` |
| Caminho de persistência | `app.getPath('userData')` |

**Limitações aceitas conscientemente:**
- Consumo de memória entre 100 e 200 MB para um app residente. Desproporcional ao propósito, irrelevante na prática em um PC de trabalho.
- Instalador na ordem de 150 MB.

**Restrições de implementação a observar:**

1. A lógica dos temporizadores deve residir no processo principal, não no renderer. Se ficar no renderer e a janela for fechada, o temporizador para.
2. `app.on('window-all-closed')` precisa de handler vazio. Sem ele, o app encerra ao não haver janelas — inviável para um app de bandeja.
3. `app.requestSingleInstanceLock()` é obrigatório desde o início. Com inicialização automática ativa, um clique manual no atalho criaria uma segunda instância, gerando dois ícones e temporizadores concorrentes.
4. O menu do Electron não é editável após a criação. Toda mudança de estado exige reconstruir o menu inteiro via `Menu.buildFromTemplate()`.
5. Em ambiente de desenvolvimento, `setLoginItemSettings()` registra o executável do Electron, não o app. O comportamento só é verificável após o empacotamento.

---

## 8. Plano de execução

Estimativa total: 6 horas, divididas em sessões curtas.

| Sessão | Escopo | Estimativa |
|---|---|---|
| 1 | Esqueleto: projeto, `Tray`, menu de contexto, single instance lock, handler de `window-all-closed` | 1h |
| 2 | Temporizador de foco no processo principal, notificação na troca de fase, tooltip com tempo restante | 1h30 |
| 3 | Temporizador de água independente, repetição em 10 min, suspensão por ociosidade | 1h |
| 4 | Janela de configurações, persistência em JSON, contador de ciclos no menu, inicialização automática | 1h30 |
| 5 | Empacotamento com `electron-builder`, geração do `.exe` | 1h |

**Ponto de corte:** se o tempo disponível ficar abaixo da estimativa, a sessão 5 é a primeira a ser cortada. O app é plenamente funcional executado via `npm start`; o empacotamento pode ser adiado sem prejuízo funcional.

**Segundo ponto de corte:** a sessão 4 pode ser parcialmente adiada. Sem janela de configurações, as durações permanecem editáveis diretamente no arquivo JSON.

---

## 9. Critérios de aceitação

A versão 1 está concluída quando:

1. O ícone aparece na bandeja e o menu de contexto responde ao clique direito.
2. Iniciar um ciclo de foco dispara notificação ao término, e deixa a pausa preparada aguardando o botão. *(Revisto em 1.1: antes a transição era automática.)*
3. O tooltip do ícone reflete o tempo restante da fase corrente.
4. Pausar e retomar preserva o progresso do ciclo; zerar o descarta.
5. O lembrete de água dispara no intervalo configurado independentemente de haver ciclo de foco ativo.
6. O lembrete repete uma vez após 10 minutos se ignorado, e não mais que isso.
7. O lembrete se suspende após período de ociosidade e retoma com a atividade.
8. As configurações persistem entre execuções.
9. O contador de ciclos do dia reflete corretamente os ciclos concluídos.
10. Com a inicialização automática ativa, o app sobe para a bandeja no boot sem abrir janela.
11. Executar o atalho com o app já em execução não cria segunda instância.

Acrescentados na versão 1.1:

12. Concluir um foco antes do tempo contabiliza o ciclo e deixa a pausa preparada.
13. Encerrar uma pausa antes do tempo deixa o foco preparado, sem contabilizar ciclo.
14. Concluir não dispara notificação; apenas o término natural de uma fase e o lembrete de água disparam.
15. O calendário mostra, para cada dia do mês, quantos ciclos de foco foram concluídos, e permite navegar entre meses.
16. A contagem do dia sobrevive ao reinício do app.
17. Um ciclo concluído às 22h aparece no dia corrente, não no seguinte.
18. Terminada uma fase, o cronômetro permanece parado indefinidamente até o usuário acionar o botão.
19. A interface indica qual fase está preparada, e não apenas que está parada.
20. O quarto ciclo de foco do dia prepara uma pausa longa; o primeiro, o segundo e o terceiro preparam pausas curtas.
21. A duração da pausa longa é editável e o novo valor vale para a próxima pausa longa preparada.
22. As durações podem ser digitadas diretamente, e um valor fora da faixa é ajustado ao limite em vez de recusado.
23. Os controles de liga/desliga têm cores distintas em cada estado, legíveis sem depender da posição do polegar.
24. Voltar de uma ausência igual ou maior que o limiar reinicia o intervalo do lembrete.
25. Com o alvo vencido e sem atividade recente, o lembrete aguarda a volta em vez de disparar.
