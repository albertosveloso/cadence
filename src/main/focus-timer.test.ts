import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  completePhaseNow,
  getFocusState,
  onFocusEvent,
  pauseFocus,
  resetFocus,
  resumeFocus,
  resumeFocusFromSleep,
  setCyclesTodayProvider,
  setFocusSettingsProvider,
  startPhase,
  suspendFocus,
  syncFocusSettings,
  tickFocus,
  type FocusEvent
} from './focus-timer'

/**
 * Verificação das regras da seção 5.1 do documento de análise.
 *
 * Estas regras são a substância do produto e a parte mais cara de conferir à
 * mão: cada asserção sobre "pausar preserva o ciclo" custaria 25 minutos de
 * espera. Aqui o relógio é inteiramente sintético — nenhuma função do módulo
 * lê Date.now().
 *
 * O módulo não conta mais ciclos (quem conta é ./history), então a
 * contabilização é verificada pelos eventos que ele emite.
 */

const MINUTE = 60_000
/** Base fixa, 03/09/2026 09:00 local. Nenhum teste depende do relógio real. */
const T0 = new Date(2026, 8, 3, 9, 0, 0).getTime()

let settings = { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 }
let eventos: FocusEvent[] = []
/** Espelha o history: incrementa no evento, antes de o timer decidir a pausa. */
let ciclosNoDia = 0
let off: () => void = () => {}

const ciclos = () => eventos.filter((e) => e.type === 'cycle-completed').length
const conclusoes = () => eventos.filter((e) => e.type === 'phase-completed')

/** Avança em passos de 1 s, como o ticker real do processo principal. */
function advance(from: number, ms: number): number {
  let now = from
  const target = from + ms
  while (now < target) {
    now = Math.min(target, now + 1000)
    tickFocus(now)
  }
  return now
}

