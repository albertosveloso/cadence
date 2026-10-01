import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MonthHistory } from '@shared/contract'

/**
 * Historico de ciclos de foco por dia (secao 5.6).
 *
 * Este modulo e o DONO da contagem. Antes ela vivia no focus-timer e era
 * volatil; com o calendario, manter o numero em dois lugares -- um em memoria
 * e outro em disco -- seria criar duas verdades que divergem no primeiro bug.
 * O focus-timer agora so anuncia "um ciclo terminou"; quem conta e grava e
 * aqui.
 *
 * Mesma disciplina do store: diretorio por injecao, escrita atomica,
 * tolerancia a arquivo corrompido, e NENHUMA leitura de relogio -- `now` e
 * sempre parametro, para que o comportamento na virada do dia seja
 * verificavel sem esperar a meia-noite.
 */

const WRITE_DEBOUNCE_MS = 300

/** Ciclos por dia, com a chave em data local: '2026-09-28'. */
type Registro = Record<string, number>

let directory = ''
let cache: Registro | null = null
let pendingWrite: NodeJS.Timeout | null = null

export function configureHistory(userDataDir: string): void {
  directory = userDataDir
  cache = null
}

function file(): string {
  return join(directory, 'history.json')
}

/**
 * Data LOCAL, nao UTC. Quem conclui um ciclo as 22h de Brasilia registrou
 * naquele dia, e nao no seguinte.
 */
export function dateKey(ms: number): string {
  const d = new Date(ms)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Descarta o que nao for contagem valida, sem derrubar o resto do arquivo. */
function sanitize(raw: unknown): Registro {
  if (typeof raw !== 'object' || raw === null) return {}
  const entrada = raw as Record<string, unknown>
  const saida: Registro = {}

  for (const [chave, valor] of Object.entries(entrada)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chave)) continue
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) continue
    saida[chave] = Math.min(999, Math.round(valor))
  }
  return saida
}

function registro(): Registro {
  if (cache) return cache
  try {
    cache = sanitize(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    // Primeira execucao ou arquivo corrompido: comeca vazio, sem erro.
    cache = {}
  }
  return cache
}

/** Soma um ciclo concluido ao dia de `now` e devolve o total do dia. */
export function recordCycle(now: number): number {
  const dados = registro()
  const chave = dateKey(now)
  dados[chave] = (dados[chave] ?? 0) + 1

  if (pendingWrite) clearTimeout(pendingWrite)
  pendingWrite = setTimeout(flushHistory, WRITE_DEBOUNCE_MS)
  return dados[chave]
}

export function getDayCount(now: number): number {
  return registro()[dateKey(now)] ?? 0
}

/**
 * Um mes para o calendario. `month` e 1-12, como o usuario le -- nao o 0-11 do
 * Date, que e a origem classica de erro de um mes em telas de calendario.
 */
export function getMonth(year: number, month: number): MonthHistory {
  const dados = registro()
  const prefixo = `${year}-${String(month).padStart(2, '0')}-`
  const days: Record<string, number> = {}
  let total = 0

  for (const [chave, valor] of Object.entries(dados)) {
    if (!chave.startsWith(prefixo)) continue
    const dia = Number(chave.slice(prefixo.length))
    days[String(dia)] = valor
    total += valor
  }
  return { year, month, days, total }
}

/** Escrita atomica: grava num temporario e renomeia. */
export function flushHistory(): void {
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
