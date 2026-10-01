import type { FocusPhase, FocusState, FocusStatus, Settings } from '@shared/contract'
import { DEFAULT_SETTINGS, LONG_BREAK_EVERY } from '@shared/contract'

/**
 * Ciclo de foco (secao 5.1). Vive no processo principal: se ficasse no
 * renderer, fechar a janela pararia o cronometro (secao 7.1).
 *
 * NAO importa water-timer e nao deve passar a importar. Os dois relogios sao
 * independentes por decisao de negocio (secao 4).
 *
 * Duas escolhas de desenho carregam o resto do modulo:
 *
 * 1. A configuracao entra por injecao, nao por import de ./store. Sem isso o
 *    modulo arrastaria o Electron consigo e a maquina de estados nao poderia
 *    ser verificada fora de uma janela.
 *
 * 2. NENHUMA funcao aqui le o relogio. `now` e sempre parametro. Alem de
 *    tornar o modulo verificavel, isso elimina a possibilidade de um comando
 *    e o tick discordarem sobre que instante e "agora".
 */

const MINUTE = 60_000

/**
 * Eventos do ciclo.
 *
 * NAO existe evento de "fase iniciada". Comecar um ciclo e uma acao do
 * usuario -- avisa-lo disso seria o app anunciar o que ele acabou de fazer.
 * So a CONCLUSAO de uma fase merece notificacao, porque e o unico momento em
 * que algo acontece sem ele pedir.
 */
export type FocusEvent =
  | {
      type: 'phase-completed'
      /** Fase que terminou. */
      finished: FocusPhase
      /** Fase que comeca agora, automaticamente. */
      next: FocusPhase
      nextDurationMs: number
    }
  /** Um ciclo de foco terminou. Quem conta e grava e ./history. */
  | { type: 'cycle-completed' }

type SettingsProvider = () => Pick<
  Settings,
  'focusMinutes' | 'breakMinutes' | 'longBreakMinutes'
>

let readSettings: SettingsProvider = () => DEFAULT_SETTINGS

export function setFocusSettingsProvider(provider: SettingsProvider): void {
  readSettings = provider
}

/**
 * Ciclos de foco ja concluidos hoje. Injetado porque quem conta e ./history --
 * o timer so precisa saber se a pausa que vem e longa.
 */
let readCyclesToday: () => number = () => 0

export function setCyclesTodayProvider(provider: () => number): void {
  readCyclesToday = provider
}

/**
 * Qual pausa vem depois do foco que acabou de terminar (secao 5.7).
 *
 * Deriva da contagem do dia em vez de guardar um contador proprio: assim a
 * sequencia zera sozinha na virada do dia, sem estado escondido que possa
 * divergir do historico.
 */
function breakAfterFocus(): FocusPhase {
  return readCyclesToday() % LONG_BREAK_EVERY === 0 ? 'long-break' : 'break'
}

let phase: FocusPhase = 'focus'
let status: FocusStatus = 'idle'
let totalMs = 0
let remainingMs = 0
/** Alvo absoluto da fase corrente. `null` quando parado, pausado ou dormindo. */
let deadlineMs: number | null = null
let sleeping = false

const listeners = new Set<(event: FocusEvent) => void>()

function emit(event: FocusEvent): void {
  for (const listener of listeners) listener(event)
}

function phaseDurationMs(target: FocusPhase): number {
  const settings = readSettings()
  const minutes =
    target === 'focus'
      ? settings.focusMinutes
      : target === 'long-break'
        ? settings.longBreakMinutes
        : settings.breakMinutes
  return minutes * MINUTE
}

/**
 * Prepara a fase seguinte SEM inicia-la (secao 5.1).
 *
 * Nenhuma fase comeca sozinha: ao fim do foco o app fica pronto para a pausa,
 * e ao fim da pausa pronto para o foco, sempre esperando o botao. Um ritmo
 * que avanca sem o usuario deixa de ser ritmo e vira cobranca -- e a pausa
 * que comeca sozinha enquanto ele ainda esta escrevendo simplesmente passa.
 */
