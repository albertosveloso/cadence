/**
 * Contrato único entre processo principal, preload e renderer.
 *
 * Regra: o processo principal e a UNICA fonte de verdade. O renderer nunca
 * calcula tempo nem compoe estado de multiplas fontes -- ele recebe um
 * Snapshot inteiro e o desenha.
 */

// ---------------------------------------------------------------- Configuracao

export type ThemePreference = 'light' | 'dark' | 'system'

/**
 * Sons de aviso disponiveis. A ordem e a da interface, e o primeiro e o
 * padrao: o proprio som de notificacao do Windows.
 *
 * 'sino' e 'suave' sao sintetizados por scripts/generate-sounds.mjs e vivem em
 * resources/. Nenhum arquivo de terceiro entra no projeto.
 */
export const NOTIFICATION_SOUNDS = ['windows', 'sino', 'suave'] as const

export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number]

export interface Settings {
  /** Duracao da fase de foco, em minutos. */
  focusMinutes: number
  /** Duracao da pausa curta, em minutos. */
  breakMinutes: number
  /** Duracao da pausa longa, a cada LONG_BREAK_EVERY ciclos do dia. */
  longBreakMinutes: number
  /**
   * Lembrete de agua e movimento ligado.
   *
   * Desligar PARA o segundo relogio; nao o esconde apenas. Religar comeca um
   * intervalo cheio -- quem desligou para uma reuniao de duas horas nao pode
   * ser cobrado no minuto seguinte ao religar.
   *
   * O intervalo em minutos continua existindo e editavel com o lembrete
   * desligado: o valor e a preferencia da pessoa, e desligar por uma tarde
   * nao e motivo para perde-lo.
   */
  waterEnabled: boolean
  /** Intervalo do lembrete de agua e movimento, em minutos. */
  waterIntervalMinutes: number
  /** Ociosidade (sem mouse/teclado) que suspende o lembrete, em minutos. */
  idleThresholdMinutes: number
  /** Preferencia de tema; 'system' segue o Windows. */
  theme: ThemePreference
  /** Iniciar com o Windows. */
  openAtLogin: boolean
  /**
   * Subir direto para a bandeja, sem abrir a janela.
   *
   * Existe como PREFERENCIA, e nao como argumento de linha de comando, porque
   * no pacote MSIX o argumento nunca chega: a extensao windows.startupTask
   * lanca o executavel sem argumentos, e `desktop:StartupTask` nao tem onde
   * declarar uma linha de comando -- so TaskId, Enabled e DisplayName.
   *
   * Uma preferencia armazenada e a unica coisa que sobrevive a esse lancamento.
   */
  startMinimized: boolean
  /** Som na troca de fase e no lembrete. */
  soundEnabled: boolean
  /** Qual som tocar quando soundEnabled estiver ligado. */
  notificationSound: NotificationSound
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  // Ligado na instalacao: o lembrete independente e metade do produto, e os
  // dias em que a pessoa nao abre o cronometro sao justamente os dias em que
  // levantar da cadeira faz mais falta.
  waterEnabled: true,
  waterIntervalMinutes: 55,
  idleThresholdMinutes: 10,
  theme: 'system',
  openAtLogin: true,
  // Falso por padrao: na instalacao por .exe quem esconde e o `--hidden` da
  // chave Run, entao ligar isto faria o app sumir tambem no clique do atalho.
  startMinimized: false,
  soundEnabled: true,
  notificationSound: 'windows'
}

/**
 * Faixas validas. Aplicadas como clamp na leitura do disco: um settings.json
 * editado a mao nao deve poder deixar o app num estado invalido.
 */
export const SETTINGS_RANGES = {
  focusMinutes: { min: 1, max: 180, step: 1 },
  breakMinutes: { min: 1, max: 60, step: 1 },
  longBreakMinutes: { min: 1, max: 120, step: 5 },
  waterIntervalMinutes: { min: 10, max: 240, step: 5 },
  idleThresholdMinutes: { min: 1, max: 60, step: 1 }
} as const

// ------------------------------------------------------------ Estado dos timers

export type FocusPhase = 'focus' | 'break' | 'long-break'

/**
 * A cada quantos ciclos de foco do dia a pausa seguinte e longa (secao 5.7).
 *
 * Constante, nao configuracao: quatro e a cadencia classica do Pomodoro, e
 * tornar isso ajustavel multiplicaria as combinacoes de estado sem responder
 * a nenhuma dor do documento (secao 2).
 */
export const LONG_BREAK_EVERY = 4
export type FocusStatus = 'idle' | 'running' | 'paused'

