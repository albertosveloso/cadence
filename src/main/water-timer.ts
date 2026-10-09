import type { Settings, WaterState, WaterStatus } from '@shared/contract'
import { DEFAULT_SETTINGS } from '@shared/contract'

/**
 * Lembrete de agua e movimento (secao 5.2). Automatico, roda desde que o app
 * esteja em execucao e NAO depende do ciclo de foco.
 *
 * NAO importa focus-timer e nao deve passar a importar, nem por evento. Se o
 * lembrete so existisse durante a pausa de um Pomodoro, ele desapareceria
 * justamente nos dias em que o usuario nao inicia nenhum ciclo -- que sao os
 * dias em que ele mais precisa (secao 4).
 *
 * Como no focus-timer: configuracao por injecao e `now` sempre por parametro.
 */

const MINUTE = 60_000
/** Repeticao unica, 10 min apos o disparo original (secao 5.2). */
const REPEAT_DELAY_MS = 10 * MINUTE

/**
 * Tolerancia de presenca: sem nenhuma atividade nos ultimos 60 s, o lembrete
 * nao dispara -- ele espera a pessoa voltar.
 *
 * Sem isso, o aviso e a sua repeticao unica podiam ser gastos com a cadeira
 * vazia, e o usuario voltava sem ter visto nada, com o proximo lembrete a um
 * intervalo inteiro de distancia. Sessenta segundos e curto o bastante para
 * nao atrapalhar quem esta trabalhando e longo o bastante para nao disparar
 * no instante em que a pessoa se afasta.
 */
const PRESENCE_GRACE_SECONDS = 60

export type WaterEvent = { type: 'remind'; repeat: boolean }

type SettingsProvider = () => Pick<
  Settings,
  'waterEnabled' | 'waterIntervalMinutes' | 'idleThresholdMinutes'
>

let readSettings: SettingsProvider = () => DEFAULT_SETTINGS

export function setWaterSettingsProvider(provider: SettingsProvider): void {
  readSettings = provider
}

let status: WaterStatus = 'waiting'
let deadlineMs = 0
let remainingMs = 0
/** Hora do disparo original do ciclo corrente, para retomar a cadencia regular. */
let anchorMs = 0
/** Motivo do congelamento, se houver. */
let frozenBy: 'idle' | 'sleep' | null = null
/** Instante do congelamento, para medir quanto durou a ausencia. */
let frozenAt = 0

const listeners = new Set<(event: WaterEvent) => void>()

function emit(event: WaterEvent): void {
  for (const listener of listeners) listener(event)
}

function intervalMs(): number {
  return readSettings().waterIntervalMinutes * MINUTE
}

