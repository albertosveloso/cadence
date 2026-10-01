import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_SETTINGS, type Snapshot } from './contract'
import {
  cyclesMenuLabel,
  focusLabel,
  formatClock,
  formatCycles,
  formatMinutesAway,
  startLabel,
  trayTooltip,
  waterLabel
} from './format'

/**
 * Verificação do critério 3 do documento: "o tooltip do ícone reflete o tempo
 * restante da fase corrente".
 *
 * Conferir isso à mão significa passar o mouse sobre o ícone da bandeja e ler
 * uma dica de ferramenta — o que não distingue "parado" de "pausado" nem pega
 * o caso do lembrete pendente.
 */

const MINUTE = 60_000

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    focus: { phase: 'focus', status: 'idle', remainingMs: 25 * MINUTE, totalMs: 25 * MINUTE },
    cyclesToday: 0,
    water: { status: 'waiting', remainingMs: 55 * MINUTE },
    settings: DEFAULT_SETTINGS,
    darkMode: true,
    msix: false,
    ...overrides
  }
}

describe('formatacao de tempo', () => {
  it('usa mm:ss com dois digitos', () => {
    assert.equal(formatClock(25 * MINUTE), '25:00')
    assert.equal(formatClock(5 * MINUTE + 3000), '05:03')
    assert.equal(formatClock(0), '00:00')
  })

  it('arredonda para cima, para que 24:59.5 nao apareca como 24:59', () => {
    // Sem o ceil, o cronometro comecaria exibindo 24:59 em vez de 25:00.
    assert.equal(formatClock(25 * MINUTE - 1), '25:00')
  })

  it('nao produz tempo negativo', () => {
    assert.equal(formatClock(-5000), '00:00')
  })

  it('passa de 99 minutos sem quebrar o formato', () => {
    assert.equal(formatClock(180 * MINUTE), '180:00')
  })

  it('descreve o proximo lembrete em minutos', () => {
    assert.equal(formatMinutesAway(38 * MINUTE), 'em 38 min')
    assert.equal(formatMinutesAway(1 * MINUTE), 'em 1 min')
    assert.equal(formatMinutesAway(20_000), 'a qualquer momento')
  })

  it('concorda em singular e plural nos ciclos', () => {
    assert.equal(formatCycles(0), 'nenhum ciclo ainda hoje')
    assert.equal(formatCycles(1), '1 ciclo hoje')
    assert.equal(formatCycles(3), '3 ciclos hoje')
    assert.equal(cyclesMenuLabel(1), '1 ciclo concluído hoje')
    assert.equal(cyclesMenuLabel(2), '2 ciclos concluídos hoje')
  })
})

describe('etiquetas da bandeja (criterio 3)', () => {
  it('distingue foco pronto de pausa pronta', () => {
    // Com o inicio sempre manual (secao 5.1), "parado" seria ambiguo: o
    // usuario precisa saber se o que o espera e um foco ou uma pausa.
    assert.equal(trayTooltip(snapshot()), 'Cadence — pronto para focar')

    const pausaPronta = snapshot({
      focus: { phase: 'break', status: 'idle', remainingMs: 5 * MINUTE, totalMs: 5 * MINUTE }
    })
    assert.equal(trayTooltip(pausaPronta), 'Cadence — pausa pronta')
    assert.equal(startLabel(pausaPronta), 'Iniciar pausa')
    assert.equal(startLabel(snapshot()), 'Iniciar foco')
  })

  it('reflete a fase e o tempo restante enquanto roda', () => {
    const state = snapshot({
      focus: { phase: 'focus', status: 'running', remainingMs: 24 * MINUTE + 31_000, totalMs: 25 * MINUTE }
    })
    assert.equal(trayTooltip(state), 'Cadence — Foco 24:31')
  })

  it('distingue pausado de rodando', () => {
    const state = snapshot({
      focus: { phase: 'focus', status: 'paused', remainingMs: 15 * MINUTE, totalMs: 25 * MINUTE }
    })
    assert.equal(focusLabel(state), 'Foco 15:00 (pausado)')
  })

  it('nomeia a fase de pausa', () => {
    const state = snapshot({
      focus: { phase: 'break', status: 'running', remainingMs: 5 * MINUTE, totalMs: 5 * MINUTE }
    })
    assert.equal(focusLabel(state), 'Pausa 05:00')
  })

  it('descreve os quatro estados do lembrete', () => {
    assert.equal(waterLabel(snapshot()), 'Água em 55 min')
    assert.equal(
      waterLabel(snapshot({ water: { status: 'fired', remainingMs: 10 * MINUTE } })),
      'Água: lembrete pendente'
    )
    assert.equal(
      waterLabel(snapshot({ water: { status: 'repeated', remainingMs: 10 * MINUTE } })),
      'Água: lembrete pendente'
    )
    assert.equal(
      waterLabel(snapshot({ water: { status: 'suspended', remainingMs: 30 * MINUTE } })),
      'Água: em espera por inatividade'
    )
  })

  it('o rotulo do lembrete nao depende do estado do foco', () => {
    // Materializa a secao 4: o texto de agua e identico com o foco parado ou
    // rodando. Se algum dia passar a depender, este teste quebra.
    const idle = snapshot()
    const running = snapshot({
      focus: { phase: 'focus', status: 'running', remainingMs: 12 * MINUTE, totalMs: 25 * MINUTE }
    })
    assert.equal(waterLabel(idle), waterLabel(running))
  })
})