export interface FocusState {
  phase: FocusPhase
  status: FocusStatus
  /** Restante da fase corrente, em milissegundos. */
  remainingMs: number
  /** Duracao total da fase corrente, para calcular progresso. */
  totalMs: number
}

/**
 * `fired` = disparou e aguarda reconhecimento.
 * `repeated` = ja repetiu uma vez (secao 5.2: exatamente uma repeticao).
 * `suspended` = suspenso por ociosidade (secao 5.3).
 * `off` = desligado pelo usuario nas configuracoes.
 *
 * `off` e estado, nao ausencia de estado: a interface precisa distinguir
 * "o lembrete esta desligado" de "o lembrete ainda nao carregou".
 */
export type WaterStatus = 'waiting' | 'fired' | 'repeated' | 'suspended' | 'off'

export interface WaterState {
  status: WaterStatus
  /** Restante ate o proximo disparo, em milissegundos. */
  remainingMs: number
}

/** Um mes de historico para o calendario (secao 5.6). */
export interface MonthHistory {
  year: number
  /** 1-12, como o usuario le -- nao o 0-11 do Date. */
  month: number
  /** dia do mes (como string, por ser chave de JSON) -> ciclos concluidos */
  days: Record<string, number>
  total: number
}

export interface Snapshot {
  focus: FocusState
  /** Ciclos de foco concluidos na execucao corrente. Volatil (secao 5.5). */
  cyclesToday: number
  water: WaterState
  settings: Settings
  /** Resolucao final do tema; o renderer aplica sem decidir. */
  darkMode: boolean
  /**
   * true quando o app roda a partir de um pacote MSIX (Microsoft Store).
   *
   * A interface precisa saber: sob MSIX quem liga e desliga a inicializacao
   * automatica e o Windows, nao o app -- e um switch que nao consegue mudar
   * nada e pior que nenhum switch.
   */
  msix: boolean
}

// -------------------------------------------------------------------- Canais IPC

/**
 * Canais enumerados explicitamente. O preload NUNCA expoe `ipcRenderer` nem
 * um `invoke(channel, ...args)` generico -- isso equivaleria a nao ter bridge.
 */
export const CHANNELS = {
  appAbout: 'app:about',
  stateGet: 'state:get',
  stateChanged: 'state:changed',
  focusStart: 'focus:start',
  focusPause: 'focus:pause',
  focusResume: 'focus:resume',
  focusReset: 'focus:reset',
  focusCompleteNow: 'focus:complete-now',
  waterAck: 'water:ack',
  soundPreview: 'sound:preview',
  settingsUpdate: 'settings:update',
  systemOpenAtLogin: 'system:open-at-login',
  historyMonth: 'history:month',
  windowHide: 'window:hide'
} as const

/**
 * Versao e autoria, para a tela "Sobre".
 *
 * Consultada uma unica vez: nada aqui muda durante a execucao, e por isso nao
 * viaja no snapshot de 1 Hz.
 *
 * Carregou tambem o nome exibido, o identificador do pacote, o formato de
 * empacotamento e as versoes de Electron, Chromium e Node. Nada disso era
 * mostrado a quem usa o app sem custo de espaco, e o contrato acompanha a
 * tela: campo que ninguem desenha e campo que ninguem mantem.
 */
export interface AboutInfo {
  version: string
  developer: string
}

/** Superficie exposta em `window.cadence`. */
export interface CadenceApi {
  getSnapshot(): Promise<Snapshot>
  app: {
    /** Dados fixos de identificacao; consultar uma vez e guardar. */
    about(): Promise<AboutInfo>
  }
  focus: {
    start(): Promise<Snapshot>
    pause(): Promise<Snapshot>
    resume(): Promise<Snapshot>
    reset(): Promise<Snapshot>
    /** Encerra a fase corrente agora; o foco concluido assim CONTA. */
    completeNow(): Promise<Snapshot>
  }
  history: {
    /** `month` de 1 a 12. Consultado sob demanda: nao viaja no snapshot. */
    month(year: number, month: number): Promise<MonthHistory>
  }
  water: {
    acknowledge(): Promise<Snapshot>
  }
  sound: {
    /** Toca o som escolhido para o usuario ouvir antes de decidir. */
    preview(sound: NotificationSound): void
  }
  settings: {
    update(patch: Partial<Settings>): Promise<Snapshot>
  }
  system: {
    setOpenAtLogin(value: boolean): Promise<Snapshot>
  }
  window: {
    hide(): void
  }
  /** Assina o push a 1 Hz. Devolve a funcao de cancelamento -- obrigatorio. */
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
}