function armPhase(target: FocusPhase): void {
  phase = target
  totalMs = phaseDurationMs(target)
  remainingMs = totalMs
  deadlineMs = null
  status = 'idle'
}

export function onFocusEvent(listener: (event: FocusEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getFocusState(): FocusState {
  return { phase, status, remainingMs, totalMs }
}

/**
 * Inicia a fase preparada -- foco OU pausa. A duracao e lida agora, e nao
 * quando a fase foi preparada, para que um ajuste nas configuracoes valha
 * para a proxima fase que o usuario iniciar.
 */
export function startPhase(now: number): void {
  if (status !== 'idle') return
  totalMs = phaseDurationMs(phase)
  remainingMs = totalMs
  deadlineMs = now + totalMs
  status = 'running'
}

export function pauseFocus(now: number): void {
  if (status !== 'running') return
  // Congela e preserva: pausa curta NAO invalida o ciclo (secao 5.1).
  remainingMs = Math.max(0, (deadlineMs ?? now) - now)
  deadlineMs = null
  status = 'paused'
}

export function resumeFocus(now: number): void {
  if (status !== 'paused') return
  deadlineMs = now + remainingMs
  status = 'running'
}

/**
 * Conclui a fase corrente agora, antes do tempo (secao 5.1).
 *
 * Contabiliza o ciclo, ao contrario de zerar. Os dois botoes existem para
 * expressar intencoes diferentes: zerar e "abandonei", concluir e "terminei
 * antes". Se concluir nao contasse, seria apenas um zerar com outro nome.
 *
 * Nao emite 'phase-completed': quem concluiu foi o usuario, e o app nao
 * notifica o que a pessoa acabou de fazer.
 */
export function completePhaseNow(): void {
  if (status === 'idle') return

  const finished = phase
  if (finished === 'focus') emit({ type: 'cycle-completed' })
  armPhase(finished === 'focus' ? breakAfterFocus() : 'focus')
}

export function resetFocus(): void {
  // Abandono: descarta o progresso e NAO contabiliza o ciclo (secao 5.1).
  // Volta ao inicio, mesmo que a fase preparada fosse uma pausa.
  armPhase('focus')
}

export function tickFocus(now: number): void {
  if (status !== 'running' || sleeping || deadlineMs === null) return

  remainingMs = Math.max(0, deadlineMs - now)
  if (remainingMs > 0) return

  const finished = phase
  if (finished === 'focus') emit({ type: 'cycle-completed' })

  // Prepara a proxima fase e PARA. Quem a inicia e o usuario (secao 5.1).
  // A contagem ja foi incrementada pelo evento acima, entao breakAfterFocus()
  // ve o total com este ciclo incluido.
  const next: FocusPhase = finished === 'focus' ? breakAfterFocus() : 'focus'
  armPhase(next)
  emit({ type: 'phase-completed', finished, next, nextDurationMs: totalMs })
}

/**
 * Maquina suspensa: dormir nao e focar. Congelamos o restante em vez de
 * deixar um alvo vencido -- o que tambem torna impossivel a rajada de
 * notificacoes que um alvo de horas atras provocaria ao acordar.
 */
export function suspendFocus(now: number): void {
  if (status === 'running' && deadlineMs !== null) {
    remainingMs = Math.max(0, deadlineMs - now)
    deadlineMs = null
  }
  sleeping = true
}

export function resumeFocusFromSleep(now: number): void {
  sleeping = false
  if (status === 'running') deadlineMs = now + remainingMs
}

/**
 * Duracoes alteradas nas configuracoes valem para a proxima fase; se o
 * cronometro esta parado, o display atualiza na hora.
 */
export function syncFocusSettings(): void {
  if (status !== 'idle') return
  // A fase preparada pode ser a pausa, nao necessariamente o foco.
  totalMs = phaseDurationMs(phase)
  remainingMs = totalMs
}

resetFocus()
