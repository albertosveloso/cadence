import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

/**
 * Janela compacta, criada sob demanda e destruida ao fechar.
 *
 * Duas decisoes de leveza, nesta ordem de importancia:
 *
 * 1. Com --hidden no boot, o app sobe para a bandeja sem instanciar
 *    BrowserWindow nenhuma (secao 5.4). Nao se paga por uma janela que o
 *    usuario nao pediu.
 *
 * 2. Fechar DESTROI a janela em vez de esconde-la. Medido neste projeto:
 *    esconder deixava ~307 MB residentes contra ~315 MB com a janela aberta
 *    -- praticamente nada, porque o processo de renderer escondido continua
 *    pago por inteiro. Destruir devolve essa memoria ao custo de ~200-300 ms
 *    para reabrir, o que num app aberto poucas vezes por dia e barato.
 *
 * O app sobrevive a destruicao da janela porque 'window-all-closed' tem
 * handler vazio no bootstrap (secao 7.2).
 */

const WIDTH = 400
/**
 * Altura medida, nao escolhida: e a da aba mais alta das configuracoes
 * ("Lembretes") com folga, para que nenhum painel precise de barra de
 * rolagem. A 452 px, que era o valor anterior, aquela aba transbordava 43 px
 * depois que o lembrete de agua ganhou seu interruptor.
 *
 * Mudou alguma aba? Meca de novo em vez de estimar: scrollHeight do painel
 * contra clientHeight, com a janela no tamanho real.
 */
const HEIGHT = 500

let window: BrowserWindow | null = null

/** Push de estado so faz sentido com a janela na tela. */
export function isWindowVisible(): boolean {
  return window !== null && !window.isDestroyed() && window.isVisible()
}

function create(): BrowserWindow {
  const created = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // Transparente porque o Windows 11 NAO arredonda janelas sem moldura: o
    // DWM so arredonda quem tem frame. O card arredondado do design tem de
    // ser a forma real da janela, com o resto do retangulo transparente.
    transparent: true,
    backgroundColor: '#00000000',
    title: 'Cadence',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
      // contextIsolation, sandbox e nodeIntegration ficam nos defaults do
      // Electron 44 (true, true, false). A acao correta e NAO sobrescrever.
      // backgroundThrottling tambem fica no default (true): desliga-lo vaza
      // para a janela inteira e forca draw/swap de todos os webContents.
    }
  })

  created.setMenuBarVisibility(false)

  // Erros do renderer sao invisiveis num app de bandeja sem devtools aberto.
  // Em desenvolvimento eles vao para o stdout do processo principal.
  if (!app.isPackaged) {
    created.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        console.error(
          `[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`
        )
      }
    })
    created.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error(`[renderer] falha ao carregar ${url}: ${description} (${code})`)
    })
  }

  // Nenhuma navegacao externa acontece dentro do app.
  created.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  created.on('closed', () => {
    window = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    created.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    created.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return created
}

export function showWindow(): void {
  if (window && !window.isDestroyed()) {
    if (!window.isVisible()) window.show()
    window.focus()
    return
  }

  window = create()
  window.once('ready-to-show', () => {
    window?.show()
    window?.focus()
  })
}

/**
 * "Voltar para a bandeja", do ponto de vista do usuario. Por dentro destroi a
 * janela -- ver o comentario no topo do arquivo. O app continua rodando.
 */
export function dismissWindow(): void {
  if (window && !window.isDestroyed()) window.close()
}

/** Clique na bandeja: mostra se estiver escondida, dispensa se estiver na tela. */
export function toggleWindow(): void {
  if (isWindowVisible()) dismissWindow()
  else showWindow()
}

export function sendToWindow(channel: string, payload: unknown): void {
  if (!isWindowVisible()) return
  window?.webContents.send(channel, payload)
}
