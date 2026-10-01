import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MonthHistory } from '@shared/contract'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface CalendarViewProps {
  onBack: () => void
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
]

/** Domingo primeiro, como o calendário do Windows em pt-BR. */
const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Intensidade em degraus, não contínua. Num quadrado de 32 px a diferença
 * entre 60% e 70% de opacidade é invisível; o que se lê é "pouco, médio,
 * muito".
 */
function intensidade(ciclos: number): string {
  if (ciclos <= 0) return 'bg-track/50 text-muted-foreground'
  if (ciclos <= 2) return 'bg-phase-focus/25 text-foreground'
  if (ciclos <= 5) return 'bg-phase-focus/55 text-foreground'
  return 'bg-phase-focus text-primary-foreground'
}

export function CalendarView({ onBack }: CalendarViewProps) {
  const hoje = useMemo(() => new Date(), [])
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [dados, setDados] = useState<MonthHistory | null>(null)

  useEffect(() => {
    let vivo = true
    window.cadence.history.month(ano, mes).then((resultado) => {
      if (vivo) setDados(resultado)
    })
    return () => {
      vivo = false
    }
  }, [ano, mes])

  function navegar(delta: number): void {
    const proximo = new Date(ano, mes - 1 + delta, 1)
    setAno(proximo.getFullYear())
    setMes(proximo.getMonth() + 1)
  }

  // getDay() do dia 1 dá o deslocamento inicial; getDate() do "dia 0" do mês
  // seguinte dá quantos dias o mês tem, inclusive em fevereiro bissexto.
  const deslocamento = new Date(ano, mes - 1, 1).getDay()
  const diasNoMes = new Date(ano, mes, 0).getDate()

  const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1
  const diaDeHoje = hoje.getDate()

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex items-center gap-2 px-4 pt-4 pb-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Voltar para o cronômetro"
          className="no-drag text-muted-foreground size-7 shrink-0 rounded-full"
        >
          <ChevronLeft />
        </Button>
        <h1 className="text-foreground flex-1 text-center text-[16px] font-medium">Ciclos de foco</h1>
        <span aria-hidden="true" className="size-7 shrink-0" />
      </header>

      <div className="flex items-center justify-between px-4 pt-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navegar(-1)}
          aria-label="Mês anterior"
          className="text-muted-foreground size-7 rounded-full"
        >
          <ChevronLeft />
        </Button>

        <p className="text-foreground text-[13px] font-medium">
          {MESES[mes - 1]} {ano}
        </p>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navegar(1)}
          disabled={ehMesAtual}
          aria-label="Próximo mês"
          className="text-muted-foreground size-7 rounded-full"
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-4 pt-3">
        {DIAS_DA_SEMANA.map((dia, i) => (
          <span
            key={i}
            className="text-muted-foreground text-center text-[10px] font-medium tracking-wider uppercase"
          >
            {dia}
          </span>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 content-start gap-1 px-4 pt-1">
        {Array.from({ length: deslocamento }, (_, i) => (
          <span key={`vazio-${i}`} />
        ))}

        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = i + 1
          const ciclos = dados?.days[String(dia)] ?? 0
          const ehHoje = ehMesAtual && dia === diaDeHoje

          return (
            // O número do dia aparece SEMPRE. Trocá-lo pela contagem quando há
            // ciclos torna a célula ambígua — "4" viraria dia 4 ou 4 ciclos.
            // O dia orienta; a contagem e a intensidade informam.
            <div
              key={dia}
              title={`${dia} de ${MESES[mes - 1]}: ${ciclos} ${ciclos === 1 ? 'ciclo' : 'ciclos'}`}
              className={cn(
                'tabular flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg transition-colors',
                intensidade(ciclos),
                ehHoje && 'ring-foreground/70 ring-2'
              )}
            >
              <span className={cn('text-[10px] leading-none', ciclos > 0 && 'opacity-75')}>
                {dia}
              </span>
              {ciclos > 0 && (
                <span className="text-[13px] leading-none font-semibold">{ciclos}</span>
              )}
            </div>
          )
        })}
      </div>

      <footer className="px-4 pt-2 pb-5">
        <p className="text-muted-foreground text-center text-[11px]">
          {dados
            ? dados.total === 0
              ? 'Nenhum ciclo neste mês'
              : `${dados.total} ${dados.total === 1 ? 'ciclo' : 'ciclos'} em ${MESES[mes - 1].toLowerCase()}`
            : ' '}
        </p>
      </footer>
    </div>
  )
}
