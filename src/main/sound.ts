import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { NotificationSound } from '@shared/contract'

/**
 * Som de aviso na troca de fase e no lembrete (secao 6.1).
 *
 * POR QUE NAO DEIXAR O TOAST DO WINDOWS TOCAR
 *
 * Um Notification com `silent: false` deveria usar o som padrao do sistema.
 * Medido nesta maquina: o Windows registrou dezenas de notificacoes entregues
 * para o app, o AppUserModelID do processo confere com o do atalho instalado,
 * nao ha supressao por app, e o esquema de som tem
 * "Windows Notify System Generic.wav" atribuido -- e ainda assim nao saiu som.
 *
 * Como nao da para depender disso, o app toca o som ele mesmo e mantem o
 * toast SEMPRE silencioso. Isso tambem e o que torna possivel ESCOLHER o som:
 * a escolha nao existiria se quem tocasse fosse o Windows.
 */

/** Som de notificacao do proprio Windows: o padrao, e nada a empacotar. */
function caminhoDoWindows(): string | null {
  const base = process.env['WINDIR'] ?? 'C:\\Windows'
  const caminho = join(base, 'Media', 'Windows Notify System Generic.wav')
  return existsSync(caminho) ? caminho : null
}

/** Sons sintetizados, copiados para resources/ no empacotamento. */
function caminhoEmpacotado(arquivo: string): string | null {
  const caminho = app.isPackaged
    ? join(process.resourcesPath, arquivo)
    : join(__dirname, '../../resources', arquivo)
  return existsSync(caminho) ? caminho : null
}

function resolver(sound: NotificationSound): string | null {
  switch (sound) {
    case 'sino':
      return caminhoEmpacotado('sino.wav')
    case 'suave':
      return caminhoEmpacotado('suave.wav')
    default:
      return caminhoDoWindows()
  }
}

/**
 * Toca o som escolhido. Se o arquivo nao existir ou o player falhar, cai para
 * o beep do sistema -- um aviso pobre e melhor que nenhum aviso.
 */
export function playNotificationSound(sound: NotificationSound): void {
  const wav = resolver(sound) ?? caminhoDoWindows()
  if (!wav) {
    shell.beep()
    return
  }

  // Aspas simples no PowerShell nao interpolam; dobrar a aspa e o escape.
  const literal = `'${wav.replace(/'/g, "''")}'`

  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(New-Object Media.SoundPlayer ${literal}).PlaySync()`
    ],
    { windowsHide: true },
    (error) => {
      // PlaySync bloqueia o processo filho, nao o nosso.
      if (error) shell.beep()
    }
  )
}
