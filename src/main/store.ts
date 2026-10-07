import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  NOTIFICATION_SOUNDS,
  SETTINGS_RANGES,
  type NotificationSound,
  type Settings,
  type ThemePreference
} from '@shared/contract'

/**
 * Persistencia em JSON no diretorio de app.getPath('userData') (secao 5.5).
 *
 * Sem dependencia externa de proposito: `electron-store@11` e ESM-only e o
 * processo principal sai em CJS. Isto sao ~120 linhas e faz exatamente o
 * necessario -- inclusive as duas coisas que a maioria dos wrappers nao faz:
 * clamp de faixa na leitura e escrita atomica.
 *
 * O diretorio entra por injecao (configureStore) em vez de vir de um import
 * de `electron`, pelo mesmo motivo dos temporizadores: a logica de leitura
 * tolerante e de escrita atomica e verificavel sem abrir uma janela.
 */

const WRITE_DEBOUNCE_MS = 300

let directory = ''
let cache: Settings | null = null
let pendingWrite: NodeJS.Timeout | null = null

/** Chamado uma vez no bootstrap com app.getPath('userData'). */
export function configureStore(userDataDir: string): void {
  directory = userDataDir
  cache = null
}

function file(): string {
  return join(directory, 'settings.json')
}

function clampInt(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_SETTINGS.theme
}

/**
 * Um settings.json editado a mao -- previsto no documento como plano B para a
 * tela de configuracoes -- nao deve poder deixar o app num estado invalido.
 * Cada campo cai no default quando o tipo esta errado, e nos limites da faixa
 * quando o valor esta fora dela.
 */
function asSound(value: unknown): NotificationSound {
  return NOTIFICATION_SOUNDS.includes(value as NotificationSound)
    ? (value as NotificationSound)
    : DEFAULT_SETTINGS.notificationSound
}

function sanitize(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    focusMinutes: clampInt(
      input.focusMinutes,
      SETTINGS_RANGES.focusMinutes,
      DEFAULT_SETTINGS.focusMinutes
    ),
    breakMinutes: clampInt(
      input.breakMinutes,
      SETTINGS_RANGES.breakMinutes,
      DEFAULT_SETTINGS.breakMinutes
    ),
    longBreakMinutes: clampInt(
      input.longBreakMinutes,
      SETTINGS_RANGES.longBreakMinutes,
      DEFAULT_SETTINGS.longBreakMinutes
    ),
    waterIntervalMinutes: clampInt(
      input.waterIntervalMinutes,
      SETTINGS_RANGES.waterIntervalMinutes,
      DEFAULT_SETTINGS.waterIntervalMinutes
    ),
    idleThresholdMinutes: clampInt(
      input.idleThresholdMinutes,
      SETTINGS_RANGES.idleThresholdMinutes,
      DEFAULT_SETTINGS.idleThresholdMinutes
    ),
    theme: asTheme(input.theme),
    openAtLogin: asBoolean(input.openAtLogin, DEFAULT_SETTINGS.openAtLogin),
    startMinimized: asBoolean(input.startMinimized, DEFAULT_SETTINGS.startMinimized),
    soundEnabled: asBoolean(input.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    notificationSound: asSound(input.notificationSound)
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    cache = sanitize(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    // Arquivo ausente na primeira execucao, ou JSON corrompido: defaults.
    // Nao e caso de erro e nao deve derrubar o app.
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = sanitize({ ...getSettings(), ...patch })
  if (pendingWrite) clearTimeout(pendingWrite)
  pendingWrite = setTimeout(flushSettings, WRITE_DEBOUNCE_MS)
  return cache
}

/**
 * Escrita atomica: grava num temporario e renomeia. Sem isso, um desligamento
 * no meio da escrita deixa um JSON truncado -- e o app abre sem configuracao.
 */
export function flushSettings(): void {
  if (pendingWrite) {
    clearTimeout(pendingWrite)
    pendingWrite = null
  }
  if (!cache || !directory) return

  const target = file()
  const temp = `${target}.tmp`
  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(temp, JSON.stringify(cache, null, 2), 'utf8')
    renameSync(temp, target)
  } catch {
    try {
      unlinkSync(temp)
    } catch {
      // temporario ja nao existe; nada a limpar
    }
  }
}
