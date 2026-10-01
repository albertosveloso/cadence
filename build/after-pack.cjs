'use strict'

const { rm, stat } = require('node:fs/promises')
const { join } = require('node:path')

/**
 * Remove do pacote arquivos do Chromium que o Cadence comprovadamente nao usa.
 *
 * POR QUE ISTO EXISTE
 *
 * O app.asar tem 364 kB. Todo o resto do instalador e runtime do Electron, e a
 * unica forma de encolher e nao empacotar o que nao se usa.
 *
 * A premissa que autoriza cada remocao abaixo: o Cadence chama
 * `app.disableHardwareAcceleration()` (src/main/index.ts) e nao ha, em nenhum
 * lugar do renderer, <canvas>, <audio>, <video>, WebGL ou WebGPU -- verificado
 * por busca. A interface e DOM e um <svg> com stroke-dashoffset, composta pelo
 * Skia em CPU. Nao existe pipeline de GPU nem decodificacao de midia para
 * esses arquivos servirem.
 *
 * Tamanhos medidos neste projeto com LZMA, que e o que o NSIS usa em
 * `compression: maximum` -- nao estimados:
 *
 *   dxcompiler.dll + dxil.dll   26,0 MB brutos -> 7,5 MB   compilador de
 *                               shaders DirectX (DXC), usado por D3D12/WebGPU
 *
 * O QUE NAO E REMOVIDO, E POR QUE
 *
 * Nao por precaucao: por teste. Estes tres FORAM removidos, o pacote foi
 * reconstruido e o app foi aberto com um perfil limpo sob CDP. O resultado, nas
 * duas tentativas, foi o renderer carregar o index.html e nunca pintar --
 * `Page.captureScreenshot` sem quadro e `Runtime.evaluate` em timeout. Janela
 * morta, sem erro no console. Devolvidos ao pacote:
 *
 *   vk_swiftshader.dll           1,6 MB  Vulkan por software. Como o app chama
 *                                `disableHardwareAcceleration()`, o SwiftShader
 *                                nao e o plano B: e o renderizador PRINCIPAL.
 *   d3dcompiler_47.dll           1,6 MB  compilador HLSL do ANGLE (D3D11).
 *   ffmpeg.dll                   1,0 MB  codecs de midia.
 *
 * O culpado exato entre d3dcompiler_47 e ffmpeg nao foi isolado, porque os 2,6
 * MB em disputa nao pagam mais um ciclo de build e teste. Quem quiser tentar:
 * remova UM de cada vez e repita o teste sob CDP -- o sintoma e silencioso e
 * nao aparece em `npm run dist`.
 *
 *   LICENSES.chromium.html      19,5 MB brutos -> 0,2 MB. Nao ha ganho, e as
 *                               licencas BSD/MIT do Chromium exigem distribuir
 *                               o texto.
 *   icudtl.dat, resources.pak   dados do proprio Chromium; so um build
 *                               customizado do Electron os reduz.
 *
 * SE ALGUM DIA A INTERFACE MUDAR
 *
 * Passar a usar <canvas>, WebGL, WebGPU, <audio> ou <video> -- ou remover o
 * `disableHardwareAcceleration()` -- invalida a premissa. Apague este hook
 * ANTES de investigar qualquer defeito de renderizacao ou de som.
 */

const REMOVER = ['dxcompiler.dll', 'dxil.dll']

exports.default = async function afterPack(context) {
  const { appOutDir } = context
  let total = 0

  for (const arquivo of REMOVER) {
    const caminho = join(appOutDir, arquivo)
    try {
      total += (await stat(caminho)).size
      await rm(caminho)
    } catch (erro) {
      // Um arquivo que o Electron deixou de enviar nao e motivo para quebrar o
      // build -- mas tambem nao pode sumir em silencio.
      if (erro.code !== 'ENOENT') throw erro
      console.warn(`[after-pack] ${arquivo} nao estava no pacote`)
    }
  }

  console.log(`[after-pack] ${(total / 1048576).toFixed(1)} MB brutos removidos do pacote`)
}