export function onWaterEvent(listener: (event: WaterEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getWaterState(): WaterState {
  return { status, remainingMs }
}

export function startWaterTimer(now: number): void {
  status = 'waiting'
  anchorMs = 0
  frozenBy = null
  remainingMs = intervalMs()
  deadlineMs = now + remainingMs
}

/**
 * Ligado ou desligado nas configuracoes.
 *
 * Desligar nao congela: zera. Religar comeca um intervalo CHEIO, e nao o
 * restante de antes -- quem desligou para uma reuniao de duas horas nao pode
 * ser cobrado no minuto seguinte ao religar.
 *
 * Chamado tambem no bootstrap, para que um settings.json com o lembrete
 * desligado nao faca o relogio correr ate o primeiro tick perceber.
 */
export function setWaterEnabled(enabled: boolean, now: number): void {
  if (enabled) {
    startWaterTimer(now)
    return
  }
  status = 'off'
  remainingMs = 0
  deadlineMs = 0
  anchorMs = 0
  frozenBy = null
}

/** Reconhecimento: reinicia o intervalo cheio. Desligado, nao ha o que atender. */
export function acknowledgeWater(now: number): void {
  if (!readSettings().waterEnabled) return
  startWaterTimer(now)
}

function fire(now: number, repeat: boolean): void {
  if (!repeat) anchorMs = now
  status = repeat ? 'repeated' : 'fired'
  deadlineMs = now + REPEAT_DELAY_MS
  emit({ type: 'remind', repeat })
}

/**
 * Ignorado duas vezes: silencia ate o proximo intervalo regular (secao 5.2).
 * "Regular" e medido do disparo original, nao da repeticao -- senao a cadencia
 * escorregaria 10 min a cada lembrete ignorado.
 */
function silence(now: number): void {
  deadlineMs = Math.max(anchorMs + intervalMs(), now + MINUTE)
  status = 'waiting'
  anchorMs = 0
}

function freeze(reason: 'idle' | 'sleep', now: number): void {
  // Desligado ja esta parado. Congelar aqui trocaria 'off' por 'suspended' e
  // faria a interface anunciar uma espera por inatividade que nao existe.
  if (frozenBy || status === 'off') return
  remainingMs = Math.max(0, deadlineMs - now)
  frozenBy = reason
  frozenAt = now
  status = 'suspended'
}

/**
 * Volta da ausencia.
 *
 * Regra unica: ausencia igual ou maior que o limiar E ter levantado, que era
 * exatamente o pedido do lembrete -- entao o intervalo recomeca do zero.
 * Abaixo disso, o tempo que faltava e preservado.
 *
 * Sem isso, quem voltava de um almoco de 70 min era mandado levantar poucos
 * minutos depois de sentar, porque a ausencia havia consumido quase todo o
 * intervalo antes do congelamento.
 */
function thaw(now: number, thresholdSeconds: number): void {
  if (!frozenBy) return

  // Na ociosidade o congelamento so ocorre DEPOIS do limiar, e esse tempo
  // tambem foi ausencia. No sono da maquina, conta so o tempo dormido.
  const limiarMs = thresholdSeconds * 1000
  const ausenciaMs = (frozenBy === 'idle' ? limiarMs : 0) + (now - frozenAt)

  frozenBy = null
  status = 'waiting'

  if (ausenciaMs >= limiarMs) {
    anchorMs = 0
    remainingMs = intervalMs()
  }
  deadlineMs = now + remainingMs
}

/**
 * @param idleSeconds valor de powerMonitor.getSystemIdleTime(), em SEGUNDOS.
 *   A API nao retorna milissegundos; confundir as unidades faria o limiar de
 *   5 min virar 5 s.
 */
export function tickWater(now: number, idleSeconds: number): void {
  // Desligado nas configuracoes: o relogio nao corre e nada fica pendente.
  // Afirmado a cada tick, e nao so na troca, para que um settings.json
  // editado a mao tambem seja obedecido.
  if (!readSettings().waterEnabled) {
    status = 'off'
    remainingMs = 0
    return
  }

  // Religado sem passar pelas configuracoes -- settings.json editado a mao com
  // o app vivo. Sem isto o alvo continuaria zerado e nada dispararia nunca,
  // porque 'off' nao casa com nenhum ramo da maquina abaixo.
  if (status === 'off') startWaterTimer(now)

  const thresholdSeconds = readSettings().idleThresholdMinutes * 60

  if (idleSeconds >= thresholdSeconds) {
    freeze('idle', now)
    return
  }
  if (frozenBy === 'idle') thaw(now, thresholdSeconds)
  if (frozenBy) return

  // Nao gritar para uma cadeira vazia: com o alvo vencido mas sem atividade
  // recente, o lembrete espera em vez de gastar seu aviso e sua repeticao
  // unica (secao 5.2). O alvo fica no passado e dispara assim que a pessoa
  // toca em qualquer coisa.
  const presente = idleSeconds < PRESENCE_GRACE_SECONDS

  if (presente && now >= deadlineMs) {
    if (status === 'waiting') fire(now, false)
    else if (status === 'fired') fire(now, true)
    else if (status === 'repeated') silence(now)
  }
  remainingMs = Math.max(0, deadlineMs - now)
}

export function suspendWater(now: number): void {
  freeze('sleep', now)
}

export function resumeWaterFromSleep(now: number): void {
  if (frozenBy === 'sleep') thaw(now, readSettings().idleThresholdMinutes * 60)
}

/**
 * Intervalo alterado nas configuracoes: preserva o tempo ja decorrido em vez
 * de reiniciar a contagem, para que ajustar de 55 para 50 nao zere o relogio.
 */
export function syncWaterSettings(previousIntervalMs: number, now: number): void {
  if (status !== 'waiting' || frozenBy) return
  const elapsed = Math.max(0, previousIntervalMs - Math.max(0, deadlineMs - now))
  const next = intervalMs()
  remainingMs = Math.min(next, Math.max(0, next - elapsed))
  deadlineMs = now + remainingMs
}
