import { ipcMain } from 'electron'
import {
  CHANNELS,
  type AboutInfo,
  type MonthHistory,
  type NotificationSound,
  type Settings,
  type Snapshot
} from '@shared/contract'

export interface IpcActions {
  getSnapshot: () => Snapshot
  about: () => AboutInfo
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  completeNow: () => void
  monthHistory: (year: number, month: number) => MonthHistory
  acknowledgeWater: () => void
  previewSound: (sound: NotificationSound) => void
  updateSettings: (patch: Partial<Settings>) => void
  setOpenAtLogin: (value: boolean) => void
  hideWindow: () => void
}

/**
 * Unico lugar do lado do main que conhece nomes de canal.
 *
 * Todo handler devolve o snapshot inteiro: assim o renderer nunca fica com
 * uma parte do estado atualizada e outra nao.
 */
export function registerIpc(actions: IpcActions): void {
  ipcMain.handle(CHANNELS.appAbout, () => actions.about())

  ipcMain.handle(CHANNELS.stateGet, () => actions.getSnapshot())

  ipcMain.handle(CHANNELS.focusStart, () => {
    actions.start()
    return actions.getSnapshot()
  })
  ipcMain.handle(CHANNELS.focusPause, () => {
    actions.pause()
    return actions.getSnapshot()
  })
  ipcMain.handle(CHANNELS.focusResume, () => {
    actions.resume()
    return actions.getSnapshot()
  })
  ipcMain.handle(CHANNELS.focusReset, () => {
    actions.reset()
    return actions.getSnapshot()
  })

  ipcMain.handle(CHANNELS.focusCompleteNow, () => {
    actions.completeNow()
    return actions.getSnapshot()
  })

  ipcMain.handle(CHANNELS.historyMonth, (_event, year: number, month: number) =>
    actions.monthHistory(Number(year), Number(month))
  )

  ipcMain.handle(CHANNELS.waterAck, () => {
    actions.acknowledgeWater()
    return actions.getSnapshot()
  })

  ipcMain.handle(CHANNELS.settingsUpdate, (_event, patch: Partial<Settings>) => {
    actions.updateSettings(patch ?? {})
    return actions.getSnapshot()
  })

  ipcMain.handle(CHANNELS.systemOpenAtLogin, (_event, value: boolean) => {
    actions.setOpenAtLogin(Boolean(value))
    return actions.getSnapshot()
  })

  ipcMain.on(CHANNELS.soundPreview, (_event, sound: NotificationSound) =>
    actions.previewSound(sound)
  )

  ipcMain.on(CHANNELS.windowHide, () => actions.hideWindow())
}
