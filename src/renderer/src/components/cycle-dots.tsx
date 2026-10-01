import { cn } from '@renderer/lib/utils'

const SLOTS = 8

interface CycleDotsProps {
  /** Ciclos concluídos hoje. Acima de SLOTS, os traços ficam todos preenchidos. */
  count: number
  variant: 'focus' | 'break'
}

/**
 * Retorno visual imediato dos ciclos do dia (seção 6.1). O número exato fica
 * no menu da bandeja e no rodapé; aqui o que importa é enxergar o acúmulo de
 * relance, sem ler.
 */
export function CycleDots({ count, variant }: CycleDotsProps) {
  const filled = Math.min(SLOTS, Math.max(0, count))

  return (
    <div
      className="flex items-center gap-[3px]"
      role="img"
      aria-label={`${count} ciclos concluídos hoje`}
    >
      {Array.from({ length: SLOTS }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-[7px] w-[3px] rounded-full transition-colors duration-500',
            index < filled
              ? variant === 'focus'
                ? 'bg-phase-focus'
                : 'bg-phase-break'
              : 'bg-track'
          )}
        />
      ))}
    </div>
  )
}
