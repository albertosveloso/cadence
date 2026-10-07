import { app, Menu, powerMonitor } from 'electron'
import { CHANNELS, type Settings, type Snapshot } from '@shared/contract'
import { configureStore, flushSettings, getSettings, updateSettings } from './store'
import {
  completePhaseNow,
  getFocusState,
  onFocusEvent,
  pauseFocus,
  resetFocus,
  resumeFocus,
  resumeFocusFromSleep,
  setCyclesTodayProvider,
  setFocusSettingsProvider,
  startPhase,
  suspendFocus,
  syncFocusSettings,
  tickFocus
} from './focus-timer'
import {
  acknowledgeWater,
  getWaterState,
  onWaterEvent,
  resumeWaterFromSleep,
  setWaterSettingsProvider,
  startWaterTimer,
  suspendWater,
  syncWaterSettings,
  tickWater
} from './water-timer'
import { notifyPhaseCompleted, notifyWater } from './notifications'
import { playNotificationSound } from './sound'
import { applyThemePreference, isDarkMode, onThemeUpdated } from './theme'
import { destroyTray, initTray, updateTrayTooltip } from './tray'
import { dismissWindow, isWindowVisible, sendToWindow, showWindow, toggleWindow } from './window'
import { registerIpc } from './ipc'
import { configureHistory, flushHistory, getDayCount, getMonth, recordCycle } from './history'
import { setAutostart } from './autostart'
import { isMsixPackaged } from './packaging'

const TICK_MS = 1000
/**
 * Ociosidade e consultada a cada 5 s. Contra um limiar medido em minutos, um
 * valor com 5 s de atraso e indistinguivel de um valor exato.
 */
const IDLE_POLL_MS = 5000

/**
 * Subir para a bandeja sem abrir a janela (secao 5.4).
 *
 * POR QUE NAO BASTA O ARGUMENTO
 *
 * No pacote MSIX a extensao windows.startupTask lanca o executavel SEM
 * ARGUMENTOS, e `desktop:StartupTask` nao tem onde declarar uma linha de
 * comando: o esquema so aceita TaskId, Enabled, DisplayName e
 * rescap5:ImmediateRegistration. Logo `--hidden` nunca chega.
 *
 * E nao da para deduzir pelo ambiente: o clique no bloco do Menu Iniciar
 * tambem chega sem argumentos, entao os dois lancamentos sao indistinguiveis
 * por argv. A API de ativacao do WinRT separaria os dois, mas o Electron nao
 * a expoe; `wasOpenedAtLogin` existe apenas no macOS e `openAsHidden` foi
 * removido.
 *
 * Sobra a preferencia armazenada, que e o que sobrevive a um lancamento sem
 * argumentos. O argumento continua valendo como sobreposicao explicita: e ele
 * que a chave Run grava na instalacao por .exe.
 *
 * Consequencia assumida: com a preferencia ligada, abrir o app pelo atalho
 * tambem sobe so a bandeja. Isso deixa de ser surpresa porque foi o usuario
 * que pediu. E no caso comum nem aparece: depois do logon o app ja esta vivo,
 * e o atalho cai no handler de segunda instancia, que mostra a janela.
 */
const hiddenPorArgumento = process.argv.includes('--hidden')

/** Lido no bootstrap, DEPOIS do store: a preferencia ainda nao existe no topo. */
function devemComecarEscondido(): boolean {
  return hiddenPorArgumento || getSettings().startMinimized
}

let ticker: NodeJS.Timeout | null = null
let idleSeconds = 0
let idleCheckedAt = 0

// O app nao tem menu de aplicacao. Remover antes do ready e ganho de startup
// documentado pelo proprio Electron.
Menu.setApplicationMenu(null)

/**
 * Renderizacao por software. Medido neste projeto, com a janela fechada e o
 * app residente na bandeja: 227 MB com aceleracao, 198 MB sem -- e a janela
 * renderiza identica (cantos arredondados, transparencia e tema conferidos
 * por captura).
 *
 * A UI e um circulo estatico que muda uma vez por segundo; nao ha nada aqui
 * que justifique manter um pipeline de GPU vivo o dia inteiro. Note que isto
 * NAO e o mesmo que o switch --disable-gpu do Chromium, que nao consta na
 * lista de switches do Electron e pode quebrar a renderizacao da bandeja.
 */
app.disableHardwareAcceleration()

// Necessario para que os toasts do Windows apontem para a identidade do app.
// __APP_ID__ e injetado em tempo de build a partir de electron-builder.yml,
// entao nao ha como divergir do appId do instalador.
app.setAppUserModelId(__APP_ID__)

