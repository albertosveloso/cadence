import { execFile } from 'node:child_process'

/**
 * Inicializacao automatica com o Windows (secao 5.4), escrevendo direto na
 * chave Run do usuario.
 *
 * POR QUE NAO app.setLoginItemSettings()
 *
 * Nao e por ela nao gravar -- ela grava. O motivo e que a leitura companheira
 * nao permite confirmar nada quando se usa `args`.
 *
 * Medido neste projeto, num caso em que a chave comprovadamente continha
 * `"<execPath>" --hidden`, app.getLoginItemSettings() devolveu:
 *
 *   { launchItems: [{ ..., args: [] }],
 *     executableWillLaunchAtLogin: true,
 *     openAtLogin: false }
 *
 * Ou seja: `args` volta vazio mesmo com o argumento gravado, e por isso
 * `openAtLogin` sai `false` mesmo com a inicializacao ativa -- a API compara
 * os argumentos pedidos com os que acredita ter lido. Verificar por ali
 * produziria falso negativo justamente no caminho feliz.
 *
 * A chave e um REG_SZ no perfil do usuario. Escreve-la com `reg.exe` e
 * releu-la para conferir mantem o resultado verificavel, sem dependencia nova
 * e sem privilegio elevado -- o que sustenta o switch da interface poder
 * dizer a verdade sobre o estado do sistema.
 */

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

/** `reg.exe` sempre existe no Windows; execFile evita passar pelo shell. */
function reg(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (error, stdout) => {
      resolve({ ok: !error, stdout: stdout ?? '' })
    })
  })
}

export interface AutostartTarget {
  /** Nome do valor na chave Run. Usamos o appId, como o Electron faria. */
  name: string
  /** Executavel a lancar. */
  execPath: string
  /** Argumentos; `--hidden` faz o app subir direto para a bandeja. */
  args: string[]
}

function commandLine(target: AutostartTarget): string {
  return [`"${target.execPath}"`, ...target.args].join(' ')
}

/** Le a chave de verdade, em vez de acreditar no que a gravacao respondeu. */
export async function readAutostart(name: string): Promise<string | null> {
  const { ok, stdout } = await reg(['query', RUN_KEY, '/v', name])
  if (!ok) return null

  // Saida: "    <nome>    REG_SZ    <valor>"
  const match = stdout.match(/REG_SZ\s+(.+?)\s*$/m)
  return match ? match[1] : null
}

/**
 * Liga ou desliga a inicializacao automatica e CONFIRMA lendo de volta.
 * Devolve true so quando o estado no registro corresponde ao pedido.
 */
export async function setAutostart(enabled: boolean, target: AutostartTarget): Promise<boolean> {
  if (enabled) {
    await reg(['add', RUN_KEY, '/v', target.name, '/t', 'REG_SZ', '/d', commandLine(target), '/f'])
    return (await readAutostart(target.name)) === commandLine(target)
  }

  await reg(['delete', RUN_KEY, '/v', target.name, '/f'])
  return (await readAutostart(target.name)) === null
}
