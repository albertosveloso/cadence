import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DEFAULT_SETTINGS } from '@shared/contract'
import { configureStore, flushSettings, getSettings, updateSettings } from './store'

/**
 * Verificação da seção 5.5.
 *
 * O documento prevê editar o settings.json à mão como plano B para a tela de
 * configurações. Isso torna a leitura tolerante um requisito, não um luxo: um
 * arquivo com valor absurdo ou tipo errado não pode deixar o app num estado
 * inválido nem derrubá-lo.
 */

let dir = ''

function write(contents: string): void {
  writeFileSync(join(dir, 'settings.json'), contents, 'utf8')
}

describe('persistencia de configuracao (secao 5.5)', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cadence-store-'))
    configureStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('usa os defaults na primeira execucao, sem arquivo', () => {
    assert.deepEqual(getSettings(), DEFAULT_SETTINGS)
  })

  it('le os valores gravados', () => {
    write(JSON.stringify({ focusMinutes: 50, breakMinutes: 10, theme: 'dark' }))
    const settings = getSettings()
    assert.equal(settings.focusMinutes, 50)
    assert.equal(settings.breakMinutes, 10)
    assert.equal(settings.theme, 'dark')
  })

  it('nao derruba o app com JSON corrompido', () => {
    write('{ isto nao e json')
    assert.deepEqual(getSettings(), DEFAULT_SETTINGS)
  })

  it('nao derruba o app com JSON valido mas do tipo errado', () => {
    write('"uma string"')
    assert.deepEqual(getSettings(), DEFAULT_SETTINGS)
  })

  it('limita valores acima e abaixo da faixa', () => {
    write(
      JSON.stringify({
        focusMinutes: 9999,
        breakMinutes: 0,
        waterIntervalMinutes: -30,
        idleThresholdMinutes: 10_000
      })
    )
    const settings = getSettings()
    assert.equal(settings.focusMinutes, 180, 'maximo de foco')
    assert.equal(settings.breakMinutes, 1, 'minimo de pausa')
    assert.equal(settings.waterIntervalMinutes, 10, 'minimo de intervalo')
    assert.equal(settings.idleThresholdMinutes, 60, 'maximo de ociosidade')
  })

  it('limita a pausa longa a sua propria faixa', () => {
    write(JSON.stringify({ longBreakMinutes: 999 }))
    configureStore(dir)
    assert.equal(getSettings().longBreakMinutes, 120, 'maximo')

    write(JSON.stringify({ longBreakMinutes: 0 }))
    configureStore(dir)
    assert.equal(getSettings().longBreakMinutes, 1, 'minimo')

    write(JSON.stringify({ longBreakMinutes: 'quinze' }))
    configureStore(dir)
    assert.equal(getSettings().longBreakMinutes, 15, 'default')
  })

  it('cai no default quando o tipo do campo esta errado', () => {
    write(
      JSON.stringify({
        focusMinutes: 'vinte e cinco',
        openAtLogin: 'sim',
        theme: 'roxo',
        soundEnabled: null
      })
    )
    const settings = getSettings()
    assert.equal(settings.focusMinutes, DEFAULT_SETTINGS.focusMinutes)
    assert.equal(settings.openAtLogin, DEFAULT_SETTINGS.openAtLogin)
    assert.equal(settings.theme, DEFAULT_SETTINGS.theme, 'tema invalido volta para system')
    assert.equal(settings.soundEnabled, DEFAULT_SETTINGS.soundEnabled)
  })

  it('usa o som do Windows como padrao', () => {
    assert.equal(getSettings().notificationSound, 'windows')
  })

  it('aceita os sons validos e recusa o resto', () => {
    for (const som of ['windows', 'sino', 'suave']) {
      write(JSON.stringify({ notificationSound: som }))
      configureStore(dir)
      assert.equal(getSettings().notificationSound, som)
    }

    // Um som que nao existe mais (ou nunca existiu) nao pode deixar o app
    // tentando tocar um arquivo ausente a cada ciclo.
    write(JSON.stringify({ notificationSound: 'trombone' }))
    configureStore(dir)
    assert.equal(getSettings().notificationSound, 'windows')
  })

  it('arredonda valores fracionarios', () => {
    write(JSON.stringify({ focusMinutes: 25.7 }))
    assert.equal(getSettings().focusMinutes, 26)
  })

  it('grava as alteracoes em disco', () => {
    updateSettings({ focusMinutes: 40, theme: 'light' })
    flushSettings()

    const onDisk = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    assert.equal(onDisk.focusMinutes, 40)
    assert.equal(onDisk.theme, 'light')
    // O objeto gravado e completo, nao um patch.
    assert.deepEqual(Object.keys(onDisk).sort(), Object.keys(DEFAULT_SETTINGS).sort())
  })

  it('sobrevive ao ciclo de gravar, reiniciar e ler', () => {
    updateSettings({ waterIntervalMinutes: 35, soundEnabled: false })
    flushSettings()

    // Simula a proxima execucao: novo configureStore limpa o cache.
    configureStore(dir)
    const settings = getSettings()
    assert.equal(settings.waterIntervalMinutes, 35)
    assert.equal(settings.soundEnabled, false)
  })

  it('nao deixa arquivo temporario para tras', () => {
    updateSettings({ focusMinutes: 30 })
    flushSettings()
    const leftovers = readdirSync(dir).filter((name) => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [], 'a escrita atomica renomeia, nao acumula .tmp')
  })

  it('grava sozinho pelo debounce, sem depender de encerramento gracioso', async () => {
    // Importa: um app de bandeja pode ser encerrado pelo Gerenciador de
    // Tarefas, e nesse caminho 'before-quit' nao roda. Se a persistencia
    // dependesse do flush de saida, a configuracao do usuario se perderia.
    updateSettings({ breakMinutes: 12 })
    assert.equal(existsSync(join(dir, 'settings.json')), false, 'ainda nao, o debounce e de 300 ms')

    await new Promise((resolve) => setTimeout(resolve, 450))

    const onDisk = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    assert.equal(onDisk.breakMinutes, 12)
  })

  it('limita tambem o que vem da interface, nao so o que vem do disco', () => {
    // A UI usa steppers com limites, mas o handler de IPC aceita qualquer
    // objeto: o clamp tem de valer para os dois caminhos.
    updateSettings({ focusMinutes: 500 })
    assert.equal(getSettings().focusMinutes, 180)
  })
})