/**
 * Obrigatorio desde o inicio (secao 7.3): com inicializacao automatica ativa,
 * um clique manual no atalho criaria uma segunda instancia -- dois icones na
 * bandeja e dois pares de temporizadores concorrentes.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Nao vale parsear argv: a documentacao avisa que a lista recebida aqui
    // nao e identica a que a segunda instancia recebeu.
    showWindow()
  })

  // Sem este handler o app encerra quando nao ha janelas, o que e inviavel
  // para um app de bandeja (secao 7.2). O corpo vazio e intencional.
  app.on('window-all-closed', () => {})

  app.whenReady().then(bootstrap)
}

function buildSnapshot(): Snapshot {
  return {
    focus: getFocusState(),
    cyclesToday: getDayCount(Date.now()),
    water: getWaterState(),
    settings: getSettings(),
    darkMode: isDarkMode(),
    msix: isMsixPackaged()
  }
}

function push(): void {
  const snapshot = buildSnapshot()
  updateTrayTooltip(snapshot)
  // Push apenas com a janela na tela. Escondida, o main segue contando e
  // atualizando o tooltip sem pagar serializacao de IPC nem trabalho de
  // renderer.
  if (isWindowVisible()) sendToWindow(CHANNELS.stateChanged, snapshot)
}

function currentIdleSeconds(now: number): number {
  if (now - idleCheckedAt >= IDLE_POLL_MS) {
    idleCheckedAt = now
    // Retorna SEGUNDOS, nao milissegundos.
    idleSeconds = powerMonitor.getSystemIdleTime()
  }
  return idleSeconds
}

/**
 * Integracao com a inicializacao do Windows (secao 5.4).
 *
 * Delegada a ./autostart, que escreve a chave Run diretamente -- ver naquele
 * arquivo por que a leitura do Electron nao serve para confirmar o estado.
 *
 * Roda DEPOIS da bandeja e da janela, e nunca propaga erro: registrar
 * autostart e conveniencia de sistema operacional e jamais deve poder
 * derrubar o app. Antes desta separacao, uma falha aqui deixava o Cadence
 * como tres processos vivos, sem bandeja e sem janela.
 */
async function applyOpenAtLogin(value: boolean): Promise<boolean> {
  // Sob MSIX a chave Run e virtualizada: a gravacao "funciona", a releitura
  // confirma, e o Windows nunca ve nada. Quem controla a inicializacao e a
  // extensao windows.startupTask do manifesto, ligada e desligada pelo
  // usuario em Configuracoes > Aplicativos > Inicializar. Escrever aqui
  // produziria um switch que mente -- ver ./packaging.ts.
  if (isMsixPackaged()) return false

  try {
    return await setAutostart(value, {
      name: __APP_ID__,
      execPath: process.execPath,
      // Faz o app subir direto para a bandeja, sem abrir janela.
      args: ['--hidden']
    })
  } catch (error) {
    console.error('[cadence] falha ao ajustar a inicializacao automatica:', error)
    return false
  }
}

function applySettings(patch: Partial<Settings>): void {
  const previous = getSettings()
  const previousWaterIntervalMs = previous.waterIntervalMinutes * 60_000
  const previousTheme = previous.theme
  const previousOpenAtLogin = previous.openAtLogin

  const next = updateSettings(patch)

  syncFocusSettings()
  syncWaterSettings(previousWaterIntervalMs, Date.now())
  if (next.theme !== previousTheme) applyThemePreference()

  if (next.openAtLogin !== previousOpenAtLogin) {
    void applyOpenAtLogin(next.openAtLogin).then((ok) => {
      if (ok) return
      // A chave nao foi gravada. Reverter a preferencia para que o switch da
      // interface e o menu da bandeja nao afirmem um estado que o sistema nao
      // tem -- um controle que mente e pior que um controle que falha.
      updateSettings({ openAtLogin: previousOpenAtLogin })
      push()
    })
  }
}

