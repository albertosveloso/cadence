import type { Snapshot } from './contract'

/**
 * Formatação de tempo e das etiquetas da bandeja.
 *
 * Vive em `shared` porque o processo principal (tooltip e menu do tray) e o
 * renderer (cronômetro) precisam exibir exatamente o mesmo tempo — antes isto
 * existia duplicado nos dois lados, o que é a maneira mais fácil de fazer o
 * tooltip e a janela discordarem em um segundo.
 *
 * Nada aqui calcula estado: só transforma o Snapshot em texto.
 */

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatMinutesAway(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 1) return 'a qualquer momento'
  if (minutes === 1) return 'em 1 min'
  return `em ${minutes} min`
}

export function formatCycles(count: number): string {
  if (count === 0) return 'nenhum ciclo ainda hoje'
  return count === 1 ? '1 ciclo hoje' : `${count} ciclos hoje`
}

/** Estado do ciclo de foco em uma linha, para tooltip e menu. */
const NOME_DA_FASE: Record<Snapshot['focus']['phase'], string> = {
  focus: 'Foco',
  break: 'Pausa',
  'long-break': 'Pausa longa'
}

export function focusLabel(snapshot: Snapshot): string {
  const { phase, status, remainingMs } = snapshot.focus

  // Parado nao basta: com o inicio sempre manual, o usuario precisa saber se
  // o que o espera e um foco, uma pausa curta ou a longa.
  if (status === 'idle') {
    if (phase === 'focus') return 'pronto para focar'
    return phase === 'long-break' ? 'pausa longa pronta' : 'pausa pronta'
  }

  const name = NOME_DA_FASE[phase]
  const clock = formatClock(remainingMs)
  return status === 'paused' ? `${name} ${clock} (pausado)` : `${name} ${clock}`
}

/** Rotulo do comando de inicio, que muda com a fase preparada. */
export function startLabel(snapshot: Snapshot): string {
  switch (snapshot.focus.phase) {
    case 'focus':
      return 'Iniciar foco'
    case 'long-break':
      return 'Iniciar pausa longa'
    default:
      return 'Iniciar pausa'
  }
}

/** Estado do lembrete independente, para o menu da bandeja. */
export function waterLabel(snapshot: Snapshot): string {
  switch (snapshot.water.status) {
    case 'suspended':
      return 'Água: em espera por inatividade'
    case 'fired':
    case 'repeated':
      return 'Água: lembrete pendente'
    default:
      return `Água ${formatMinutesAway(snapshot.water.remainingMs)}`
  }
}

/** Tooltip do ícone da bandeja: reflete a fase corrente (§6.1, critério 3). */
export function trayTooltip(snapshot: Snapshot): string {
  return `Cadence — ${focusLabel(snapshot)}`
}

/** Contador do dia no menu da bandeja. */
export function cyclesMenuLabel(count: number): string {
  return count === 1 ? '1 ciclo concluído hoje' : `${count} ciclos concluídos hoje`
}
