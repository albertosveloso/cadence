import { useState } from 'react'
import { ChevronLeft, Minus, Plus } from 'lucide-react'
import {
  LONG_BREAK_EVERY,
  SETTINGS_RANGES,
  type NotificationSound,
  type Settings,
  type Snapshot,
  type ThemePreference
} from '@shared/contract'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'

interface SettingsViewProps {
  snapshot: Snapshot
  onBack: () => void
}

type NumericKey = keyof typeof SETTINGS_RANGES

function update(patch: Partial<Settings>): void {
  // Salva na hora. Um formulário de seis campos não precisa de botão
  // "Salvar" — esse passo só existiria para servir ao programador.
  void window.cadence.settings.update(patch)
}

/** Linha com rótulo à esquerda e passo −/valor/+ à direita. */
function StepperRow({
  label,
  hint,
  field,
  value,
  unit
}: {
  label: string
  hint?: string
  field: NumericKey
  value: number
  unit: string
}) {
  const range = SETTINGS_RANGES[field]

  /**
   * Rascunho local enquanto o campo está sendo digitado.
   *
   * Sem ele, um campo controlado pelo valor salvo brigaria com quem digita:
   * ao teclar "5" para chegar em "50", o valor seria salvo e limitado ao
   * mínimo antes do segundo dígito chegar. O rascunho só vira valor no blur
   * ou no Enter.
   */
  const [draft, setDraft] = useState<string | null>(null)

  const step = (delta: number) => {
    const next = Math.min(range.max, Math.max(range.min, value + delta * range.step))
    if (next !== value) update({ [field]: next } as Partial<Settings>)
  }

  const commit = () => {
    if (draft === null) return
    const parsed = Number.parseInt(draft, 10)
    setDraft(null)
    // Campo vazio ou ilegível: mantém o que já estava, sem reclamar.
    if (!Number.isFinite(parsed)) return
    const next = Math.min(range.max, Math.max(range.min, parsed))
    if (next !== value) update({ [field]: next } as Partial<Settings>)
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-foreground text-[14px] font-medium leading-tight">{label}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{hint}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => step(-1)}
          disabled={value <= range.min}
          aria-label={`Diminuir ${label}`}
          className="text-muted-foreground size-7 rounded-full"
        >
          <Minus />
        </Button>

        <input
          type="text"
          inputMode="numeric"
          aria-label={`${label}, em ${unit}`}
          value={draft ?? String(value).padStart(2, '0')}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            else if (event.key === 'Escape') {
              setDraft(null)
              event.currentTarget.blur()
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              step(1)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              step(-1)
            }
          }}
          className="tabular text-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-11 rounded-md border border-transparent bg-transparent text-center text-xl leading-none font-medium tracking-tight outline-none focus-visible:ring-2"
        />
        <span className="text-muted-foreground w-6 text-[11px]">{unit}</span>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => step(1)}
          disabled={value >= range.max}
          aria-label={`Aumentar ${label}`}
          className="text-muted-foreground size-7 rounded-full"
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-foreground text-[14px] font-medium leading-tight">{label}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  )
}

/** Controle segmentado: poucas opções mutuamente exclusivas, todas visíveis. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn('bg-muted flex gap-1 rounded-full p-1', disabled && 'pointer-events-none opacity-40')}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-full py-1.5 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' }
]

/** A ordem espelha NOTIFICATION_SOUNDS: o primeiro é o padrão. */
const SOUNDS: { value: NotificationSound; label: string }[] = [
  { value: 'windows', label: 'Windows' },
  { value: 'sino', label: 'Sino' },
  { value: 'suave', label: 'Suave' }
]