function bootstrap(): void {
  // Nem o store nem as maquinas de estado conhecem o Electron: o diretorio e
  // a configuracao entram por injecao. Este e o unico ponto que os conecta.
  configureStore(app.getPath('userData'))
  configureHistory(app.getPath('userData'))

  setFocusSettingsProvider(getSettings)
  setWaterSettingsProvider(getSettings)
  // O timer nao conta ciclos; so pergunta quantos ja houve hoje para saber se
  // a pausa que vem e longa (secao 5.7).
  setCyclesTodayProvider(() => getDayCount(Date.now()))

  // Obrigatorio: focus-timer se inicializa no carregamento do modulo, quando
  // o provedor acima ainda nao existe, e portanto com as duracoes padrao. Sem
  // este sync o cronometro exibiria 25:00 mesmo com 50 min no settings.json
  // -- e rodaria 50, porque cada fase le a configuracao ao comecar.
  syncFocusSettings()

  applyThemePreference()

  onFocusEvent((event) => {
    // Um ciclo concluido -- por tempo ou pelo botao "concluir" -- e gravado
    // no historico, que e quem conta (secao 5.6).
    if (event.type === 'cycle-completed') recordCycle(Date.now())
    // Notifica so na conclusao de uma fase; iniciar um ciclo e acao do
    // usuario e nao merece aviso.
    if (event.type === 'phase-completed') {
      notifyPhaseCompleted(event.finished, event.next, event.nextDurationMs)
    }
    push()
  })

  onWaterEvent((event) => {
    notifyWater(event.repeat, () => {
      acknowledgeWater(Date.now())
      push()
    })
    push()
  })

  onThemeUpdated(push)

  // Dormir nao e focar nem se levantar: os dois relogios congelam e retomam
  // de onde estavam, em vez de acordar com alvos vencidos e disparar uma
  // rajada de notificacoes.
  powerMonitor.on('suspend', () => {
    const now = Date.now()
    suspendFocus(now)
    suspendWater(now)
  })
  powerMonitor.on('resume', () => {
    const now = Date.now()
    resumeFocusFromSleep(now)
    resumeWaterFromSleep(now)
    idleCheckedAt = 0
    push()
  })

  registerIpc({
    getSnapshot: buildSnapshot,
    /**
     * Identificacao para a tela "Sobre".
     *
     * O nome sai de __APP_NAMES__, nao de app.getName(): essa API devolve o
     * campo `name` do package.json ("cadence", minusculo), e nao o nome que o
     * usuario ve. Os dois formatos exibem nomes diferentes -- "Cadence" na
     * instalacao por .exe e o nome reservado na Store no pacote MSIX -- entao
     * a tela mostra o que vale para o pacote em execucao.
     */
    about: () => ({
      name: isMsixPackaged() ? __APP_NAMES__.msix : __APP_NAMES__.product,
      version: app.getVersion(),
      developer: __APP_DEVELOPER__,
      appId: __APP_ID__,
      packaging: isMsixPackaged() ? 'msix' : 'nsis',
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node
    }),
    start: () => {
      startPhase(Date.now())
      push()
    },
    pause: () => {
      pauseFocus(Date.now())
      push()
    },
    resume: () => {
      resumeFocus(Date.now())
      push()
    },
    reset: () => {
      resetFocus()
      push()
    },
    completeNow: () => {
      completePhaseNow()
      push()
    },
    monthHistory: getMonth,
    acknowledgeWater: () => {
      acknowledgeWater(Date.now())
      push()
    },
    previewSound: playNotificationSound,
    updateSettings: applySettings,
    setOpenAtLogin: (value) => applySettings({ openAtLogin: value }),
    hideWindow: dismissWindow
  })

  initTray({
    onToggleWindow: toggleWindow,
    onStart: () => {
      startPhase(Date.now())
      push()
    },
    onPause: () => {
      pauseFocus(Date.now())
      push()
    },
    onResume: () => {
      resumeFocus(Date.now())
      push()
    },
    onReset: () => {
      resetFocus()
      push()
    },
    onAcknowledgeWater: () => {
      acknowledgeWater(Date.now())
      push()
    },
    onToggleOpenAtLogin: (value) => {
      applySettings({ openAtLogin: value })
      push()
    },
    onQuit: () => app.quit(),
    getSnapshot: buildSnapshot
  })

  // Automatico, desde que o app esteja em execucao, sem depender do ciclo de
  // foco (secao 5.2).
  startWaterTimer(Date.now())

  // Um unico intervalo para os dois relogios, o tooltip e o push.
  ticker = setInterval(() => {
    const now = Date.now()
    tickFocus(now)
    tickWater(now, currentIdleSeconds(now))
    push()
  }, TICK_MS)

  if (!devemComecarEscondido()) showWindow()

  // DEPOIS da bandeja e da janela, de propósito. O app tem de estar visível e
  // operável antes de tocar em integração com o sistema operacional, para que
  // uma falha aqui seja um recurso a menos e não um app fantasma.
  //
  // Reafirmado a cada execução porque setLoginItemSettings grava o
  // process.execPath corrente, e uma atualização troca o executável.
  if (!isMsixPackaged()) void applyOpenAtLogin(getSettings().openAtLogin)
}

app.on('before-quit', () => {
  if (ticker) clearInterval(ticker)
  flushSettings()
  flushHistory()
  destroyTray()
})
