import { Notification } from 'electron'
import type { FocusPhase } from '@shared/contract'
import { getSettings } from './store'
import { playNotificationSound } from './sound'

/**
 * Notificacao sonora e visual na troca de fase (secao 6.1).
 *
 * O toast e criado SEMPRE com `silent: true` e o som sai de ./sound -- ver
 * naquele arquivo por que nao da para confiar no som implicito do toast.
 * Isso mantem "Som nas notificacoes" com um significado unico, impede tocar
 * duas vezes onde o toast funcionaria, e e o que torna possivel ESCOLHER o
 * som: a escolha nao existiria se quem tocasse fosse o Windows.
 */

function tocarSeLigado(): void {
  const settings = getSettings()
  if (settings.soundEnabled) playNotificationSound(settings.notificationSound)
}

function avisar(options: { title: string; body: string }): Notification | null {
  // Mesmo sem suporte a toast, o som cumpre o papel de marcar a troca.
  tocarSeLigado()
  if (!Notification.isSupported()) return null

  const notification = new Notification({ ...options, silent: true })
  notification.show()
  return notification
}

/**
 * Chamado apenas quando uma fase CONCLUI sozinha -- nunca quando o usuario
 * inicia um ciclo. A mensagem diz o que terminou e o que comeca, porque esse
 * e o unico momento em que o estado muda sem ele pedir.
 */
export function notifyPhaseCompleted(
  finished: FocusPhase,
  next: FocusPhase,
  nextDurationMs: number
): void {
  const minutes = Math.round(nextDurationMs / 60_000)

  if (finished !== 'focus') {
    avisar({
      title: 'Pausa encerrada',
      body: `${minutes} min de foco esperando você.`
    })
    return
  }

  // Nenhuma fase comeca sozinha, entao a mensagem convida em vez de anunciar.
  avisar({
    title: next === 'long-break' ? 'Foco concluído — pausa longa' : 'Foco concluído',
    body:
      next === 'long-break'
        ? `${minutes} min de pausa longa esperando você. Saia da cadeira.`
        : `${minutes} min de pausa esperando você. Levante, se puder.`
  })
}

export function notifyWater(repeat: boolean, onAcknowledge: () => void): void {
  const notification = avisar({
    title: repeat ? 'Água e movimento — lembrete' : 'Água e movimento',
    body: repeat
      ? 'Segundo aviso. Depois deste, o app silencia até o próximo intervalo.'
      : 'Beba água e levante por um minuto.'
  })

  // Clicar no toast conta como reconhecimento e reinicia o intervalo.
  notification?.on('click', onAcknowledge)
}
