/**
 * Leitura do appId a partir de electron-builder.yml -- a fonte unica de
 * verdade -- e a trava que impede publicar com o valor provisorio.
 *
 * Executado como script (`node scripts/app-id.mjs`), falha com exit 1 se o
 * appId ainda nao foi decidido. Importado, expoe readAppId() para o
 * electron.vite.config.ts injetar o valor no processo principal.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'electron-builder.yml')
const PLACEHOLDER_PREFIX = 'pendente.'

export function readAppId() {
  const yml = readFileSync(CONFIG, 'utf8')
  // Ancorado no inicio da linha para nao casar com o texto dos comentarios.
  const match = yml.match(/^appId:[ \t]*(\S+)/m)
  if (!match) {
    throw new Error('appId nao encontrado em electron-builder.yml')
  }
  return match[1]
}

/**
 * Nome do desenvolvedor, para a tela "Sobre".
 *
 * Lido de `appx.publisherDisplayName` pelo mesmo motivo do appId: esse valor
 * tem de bater com o que o Partner Center registrou, e uma segunda constante
 * em outro arquivo diverge na primeira vez que alguem mexe em um dos dois.
 */
export function readDeveloper() {
  const yml = readFileSync(CONFIG, 'utf8')
  const match = yml.match(/^[ 	]*publisherDisplayName:[ 	]*['"]?(.+?)['"]?[ 	]*$/m)
  if (!match) {
    throw new Error('publisherDisplayName nao encontrado em electron-builder.yml')
  }
  return match[1]
}

export function isPlaceholder(appId) {
  return appId.startsWith(PLACEHOLDER_PREFIX)
}

// Modo trava: so quando executado diretamente, nao quando importado.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const appId = readAppId()

  if (isPlaceholder(appId)) {
    console.error(`
RELEASE BLOQUEADO -- o appId ainda e provisorio: "${appId}"

O guid do instalador NSIS deriva do appId e e a identidade de upgrade e
desinstalacao no Windows. Publicar com um valor provisorio e depois troca-lo
torna toda instalacao existente nao atualizavel.

Para liberar: defina o appId real em electron-builder.yml, em notacao
reverse-DNS de um dominio que voce controle. Exemplos de forma:

  appId: br.com.seudominio.cadence
  appId: com.seudominio.cadence

Nao ha nada mais a mudar: o processo principal le este mesmo valor.

Para gerar um instalador NAO assinado sem decidir isso agora, use:

  npm run dist
`)
    process.exit(1)
  }

  console.log(`appId: ${appId}`)
}
