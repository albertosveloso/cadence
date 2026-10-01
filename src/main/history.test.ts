import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  configureHistory,
  dateKey,
  flushHistory,
  getDayCount,
  getMonth,
  recordCycle
} from './history'

/**
 * Verificação da seção 5.6.
 *
 * O histórico é o que alimenta o calendário, e um calendário errado é pior
 * que nenhum: ele mente sobre um esforço que a pessoa fez. Os pontos caros de
 * conferir à mão são a virada do dia e a fronteira do mês — aqui o relógio é
 * parâmetro, então ambos custam uma linha.
 */

/** 28/09/2026, 14h local. */
const T0 = new Date(2026, 8, 28, 14, 0, 0).getTime()

let dir = ''

describe('historico de ciclos (secao 5.6)', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cadence-hist-'))
    configureHistory(dir)
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('comeca vazio', () => {
    assert.equal(getDayCount(T0), 0)
    assert.deepEqual(getMonth(2026, 9).days, {})
    assert.equal(getMonth(2026, 9).total, 0)
  })

  it('soma ciclos no dia corrente', () => {
    recordCycle(T0)
    recordCycle(T0)
    recordCycle(T0)
    assert.equal(getDayCount(T0), 3)
  })

  it('usa a data LOCAL, nao UTC', () => {
    // 22h em fuso negativo ja seria o dia seguinte em UTC. O ciclo pertence
    // ao dia que a pessoa viveu, nao ao do meridiano de Greenwich.
    const noite = new Date(2026, 8, 28, 22, 30, 0).getTime()
    assert.equal(dateKey(noite), '2026-09-28')
  })

  it('separa os dias na virada da meia-noite', () => {
    recordCycle(T0)
    const amanha = new Date(2026, 8, 29, 9, 0, 0).getTime()
    recordCycle(amanha)
    recordCycle(amanha)

    assert.equal(getDayCount(T0), 1)
    assert.equal(getDayCount(amanha), 2)
  })

  it('monta o mes com o dia como chave e o total somado', () => {
    recordCycle(new Date(2026, 8, 1, 10, 0, 0).getTime())
    recordCycle(new Date(2026, 8, 1, 11, 0, 0).getTime())
    recordCycle(new Date(2026, 8, 15, 10, 0, 0).getTime())
    recordCycle(new Date(2026, 8, 30, 10, 0, 0).getTime())

    const mes = getMonth(2026, 9)
    assert.deepEqual(mes.days, { '1': 2, '15': 1, '30': 1 })
    assert.equal(mes.total, 4)
  })

  it('nao mistura meses nem anos vizinhos', () => {
    recordCycle(new Date(2026, 7, 31, 10, 0, 0).getTime()) // agosto
    recordCycle(new Date(2026, 8, 1, 10, 0, 0).getTime()) // setembro
    recordCycle(new Date(2026, 9, 1, 10, 0, 0).getTime()) // outubro
    recordCycle(new Date(2025, 8, 15, 10, 0, 0).getTime()) // setembro do ano anterior

    assert.equal(getMonth(2026, 9).total, 1)
    assert.equal(getMonth(2026, 8).total, 1)
    assert.equal(getMonth(2026, 10).total, 1)
    assert.equal(getMonth(2025, 9).total, 1)
  })

  it('o mes e 1-12, nao o 0-11 do Date', () => {
    // Um erro de um mes aqui e invisivel em teste manual e obvio no uso.
    recordCycle(new Date(2026, 0, 5, 10, 0, 0).getTime()) // janeiro
    assert.equal(getMonth(2026, 1).total, 1, 'janeiro e 1')
    assert.equal(getMonth(2026, 0).total, 0)
  })

  it('sobrevive ao ciclo de gravar, reiniciar e ler', () => {
    recordCycle(T0)
    recordCycle(T0)
    flushHistory()

    configureHistory(dir) // simula a proxima execucao
    assert.equal(getDayCount(T0), 2)
  })

  it('grava sozinho pelo debounce, sem depender de encerramento gracioso', async () => {
    recordCycle(T0)
    await new Promise((resolve) => setTimeout(resolve, 450))

    const disco = JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8'))
    assert.equal(disco['2026-09-28'], 1)
  })

  it('nao deixa arquivo temporario para tras', () => {
    recordCycle(T0)
    flushHistory()
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [])
  })

  it('nao derruba o app com arquivo corrompido', () => {
    writeFileSync(join(dir, 'history.json'), '{ isto nao e json', 'utf8')
    configureHistory(dir)
    assert.equal(getDayCount(T0), 0)
    recordCycle(T0)
    assert.equal(getDayCount(T0), 1)
  })

  it('descarta entradas invalidas e preserva as validas', () => {
    writeFileSync(
      join(dir, 'history.json'),
      JSON.stringify({
        '2026-09-28': 4,
        '2026-09-27': -2, // negativo
        '28/09/2026': 3, // formato errado
        ontem: 5, // nao e data
        '2026-09-26': 'tres' // nao e numero
      }),
      'utf8'
    )
    configureHistory(dir)

    const mes = getMonth(2026, 9)
    assert.deepEqual(mes.days, { '28': 4 }, 'so a entrada valida sobrevive')
  })
})
