/**
 * Como este processo foi empacotado.
 *
 * O Cadence sai em dois formatos, e eles NAO sao equivalentes do ponto de
 * vista do sistema operacional:
 *
 *   NSIS (.exe)   instalacao normal por usuario. Escreve no registro de
 *                 verdade, recebe argumentos de linha de comando, roda solto.
 *   MSIX (.appx)  instalacao empacotada, exigida pela Microsoft Store. O
 *                 registro e VIRTUALIZADO: uma gravacao em
 *                 HKCU\...\Run vai para um hive privado do pacote que o
 *                 Windows nao le no logon. A chave seria gravada, a releitura
 *                 confirmaria, e o app simplesmente nao subiria no boot.
 *
 * Esse e o motivo de este modulo existir: a diferenca e silenciosa. Nada
 * falha, nada registra erro, e o defeito so aparece no dia seguinte, na
 * maquina do usuario.
 *
 * `process.windowsStore` e definido pelo proprio Electron quando o processo
 * roda a partir de um pacote AppX/MSIX, e fica `undefined` fora disso.
 */

/** true somente quando este processo roda a partir de um pacote MSIX/AppX. */
export function isMsixPackaged(): boolean {
  return process.windowsStore === true
}
