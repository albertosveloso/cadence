import { contextBridge, ipcRenderer } from 'electron'
import {
  CHANNELS,
  type AboutInfo,
  type CadenceApi,
  type NotificationSound,
  type Settings,
  type Snapshot
} from '@shared/contract'

/**
 * Canais enumerados um por um. Nunca expor `ipcRenderer` nem um
 * `invoke(channel, ...args)` generico -- isso equivaleria a nao ter bridge.
 */
const api: CadenceApi = {
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.stateGet),
  app: {
    about: (): Promise<AboutInfo> => ipcRenderer.invoke(CHANNELS.appAbout)
  },
  focus: {
    start: () => ipcRenderer.invoke(CHANNELS.focusStart),
    pause: () => ipcRenderer.invoke(CHANNELS.focusPause),
    resume: () => ipcRenderer.invoke(CHANNELS.focusResume),
    reset: () => ipcRenderer.invoke(CHANNELS.focusReset),
    completeNow: () => ipcRenderer.invoke(CHANNELS.focusCompleteNow)
  },
  history: {
    month: (year: number, month: number) =>
      ipcRenderer.invoke(CHANNELS.historyMonth, year, month)
  },
  water: {
    acknowledge: () => ipcRenderer.invoke(CHANNELS.waterAck)
  },
  sound: {
    preview: (sound: NotificationSound) => ipcRenderer.send(CHANNELS.soundPreview, sound)
  },
  settings: {
    update: (patch: Partial<Settings>) => ipcRenderer.invoke(CHANNELS.settingsUpdate, patch)
  },
  system: {
    setOpenAtLogin: (value: boolean) => ipcRenderer.invoke(CHANNELS.systemOpenAtLogin, value)
  },
  window: {
    hide: () => ipcRenderer.send(CHANNELS.windowHide)
  },
  onSnapshot: (listener: (snapshot: Snapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Snapshot) => listener(snapshot)
    ipcRenderer.on(CHANNELS.stateChanged, handler)
    // Devolver o cancelamento e obrigatorio: sem isso, StrictMode e cada
    // remontagem de componente acumulam listeners silenciosamente.
    return () => {
      ipcRenderer.off(CHANNELS.stateChanged, handler)
    }
  }
}

contextBridge.exposeInMainWorld('cadence', api)
