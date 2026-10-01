import { useEffect, useState } from 'react'
import { useSnapshot, useThemeClass } from '@renderer/hooks/use-snapshot'
import { CalendarView } from '@renderer/features/calendar-view'
import { SettingsView } from '@renderer/features/settings-view'
import { TimerView } from '@renderer/features/timer-view'

type View = 'timer' | 'settings' | 'calendar'

export function App() {
  const snapshot = useSnapshot()
  const [view, setView] = useState<View>('timer')

  useThemeClass(snapshot?.darkMode)

  // Esc volta ao cronômetro; no cronômetro, esconde na bandeja. Num app
  // residente, a saída tem de estar sempre a uma tecla de distância.
  // Ctrl+, abre as configurações — atalho padrão de preferências.
  // Espaço inicia, pausa e retoma o ciclo sem mirar no botão.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view === 'timer') window.cadence.window.hide()
        else setView('timer')
        return
      }
      if (event.key === ',' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        setView((current) => (current === 'settings' ? 'timer' : 'settings'))
        return
      }
      if (event.key === ' ' && view === 'timer') {
        event.preventDefault()
        const status = snapshot?.focus.status
        if (status === 'idle') void window.cadence.focus.start()
        else if (status === 'running') void window.cadence.focus.pause()
        else if (status === 'paused') void window.cadence.focus.resume()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, snapshot?.focus.status])

  // O card É a forma da janela: a BrowserWindow é transparente, então o
  // arredondamento e o fundo vivem aqui. Sem isto, cantos retos.
  const shell = 'bg-background border-app-edge h-full overflow-hidden rounded-[28px] border'

  // Primeiro frame antes do snapshot chegar: fundo sólido, sem esqueleto
  // piscando. A janela só é exibida depois de ready-to-show.
  if (!snapshot) return <div className={shell} />

  return (
    <div className={shell}>
      {view === 'timer' && (
        <TimerView
          snapshot={snapshot}
          onOpenSettings={() => setView('settings')}
          onOpenCalendar={() => setView('calendar')}
        />
      )}
      {view === 'settings' && <SettingsView snapshot={snapshot} onBack={() => setView('timer')} />}
      {view === 'calendar' && <CalendarView onBack={() => setView('timer')} />}
    </div>
  )
}
