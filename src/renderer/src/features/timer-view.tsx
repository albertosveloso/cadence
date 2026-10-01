import {
  Armchair,
  CalendarDays,
  Check,
  Coffee,
  Droplet,
  Eye,
  RotateCcw,
  Settings,
  X
} from 'lucide-react'
import type { Snapshot } from '@shared/contract'
import { Button } from '@renderer/components/ui/button'
import { CycleDots } from '@renderer/components/cycle-dots'
import { ProgressRing } from '@renderer/components/progress-ring'
import { formatClock, formatCycles, formatMinutesAway } from '@shared/format'
import { cn } from '@renderer/lib/utils'

interface TimerViewProps {
  snapshot: Snapshot
  onOpenSettings: () => void
  onOpenCalendar: () => void
}

const PHASE_LABEL: Record<Snapshot['focus']['phase'], string> = {
  focus: 'foco',
  break: 'pausa',
  'long-break': 'pausa longa'
}

const PHASE_ICON = {
  focus: Eye,
  break: Coffee,
  'long-break': Armchair
} as const

/** Em repouso o rótulo diz o que espera, não apenas que está parado. */
const IDLE_LABEL: Record<Snapshot['focus']['phase'], string> = {
  focus: 'pronto',
  break: 'pausa pronta',
  'long-break': 'pausa longa'
}

export function TimerView({ snapshot, onOpenSettings, onOpenCalendar }: TimerViewProps) {
  const { focus, water, cyclesToday } = snapshot
  const idle = focus.status === 'idle'
  const running = focus.status === 'running'

  const progress = focus.totalMs > 0 ? 1 - focus.remainingMs / focus.totalMs : 0
  const PhaseIcon = PHASE_ICON[focus.phase]
  const clock = formatClock(focus.remainingMs)

  /**
   * Estados que ganham o acento: o convite para começar a focar e o convite
   * para retomar o que foi interrompido. Os dois são "volte ao trabalho" —
   * a ação que a §3 do documento existe para tornar barata.
   */
  const convidaAoTrabalho = (idle && focus.phase === 'focus') || focus.status === 'paused'

  const waterPending = water.status === 'fired' || water.status === 'repeated'

  return (
    <div
      className="phase-glow relative flex h-full flex-col overflow-hidden"
      data-active={running ? 'true' : 'false'}
      style={{
        // O brilho do topo acompanha a fase, como na referência.
        ['--phase-glow-color' as string]:
          focus.phase === 'focus' ? 'var(--phase-focus)' : 'var(--phase-break)'
      }}
    >
      {/* Cabeçalho: o segundo relógio à esquerda, controles de app à direita.
          O rodapé fica só com os controles do ciclo. */}
      <header className="drag-region relative flex items-start justify-between px-5 pt-4">
        <button
          type="button"
          onClick={() => window.cadence.water.acknowledge()}
          title={waterPending ? 'Marcar como atendido' : 'Reiniciar o intervalo agora'}
          className={cn(
            'no-drag flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-medium transition-colors',
            'hover:bg-accent',
            waterPending ? 'text-phase-water' : 'text-muted-foreground'
          )}
        >
          <Droplet className={cn('size-3.5', waterPending && 'animate-pulse')} />
          <span>
            {water.status === 'suspended'
              ? 'Água: em espera'
              : waterPending
                ? 'Beba água e levante'
                : `Água ${formatMinutesAway(water.remainingMs)}`}
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenSettings}
            aria-label="Configurações"
            className="no-drag text-muted-foreground rounded-full opacity-60 transition-opacity hover:opacity-100"
          >
            <Settings />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.cadence.window.hide()}
            aria-label="Esconder na bandeja"
            className="no-drag text-muted-foreground rounded-full opacity-50 transition-opacity hover:opacity-100"
          >
            <X />
          </Button>
        </div>
      </header>

      <main className="drag-region flex flex-1 items-center justify-center">
        <ProgressRing
          progress={progress}
          variant={focus.phase === 'focus' ? 'focus' : 'break'}
          dimmed={idle}
        >
          <div className="flex flex-col items-center gap-2.5">
            <PhaseIcon className="text-muted-foreground size-4" />

            {/* Duracoes de tres digitos (ate 180 min) sao mais largas que o
                vao interno do anel; o corpo cede em vez de encostar nele. */}
            <span
              className={cn(
                'tabular text-foreground leading-none font-medium tracking-tight',
                clock.length > 5 ? 'text-[2.8rem]' : 'text-[3.4rem]'
              )}
            >
              {clock}
            </span>

            <CycleDots count={cyclesToday} variant={focus.phase === 'focus' ? 'focus' : 'break'} />

            <span className="text-muted-foreground text-center text-[11px] font-medium tracking-[0.18em] uppercase">
              {idle
                ? IDLE_LABEL[focus.phase]
                : focus.status === 'paused'
                  ? 'pausado'
                  : PHASE_LABEL[focus.phase]}
            </span>
          </div>
        </ProgressRing>
      </main>

      <footer className="flex flex-col items-center gap-3 px-5 pb-5">
        {/* Zerar e concluir são intenções opostas, e por isso ladeiam o botão
            principal: à esquerda "abandonei", à direita "terminei antes". */}
        <div className="flex w-full items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.cadence.focus.reset()}
            disabled={idle}
            aria-label="Zerar o ciclo"
            title="Zerar — descarta o progresso e não conta o ciclo"
            className="text-muted-foreground size-10 rounded-full"
          >
            <RotateCcw />
          </Button>

          <Button
            onClick={() => {
              if (idle) window.cadence.focus.start()
              else if (running) window.cadence.focus.pause()
              else window.cadence.focus.resume()
            }}
            className={cn(
              'h-11 rounded-full px-9 text-[12px] font-semibold tracking-[0.16em] uppercase',
              // Só "iniciar foco" e "retomar" recebem o acento. Pausar e
              // iniciar pausa mantêm a pílula neutra, para que o destaque
              // continue significando alguma coisa.
              convidaAoTrabalho &&
                'bg-phase-focus text-primary-foreground hover:bg-phase-focus/90'
            )}
          >
            {idle
              ? focus.phase === 'focus'
                ? 'iniciar foco'
                : 'iniciar pausa'
              : running
                ? 'pausar'
                : 'retomar'}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => window.cadence.focus.completeNow()}
            disabled={idle}
            aria-label={focus.phase === 'focus' ? 'Concluir o foco agora' : 'Encerrar a pausa agora'}
            title={
              focus.phase === 'focus'
                ? 'Concluir agora — conta o ciclo e vai para a pausa'
                : 'Encerrar a pausa agora e voltar ao foco'
            }
            className="text-muted-foreground size-10 rounded-full"
          >
            <Check />
          </Button>
        </div>

        {/* O contador é a porta de entrada do histórico: o número que você
            acompanha é o mesmo que abre o calendário. */}
        <button
          type="button"
          onClick={onOpenCalendar}
          aria-label="Ver o calendário de ciclos"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors"
        >
          <CalendarDays className="size-3.5" />
          {formatCycles(cyclesToday)}
        </button>
      </footer>
    </div>
  )
}
