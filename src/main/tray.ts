import { app, Menu, Tray, nativeImage } from 'electron'
import type { MenuItem } from 'electron'
import { join } from 'node:path'
import type { Snapshot } from '@shared/contract'
import { cyclesMenuLabel, focusLabel, startLabel, trayTooltip, waterLabel } from '@shared/format'

/**
 * Icone permanente na bandeja (secao 6.1).
 *
 * Sobre a secao 7.4 do documento -- "o menu do Electron nao e editavel apos a
 * criacao, toda mudanca exige reconstruir o menu inteiro": em vez de
 * reconstruir a cada segundo para manter os tempos atualizados, o menu e
 * construido no instante do clique direito. Nunca fica obsoleto e nao custa
 * nada enquanto ninguem o abre.
 */

let tray: Tray | null = null
let lastTooltip = ''

export interface TrayActions {
  onToggleWindow: () => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onAcknowledgeWater: () => void
  onToggleOpenAtLogin: (value: boolean) => void
  onQuit: () => void
  getSnapshot: () => Snapshot
}

function iconPath(file: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, file)
    : join(__dirname, '../../resources', file)
}

function buildMenu(actions: TrayActions): Menu {
  const snapshot = actions.getSnapshot()
  const { status } = snapshot.focus

  return Menu.buildFromTemplate([
    { label: `Cadence — ${focusLabel(snapshot)}`, enabled: false },
    { label: cyclesMenuLabel(snapshot.cyclesToday), enabled: false },
    { type: 'separator' },
    ...(status === 'idle'
      ? [{ label: startLabel(snapshot), click: actions.onStart }]
      : status === 'running'
        ? [{ label: 'Pausar', click: actions.onPause }]
        : [{ label: 'Retomar', click: actions.onResume }]),
    { label: 'Zerar', enabled: status !== 'idle', click: actions.onReset },
    { type: 'separator' },
    { label: waterLabel(snapshot), enabled: false },
    // Com o lembrete desligado nao ha contagem para reiniciar: o comando sai
    // do menu em vez de ficar ali sem efeito.
    ...(snapshot.water.status === 'off'
      ? []
      : [{ label: 'Já bebi água', click: actions.onAcknowledgeWater }]),
    { type: 'separator' },
    { label: 'Configurações…', click: actions.onToggleWindow },
    // Sob MSIX o item sai do menu: a inicializacao e controlada em
    // Configuracoes do Windows, e um checkbox aqui nao mudaria nada.
    ...(snapshot.msix
      ? []
      : [
          {
            label: 'Iniciar com o Windows',
            type: 'checkbox' as const,
            checked: snapshot.settings.openAtLogin,
            click: (item: MenuItem) => actions.onToggleOpenAtLogin(item.checked)
          }
        ]),
    { type: 'separator' },
    { label: 'Sair', click: actions.onQuit }
  ])
}

export function initTray(actions: TrayActions): void {
  const image = nativeImage.createFromPath(iconPath('tray.png'))
  image.addRepresentation({
    scaleFactor: 2,
    buffer: nativeImage.createFromPath(iconPath('tray@2x.png')).toPNG()
  })

  // Referencia em escopo de modulo: um Tray guardado apenas numa variavel
  // local e recolhido pelo GC e o icone desaparece da bandeja.
  tray = new Tray(image)
  tray.setToolTip('Cadence')

  tray.on('click', actions.onToggleWindow)
  tray.on('double-click', actions.onToggleWindow)
  // Menu construido na hora do clique -- ver comentario no topo do arquivo.
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu(actions)))
}

/**
 * Tooltip com o tempo restante da fase corrente (secao 6.1, criterio 3).
 * Chamado a cada segundo; a chamada nativa e evitada quando o texto nao muda.
 */
export function updateTrayTooltip(snapshot: Snapshot): void {
  if (!tray || tray.isDestroyed()) return
  const tooltip = trayTooltip(snapshot)
  if (tooltip === lastTooltip) return
  lastTooltip = tooltip
  tray.setToolTip(tooltip)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
