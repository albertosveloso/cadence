import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  acknowledgeWater,
  getWaterState,
  onWaterEvent,
  resumeWaterFromSleep,
  setWaterEnabled,
  setWaterSettingsProvider,
  startWaterTimer,
  suspendWater,
  syncWaterSettings,
  tickWater,
  type WaterEvent
} from './water-timer'

/**
 * Verificação das regras das seções 5.2 e 5.3.
 *
 * A regra da repetição única é o ponto onde um lembrete deixa de ser útil e
 * passa a ser motivo para desinstalar o app. Vale conferir por asserção, não
 * por espera.
 */

const MINUTE = 60_000
const ACTIVE = 0 // ociosidade em segundos: usuario presente
/** Base fixa, 03/09/2026 09:00 local. Nenhum teste depende do relogio real. */
const T0 = new Date(2026, 8, 3, 9, 0, 0).getTime()

let settings = { waterEnabled: true, waterIntervalMinutes: 55, idleThresholdMinutes: 5 }

function advance(from: number, ms: number, idleSeconds = ACTIVE): number {
  let now = from
  const target = from + ms
  while (now < target) {
    now = Math.min(target, now + 1000)
    tickWater(now, idleSeconds)
  }
  return now
}

describe('lembrete de agua e movimento (secoes 5.2 e 5.3)', () => {
  let events: WaterEvent[]
  let off: () => void

  beforeEach(() => {
    settings = { waterEnabled: true, waterIntervalMinutes: 55, idleThresholdMinutes: 5 }
    setWaterSettingsProvider(() => settings)
    events = []
    off?.()
    off = onWaterEvent((event) => events.push(event))
    startWaterTimer(T0)
  })

  it('dispara no intervalo configurado', () => {
    advance(T0, 54 * MINUTE)
    assert.equal(events.length, 0)

    advance(T0 + 54 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 1)
    assert.equal(events[0]!.repeat, false)
    assert.equal(getWaterState().status, 'fired')
  })

  it('repete UMA UNICA VEZ 10 min depois, e depois silencia', () => {
    let now = advance(T0, 55 * MINUTE)
    assert.equal(events.length, 1)

    // Ignorado: repete uma vez em 10 min.
    now = advance(now, 10 * MINUTE)
    assert.equal(events.length, 2)
    assert.equal(events[1]!.repeat, true)
    assert.equal(getWaterState().status, 'repeated')

    // Ignorado de novo: silencia. Nada mais dispara nos 40 min seguintes.
    now = advance(now, 40 * MINUTE)
    assert.equal(events.length, 2, 'nao pode existir uma terceira insistencia')
    assert.equal(getWaterState().status, 'waiting')
  })

  it('a cadencia regular e medida do disparo original, nao da repeticao', () => {
    // Dispara em 55, repete em 65, silencia em 75 e volta a esperar.
    const now = advance(T0, 75 * MINUTE)
    assert.equal(events.length, 2)

    // Proximo regular = ancora (55) + intervalo (55) = 110 min do inicio.
    advance(now, 34 * MINUTE)
    assert.equal(events.length, 2, 'ainda nao')
    advance(T0 + 109 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 3, 'dispara em t+110, sem escorregar os 10 min da repeticao')
  })

  it('reconhecer reinicia o intervalo cheio', () => {
    const now = advance(T0, 55 * MINUTE)
    assert.equal(events.length, 1)

    acknowledgeWater(now)
    assert.equal(getWaterState().status, 'waiting')

    advance(now, 54 * MINUTE)
    assert.equal(events.length, 1)
    advance(now + 54 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 2)
  })

  it('suspende por ociosidade e retoma com a atividade (secao 5.3)', () => {
    let now = advance(T0, 30 * MINUTE)
    assert.equal(getWaterState().status, 'waiting')

    // Acima do limiar: computador ligado, ninguem presente.
    now = advance(now, 2 * MINUTE, 6 * 60)
    assert.equal(getWaterState().status, 'suspended')

    // Duas horas ausente: nada dispara.
    now = advance(now, 120 * MINUTE, 6 * 60)
    assert.equal(events.length, 0, 'nao insiste com uma cadeira vazia')

    // Volta a atividade. Ficar 2 h fora E ter levantado, entao o intervalo
    // recomeca do zero em vez de cobrar os 25 min que faltavam.
    tickWater(now, ACTIVE)
    assert.equal(getWaterState().status, 'waiting')
    advance(now, 54 * MINUTE)
    assert.equal(events.length, 0, 'nao cobra logo apos a volta')
    advance(now + 54 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 1, 'intervalo cheio a partir da volta')
  })

  it('nao dispara para uma cadeira vazia', () => {
    // Ausencia curta, abaixo do limiar de 5 min: nao congela, mas tambem nao
    // pode gastar o aviso e a repeticao unica sem ninguem para ver.
    let now = advance(T0, 54 * MINUTE)
    now = advance(now, 4 * MINUTE, 3 * 60)
    assert.equal(events.length, 0, 'alvo vencido, mas sem ninguem na cadeira')

    // A pessoa toca em algo: o aviso sai na hora.
    tickWater(now + 1000, ACTIVE)
    assert.equal(events.length, 1)
  })

  it('sono curto da maquina preserva o tempo que faltava', () => {
    const dormeEm = advance(T0, 20 * MINUTE)
    suspendWater(dormeEm)

    // Tampa fechada por 2 min: abaixo do limiar, nao e ausencia.
    const acordaEm = dormeEm + 2 * MINUTE
    resumeWaterFromSleep(acordaEm)

    advance(acordaEm, 34 * MINUTE)
    assert.equal(events.length, 0)
    advance(acordaEm + 34 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 1, 'retoma os 35 min que faltavam')
  })

  it('ausencia com lembrete pendente conta como atendida', () => {
    let now = advance(T0, 55 * MINUTE)
    assert.equal(getWaterState().status, 'fired')

    // O usuario saiu -- ou seja, levantou-se, que era o pedido do lembrete.
    now = advance(now, 10 * MINUTE, 6 * 60)
    assert.equal(getWaterState().status, 'suspended')
    assert.equal(events.length, 1, 'nao repete enquanto ausente')

    tickWater(now, ACTIVE)
    assert.equal(getWaterState().status, 'waiting')
    advance(now, 54 * MINUTE)
    assert.equal(events.length, 1, 'volta com o intervalo cheio, sem cobrar de novo')
  })

  it('o limiar de ociosidade e lido em SEGUNDOS', () => {
    // 299 s de ociosidade contra um limiar de 5 min: ainda ativo.
    advance(T0, 2 * MINUTE, 299)
    assert.equal(getWaterState().status, 'waiting')
    // 300 s: suspende.
    tickWater(T0 + 2 * MINUTE + 1000, 300)
    assert.equal(getWaterState().status, 'suspended')
  })

  it('nao avanca enquanto a maquina dorme', () => {
    const sleepAt = advance(T0, 20 * MINUTE)
    suspendWater(sleepAt)

    const wakeAt = sleepAt + 8 * 3600_000
    tickWater(wakeAt, ACTIVE)
    assert.equal(events.length, 0, 'acordar nao dispara uma rajada')

    // Oito horas dormindo E ausencia: o intervalo recomeca do zero.
    resumeWaterFromSleep(wakeAt)
    advance(wakeAt, 54 * MINUTE)
    assert.equal(events.length, 0)
    advance(wakeAt + 54 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 1, 'intervalo cheio ao acordar')
  })

  it('desligado, nao conta nem dispara', () => {
    settings = { ...settings, waterEnabled: false }
    setWaterEnabled(false, T0)
    assert.equal(getWaterState().status, 'off')
    assert.equal(getWaterState().remainingMs, 0)

    // Um dia inteiro de trabalho: nenhum aviso.
    advance(T0, 8 * 60 * MINUTE)
    assert.equal(events.length, 0)
    assert.equal(getWaterState().status, 'off')
  })

  it('desligado com um lembrete pendente, o pendente some', () => {
    const now = advance(T0, 55 * MINUTE)
    assert.equal(getWaterState().status, 'fired')

    settings = { ...settings, waterEnabled: false }
    setWaterEnabled(false, now)
    assert.equal(getWaterState().status, 'off')

    // A repeticao de 10 min nao pode sobreviver ao desligamento.
    advance(now, 30 * MINUTE)
    assert.equal(events.length, 1)
  })

  it('religar comeca um intervalo CHEIO, nao o restante de antes', () => {
    let now = advance(T0, 50 * MINUTE) // faltavam 5 min

    settings = { ...settings, waterEnabled: false }
    setWaterEnabled(false, now)
    now = advance(now, 120 * MINUTE)

    settings = { ...settings, waterEnabled: true }
    setWaterEnabled(true, now)
    assert.equal(getWaterState().status, 'waiting')

    advance(now, 54 * MINUTE)
    assert.equal(events.length, 0, 'nao cobra os 5 min que faltavam antes de desligar')
    advance(now + 54 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 1, 'intervalo cheio a partir do religamento')
  })

  it('desligado, a ociosidade nao troca o estado por "suspended"', () => {
    settings = { ...settings, waterEnabled: false }
    setWaterEnabled(false, T0)

    advance(T0, 30 * MINUTE, 6 * 60)
    assert.equal(getWaterState().status, 'off', 'desligado nao e "em espera por inatividade"')

    suspendWater(T0 + 30 * MINUTE)
    assert.equal(getWaterState().status, 'off', 'dormir tambem nao muda o desligado')
  })

  it('desligado, reconhecer nao religa o relogio', () => {
    settings = { ...settings, waterEnabled: false }
    setWaterEnabled(false, T0)

    acknowledgeWater(T0)
    assert.equal(getWaterState().status, 'off')

    advance(T0, 60 * MINUTE)
    assert.equal(events.length, 0)
  })

  it('settings.json editado a mao com o app vivo religa no proximo tick', () => {
    settings = { ...settings, waterEnabled: false }
    setWaterEnabled(false, T0)

    // Sem passar por setWaterEnabled: so o arquivo mudou.
    settings = { ...settings, waterEnabled: true }

    // O rearme acontece no primeiro tick depois da edicao, entao o intervalo
    // cheio corre a partir de T0 + 1 s -- dai a margem de 2 min abaixo.
    const now = advance(T0, 54 * MINUTE)
    assert.equal(events.length, 0)
    advance(now, 2 * MINUTE)
    assert.equal(events.length, 1, 'rearma com o intervalo cheio em vez de travar em zero')
  })

  it('alterar o intervalo preserva o tempo ja decorrido', () => {
    const now = advance(T0, 30 * MINUTE)

    // De 55 para 40 min: 30 ja decorreram, entao faltam 10.
    const previous = settings.waterIntervalMinutes * MINUTE
    settings = { ...settings, waterIntervalMinutes: 40 }
    syncWaterSettings(previous, now)

    advance(now, 9 * MINUTE)
    assert.equal(events.length, 0)
    advance(now + 9 * MINUTE, 1 * MINUTE)
    assert.equal(events.length, 1)
  })
})
