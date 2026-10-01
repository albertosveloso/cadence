import { useEffect, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'

const SIZE = 226
const STROKE = 5
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface ProgressRingProps {
  /** Fração decorrida da fase, de 0 a 1. */
  progress: number
  /** Foco usa a rampa vermelho -> âmbar; pausa usa o âmbar sólido. */
  variant: 'focus' | 'break'
  /** Anel apagado quando o cronômetro está parado. */
  dimmed?: boolean
  children: React.ReactNode
}

/**
 * Anel de progresso em SVG puro.
 *
 * Sem biblioteca de animação: `stroke-dashoffset` mais uma transição de CSS
 * cobrem o caso inteiro. A transição é desligada quando o progresso recua
 * (zerar, ou troca de fase), senão o arco desenharia 1 s de volta ao contrário.
 */
export function ProgressRing({ progress, variant, dimmed = false, children }: ProgressRingProps) {
  const previous = useRef(progress)
  const [animate, setAnimate] = useState(true)

  useEffect(() => {
    const wentBackwards = progress < previous.current - 0.001
    previous.current = progress
    if (!wentBackwards) return

    setAnimate(false)
    // Reativa na animation frame seguinte, depois que o salto já foi pintado.
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [progress])

  const clamped = Math.min(1, Math.max(0, progress))

  return (
    <div className="relative grid place-items-center" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cadence-focus-ramp" x1="0.78" y1="0" x2="0.06" y2="0.92">
            <stop offset="0%" stopColor="var(--phase-focus)" />
            <stop offset="100%" stopColor="var(--phase-focus-tail)" />
          </linearGradient>
        </defs>

        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--track)"
          strokeWidth={STROKE}
        />

        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={
            variant === 'focus' ? 'url(#cadence-focus-ramp)' : 'var(--phase-break)'
          }
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          className={cn(
            'transition-opacity duration-500',
            animate && 'transition-[stroke-dashoffset,opacity] duration-1000 ease-linear',
            dimmed && 'opacity-0'
          )}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
