import { useEffect, useState } from 'react'
import type { Snapshot } from '@shared/contract'

/**
 * Assina o estado do processo principal.
 *
 * O renderer não conta tempo: ele recebe o Snapshot inteiro a 1 Hz e desenha.
 * Toda a lógica de temporizador vive no main — se ficasse aqui, fechar a
 * janela pararia o cronômetro.
 */
export function useSnapshot(): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    let alive = true

    window.cadence.getSnapshot().then((initial) => {
      if (alive) setSnapshot(initial)
    })

    // O cancelamento devolvido pelo preload é obrigatório: sem ele, o
    // StrictMode monta duas vezes e os listeners acumulam.
    const unsubscribe = window.cadence.onSnapshot(setSnapshot)

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return snapshot
}

/**
 * Aplica a classe `.dark` a partir do valor já resolvido pelo main.
 * O renderer nunca decide o tema — nem por matchMedia, nem por localStorage.
 */
export function useThemeClass(darkMode: boolean | undefined): void {
  useEffect(() => {
    if (darkMode === undefined) return
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])
}