export function SettingsView({ snapshot, onBack }: SettingsViewProps) {
  const { settings } = snapshot

  return (
    <div className="flex h-full flex-col">
      {/*
        O título é centralizado por LAYOUT, com um espaçador do tamanho do
        botão — nunca por um elemento absoluto sobreposto. Isto já foi um bug:
        com `absolute inset-x-0`, o botão "voltar" parava de responder.

        Medido no renderer do Electron:

          header → drag      (esta faixa arrasta a janela)
          h1     → drag      (HERDADO do header)
          botão  → no-drag

        `-webkit-app-region` é herdado, e a região de arraste é resolvida por
        geometria e ordem de pintura — `pointer-events: none` não tem efeito
        sobre ela. Um título absoluto de largura total herdava `drag` e pintava
        depois do botão, sobrescrevendo a área `no-drag` dele: o clique virava
        arraste de janela em vez de acionar o botão.
      */}
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

        <h1 className="text-foreground flex-1 text-center text-[16px] font-medium">Configurações</h1>

        <span aria-hidden="true" className="size-7 shrink-0" />
      </header>

      <Tabs defaultValue="duracoes" className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2">
        <TabsList className="w-full rounded-full">
          <TabsTrigger value="duracoes" className="rounded-full text-[11px] font-medium tracking-[0.1em] uppercase">
            Durações
          </TabsTrigger>
          <TabsTrigger value="lembretes" className="rounded-full text-[11px] font-medium tracking-[0.1em] uppercase">
            Lembretes
          </TabsTrigger>
          <TabsTrigger value="geral" className="rounded-full text-[11px] font-medium tracking-[0.1em] uppercase">
            Geral
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-1">
          <TabsContent value="duracoes" className="divide-border/60 divide-y">
            <StepperRow
              label="Sessão de foco"
              field="focusMinutes"
              value={settings.focusMinutes}
              unit="min"
            />
            <StepperRow
              label="Pausa curta"
              field="breakMinutes"
              value={settings.breakMinutes}
              unit="min"
            />
            <StepperRow
              label="Pausa longa"
              hint={`A cada ${LONG_BREAK_EVERY} ciclos de foco concluídos no dia.`}
              field="longBreakMinutes"
              value={settings.longBreakMinutes}
              unit="min"
            />
            <p className="text-muted-foreground py-3 text-[11px] leading-relaxed">
              Os valores podem ser digitados ou ajustados pelos botões. A duração alterada vale
              a partir da próxima fase iniciada; pausar e retomar preserva o ciclo em andamento,
              e zerar descarta.
            </p>
          </TabsContent>

          <TabsContent value="lembretes" className="divide-border/60 divide-y">
            <StepperRow
              label="Água e movimento"
              hint="Roda sozinho, sem depender do ciclo de foco."
              field="waterIntervalMinutes"
              value={settings.waterIntervalMinutes}
              unit="min"
            />
            <StepperRow
              label="Suspender após inatividade"
              hint="Sem mouse nem teclado por este tempo, o lembrete espera."
              field="idleThresholdMinutes"
              value={settings.idleThresholdMinutes}
              unit="min"
            />
            <ToggleRow
              label="Som nas notificações"
              checked={settings.soundEnabled}
              onCheckedChange={(soundEnabled) => update({ soundEnabled })}
            />

            <div className="py-2.5">
              <p className="text-foreground mb-1 text-[14px] font-medium leading-tight">
                Som do aviso
              </p>
              <p className="text-muted-foreground mb-2 text-[11px] leading-snug">
                Toca ao escolher. &quot;Sino&quot; é o despertador de cozinha do pomodoro clássico.
              </p>
              <Segmented
                options={SOUNDS}
                value={settings.notificationSound}
                disabled={!settings.soundEnabled}
                onChange={(notificationSound) => {
                  update({ notificationSound })
                  // Ouvir é a única forma de escolher um som.
                  window.cadence.sound.preview(notificationSound)
                }}
              />
            </div>
            <p className="text-muted-foreground py-3 text-[11px] leading-relaxed">
              Se você ignorar o lembrete, ele repete uma única vez 10 minutos depois. Ignorado de
              novo, silencia até o próximo intervalo.
            </p>
          </TabsContent>

          <TabsContent value="geral">
            <div className="py-2.5">
              <p className="text-foreground mb-2 text-[14px] font-medium leading-tight">Tema</p>
              <Segmented
                options={THEMES}
                value={settings.theme}
                onChange={(theme) => update({ theme })}
              />
            </div>

            <Separator className="my-1" />

            <ToggleRow
              label="Iniciar com o Windows"
              hint="O app sobe direto para a bandeja, sem abrir janela."
              checked={settings.openAtLogin}
              onCheckedChange={(value) => void window.cadence.system.setOpenAtLogin(value)}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
