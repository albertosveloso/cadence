/**
 * Analise do limiar de ociosidade (secao 5.3): simula ausencias e mostra
 * quando o lembrete dispara. Instrumento de decisao, nao teste.
 */
import {
  getWaterState,
  onWaterEvent,
  setWaterSettingsProvider,
  startWaterTimer,
  tickWater
} from '../src/main/water-timer.ts'

const MIN = 60_000
const T0 = new Date(2026, 8, 29, 9, 0, 0).getTime()

function simular(nome: string, limiar: number, ausenciaInicio: number, ausenciaFim: number) {
  setWaterSettingsProvider(() => ({ waterIntervalMinutes: 55, idleThresholdMinutes: limiar }))
  const disparos: string[] = []
  const off = onWaterEvent((e) => disparos.push(`${e.repeat ? 'repete' : 'dispara'}`))
  startWaterTimer(T0)

  const eventos: string[] = []
  let congeladoEm: number | null = null

  for (let m = 0; m <= 240; m++) {
    const now = T0 + m * MIN
    const ausente = m >= ausenciaInicio && m < ausenciaFim
    const idleSeg = ausente ? (m - ausenciaInicio) * 60 : 0

    const antes = disparos.length
    const statusAntes = getWaterState().status
    tickWater(now, idleSeg)
    const statusDepois = getWaterState().status

    if (disparos.length > antes) {
      eventos.push(`  min ${String(m).padStart(3)}  ${disparos[disparos.length - 1]}${ausente ? '  <-- CADEIRA VAZIA' : ''}`)
    }
    if (statusAntes !== 'suspended' && statusDepois === 'suspended') {
      congeladoEm = m
      eventos.push(`  min ${String(m).padStart(3)}  congela (${m - ausenciaInicio} min de ausencia consumiram o intervalo)`)
    }
    if (statusAntes === 'suspended' && statusDepois !== 'suspended') {
      eventos.push(`  min ${String(m).padStart(3)}  volta; faltam ${Math.round(getWaterState().remainingMs / MIN)} min para o lembrete`)
    }
  }
  off()

  console.log(`\n=== ${nome} (limiar ${limiar} min) ===`)
  console.log(`  ausente do minuto ${ausenciaInicio} ao ${ausenciaFim} (${ausenciaFim - ausenciaInicio} min)`)
  eventos.forEach((e) => console.log(e))
  if (congeladoEm === null) console.log('  nunca congelou')
}

// Ausencia longa que atravessa o disparo -- o caso que mais expoe o limiar.
simular('Almoco de 70 min', 40, 65, 135)
simular('Almoco de 70 min', 10, 65, 135)

// Ausencia curta: tempo fora contando como tempo sentado.
simular('Caminhada de 30 min', 40, 20, 50)
simular('Caminhada de 30 min', 10, 20, 50)