describe('ciclo de foco (secao 5.1)', () => {
  beforeEach(() => {
    settings = { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 }
    setFocusSettingsProvider(() => settings)
    resetFocus()
    eventos = []
    ciclosNoDia = 0
    setCyclesTodayProvider(() => ciclosNoDia)
    off = onFocusEvent((event) => {
      eventos.push(event)
      if (event.type === 'cycle-completed') ciclosNoDia += 1
    })
  })

  afterEach(() => off())

  it('comeca parado, com a duracao de foco configurada', () => {
    const state = getFocusState()
    assert.equal(state.status, 'idle')
    assert.equal(state.phase, 'focus')
    assert.equal(state.remainingMs, 25 * MINUTE)
  })

  it('conta para baixo enquanto roda', () => {
    startPhase(T0)
    advance(T0, 90_000)
    const state = getFocusState()
    assert.equal(state.status, 'running')
    assert.equal(state.remainingMs, 25 * MINUTE - 90_000)
  })

  it('ao terminar o foco, PREPARA a pausa e espera o botao', () => {
    startPhase(T0)
    advance(T0, 25 * MINUTE)

    const state = getFocusState()
    assert.equal(state.phase, 'break')
    assert.equal(state.status, 'idle', 'nenhuma fase comeca sozinha (secao 5.1)')
    assert.equal(state.totalMs, 5 * MINUTE)
    assert.equal(state.remainingMs, 5 * MINUTE, 'a pausa esta cheia, so nao correndo')
    assert.equal(ciclos(), 1)

    assert.equal(conclusoes().length, 1, 'uma conclusao, nao duas')
    assert.equal(conclusoes()[0]!.finished, 'focus')
    assert.equal(conclusoes()[0]!.next, 'break')
  })

  it('iniciar um ciclo NAO gera evento: o aviso e so para o que acontece sozinho', () => {
    startPhase(T0)
    advance(T0, 5 * MINUTE)
    assert.equal(eventos.length, 0, 'apertar Iniciar nao notifica nada')

    const at5 = T0 + 5 * MINUTE
    pauseFocus(at5)
    resumeFocus(at5)
    assert.equal(eventos.length, 0, 'pausar e retomar tambem nao notificam')

    advance(at5, 20 * MINUTE)
    assert.equal(conclusoes().length, 1, 'so a conclusao automatica avisa')
  })

  it('o relogio nao anda enquanto a fase preparada nao for iniciada', () => {
    startPhase(T0)
    const afterFocus = advance(T0, 25 * MINUTE)

    // Meia hora passa sem ninguem apertar nada.
    advance(afterFocus, 30 * MINUTE)

    const state = getFocusState()
    assert.equal(state.phase, 'break')
    assert.equal(state.status, 'idle')
    assert.equal(state.remainingMs, 5 * MINUTE, 'a pausa nao correu sozinha')
    assert.equal(ciclos(), 1, 'e nao inventou ciclos nesse tempo')
  })

  it('iniciada a pausa, ela conclui e prepara o foco seguinte', () => {
    startPhase(T0)
    const afterFocus = advance(T0, 25 * MINUTE)

    startPhase(afterFocus)
    advance(afterFocus, 5 * MINUTE)

    assert.equal(getFocusState().phase, 'focus')
    assert.equal(getFocusState().status, 'idle', 'o foco seguinte tambem espera o botao')
    assert.equal(ciclos(), 1, 'a pausa concluida nao e um ciclo')
  })

  it('pausar e retomar preserva o progresso', () => {
    startPhase(T0)
    const at10 = advance(T0, 10 * MINUTE)

    pauseFocus(at10)
    assert.equal(getFocusState().status, 'paused')
    assert.equal(getFocusState().remainingMs, 15 * MINUTE)

    // O tempo passa enquanto esta pausado, e o restante nao pode mudar.
    const at13 = advance(at10, 3 * MINUTE)
    assert.equal(getFocusState().remainingMs, 15 * MINUTE)

    resumeFocus(at13)
    assert.equal(getFocusState().status, 'running')
    assert.equal(getFocusState().remainingMs, 15 * MINUTE)

    // E o ciclo se conclui 15 min depois da retomada, nao 15 min do inicio.
    advance(at13, 15 * MINUTE)
    assert.equal(ciclos(), 1)
    assert.equal(getFocusState().phase, 'break')
    assert.equal(getFocusState().status, 'idle')
  })

  it('zerar a partir de uma pausa preparada volta ao foco', () => {
    startPhase(T0)
    advance(T0, 25 * MINUTE)
    assert.equal(getFocusState().phase, 'break')

    resetFocus()

    assert.equal(getFocusState().phase, 'focus')
    assert.equal(getFocusState().status, 'idle')
    assert.equal(getFocusState().remainingMs, 25 * MINUTE)
  })

  it('zerar descarta o progresso e NAO contabiliza o ciclo', () => {
    startPhase(T0)
    advance(T0, 24 * MINUTE)

    resetFocus()

    const state = getFocusState()
    assert.equal(state.status, 'idle')
    assert.equal(state.phase, 'focus')
    assert.equal(state.remainingMs, 25 * MINUTE)
    assert.equal(ciclos(), 0, 'abandono invalida o ciclo')
  })

  describe('concluir antes da hora (secao 5.1)', () => {
    it('conta o ciclo e avanca para a pausa', () => {
      startPhase(T0)
      advance(T0, 8 * MINUTE)

      completePhaseNow()

      assert.equal(ciclos(), 1, 'concluir e "terminei antes", nao "abandonei"')
      assert.equal(getFocusState().phase, 'break')
      assert.equal(getFocusState().status, 'idle', 'a pausa fica preparada, nao iniciada')
      assert.equal(getFocusState().remainingMs, 5 * MINUTE)
    })

    it('NAO notifica: quem concluiu foi o usuario', () => {
      startPhase(T0)
      advance(T0, 8 * MINUTE)
      completePhaseNow()
      assert.equal(conclusoes().length, 0)
    })

    it('encerrar a pausa volta ao foco sem contabilizar ciclo', () => {
      startPhase(T0)
      const afterFocus = advance(T0, 25 * MINUTE)
      assert.equal(ciclos(), 1)

      // A pausa precisa ser iniciada antes de poder ser encerrada.
      startPhase(afterFocus)
      advance(afterFocus, 1 * MINUTE)
      completePhaseNow()

      assert.equal(ciclos(), 1, 'encerrar a pausa nao inventa um ciclo')
      assert.equal(getFocusState().phase, 'focus')
      assert.equal(getFocusState().status, 'idle')
      assert.equal(getFocusState().remainingMs, 25 * MINUTE)
    })

    it('funciona com o cronometro pausado', () => {
      startPhase(T0)
      const at3 = advance(T0, 3 * MINUTE)
      pauseFocus(at3)

      completePhaseNow()

      assert.equal(ciclos(), 1)
      assert.equal(getFocusState().status, 'idle')
      assert.equal(getFocusState().phase, 'break')
    })

    it('nao faz nada com o cronometro parado', () => {
      completePhaseNow()
      assert.equal(ciclos(), 0)
      assert.equal(getFocusState().status, 'idle')
    })
  })

  describe('pausa longa (secao 5.7)', () => {
    /** Conclui um foco inteiro e devolve o instante do fim. */
    function concluirFoco(desde: number): number {
      startPhase(desde)
      return advance(desde, settings.focusMinutes * MINUTE)
    }

    it('os tres primeiros ciclos levam a pausa curta', () => {
      let agora = T0
      for (let i = 1; i <= 3; i++) {
        agora = concluirFoco(agora)
        assert.equal(getFocusState().phase, 'break', `ciclo ${i}`)
        assert.equal(getFocusState().totalMs, 5 * MINUTE)
        // Consome a pausa para poder iniciar o proximo foco.
        startPhase(agora)
        agora = advance(agora, 5 * MINUTE)
      }
    })

    it('o quarto ciclo do dia leva a pausa LONGA', () => {
      let agora = T0
      for (let i = 1; i <= 3; i++) {
        agora = concluirFoco(agora)
        startPhase(agora)
        agora = advance(agora, 5 * MINUTE)
      }

      concluirFoco(agora)

      assert.equal(getFocusState().phase, 'long-break')
      assert.equal(getFocusState().totalMs, 15 * MINUTE, 'usa longBreakMinutes')
      assert.equal(ciclosNoDia, 4)
    })

    it('volta a acontecer no oitavo ciclo', () => {
      let agora = T0
      for (let i = 1; i <= 8; i++) {
        agora = concluirFoco(agora)
        const esperado = i % 4 === 0 ? 'long-break' : 'break'
        assert.equal(getFocusState().phase, esperado, `ciclo ${i}`)
        startPhase(agora)
        agora = advance(agora, getFocusState().totalMs)
      }
    })

    it('a duracao da pausa longa e configuravel', () => {
      settings = { ...settings, longBreakMinutes: 30 }
      let agora = T0
      for (let i = 1; i <= 3; i++) {
        agora = concluirFoco(agora)
        startPhase(agora)
        agora = advance(agora, 5 * MINUTE)
      }
      concluirFoco(agora)

      assert.equal(getFocusState().phase, 'long-break')
      assert.equal(getFocusState().totalMs, 30 * MINUTE)
    })

    it('concluir antes da hora tambem respeita a cadencia', () => {
      let agora = T0
      for (let i = 1; i <= 3; i++) {
        agora = concluirFoco(agora)
        startPhase(agora)
        agora = advance(agora, 5 * MINUTE)
      }

      // Quarto ciclo encerrado pelo botao, nao pelo tempo.
      startPhase(agora)
      advance(agora, 2 * MINUTE)
      completePhaseNow()

      assert.equal(getFocusState().phase, 'long-break')
      assert.equal(getFocusState().totalMs, 15 * MINUTE)
    })

    it('depois da pausa longa, o foco volta ao normal', () => {
      let agora = T0
      for (let i = 1; i <= 4; i++) {
        agora = concluirFoco(agora)
        startPhase(agora)
        agora = advance(agora, getFocusState().totalMs)
      }

      assert.equal(getFocusState().phase, 'focus')
      assert.equal(getFocusState().totalMs, 25 * MINUTE)
    })
  })

  it('nao avanca enquanto a maquina dorme, e retoma de onde parou', () => {
    startPhase(T0)
    const at5 = advance(T0, 5 * MINUTE)

    suspendFocus(at5)
    // Oito horas de sono. Sem o congelamento, o alvo venceria e o app
    // acordaria disparando fase atras de fase.
    const afterSleep = at5 + 8 * 3600_000
    tickFocus(afterSleep)
    assert.equal(getFocusState().remainingMs, 20 * MINUTE)
    assert.equal(ciclos(), 0)

    resumeFocusFromSleep(afterSleep)
    advance(afterSleep, 60_000)
    assert.equal(getFocusState().remainingMs, 19 * MINUTE)
  })

  it('duracao alterada vale para a proxima fase, nao para a fase em curso', () => {
    startPhase(T0)
    const at1 = advance(T0, 1 * MINUTE)

    settings = { ...settings, focusMinutes: 50 }
    syncFocusSettings()
    assert.equal(getFocusState().totalMs, 25 * MINUTE, 'a fase em curso nao muda')

    // Foco conclui -> pausa preparada. Ela so corre depois de iniciada.
    const afterFocus = advance(at1, 24 * MINUTE)
    startPhase(afterFocus)
    advance(afterFocus, 5 * MINUTE)
    assert.equal(getFocusState().totalMs, 50 * MINUTE, 'a proxima fase de foco usa o novo valor')
  })

  it('duracao alterada com o cronometro parado atualiza o display na hora', () => {
    settings = { ...settings, focusMinutes: 45 }
    syncFocusSettings()
    assert.equal(getFocusState().remainingMs, 45 * MINUTE)
  })

  it('duracao alterada vale para a PAUSA preparada, nao so para o foco', () => {
    startPhase(T0)
    advance(T0, 25 * MINUTE)
    assert.equal(getFocusState().phase, 'break')

    settings = { ...settings, breakMinutes: 12 }
    syncFocusSettings()
    assert.equal(getFocusState().remainingMs, 12 * MINUTE)
  })

  it('ignora comandos invalidos para o estado corrente', () => {
    resumeFocus(T0)
    assert.equal(getFocusState().status, 'idle', 'retomar sem estar pausado nao faz nada')

    pauseFocus(T0)
    assert.equal(getFocusState().status, 'idle', 'pausar sem estar rodando nao faz nada')

    startPhase(T0)
    const at2 = advance(T0, 2 * MINUTE)
    startPhase(at2)
    assert.equal(getFocusState().remainingMs, 23 * MINUTE, 'iniciar duas vezes nao reinicia a fase')
  })
})
