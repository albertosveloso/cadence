/**
 * Gera os ativos visuais do pacote MSIX em build/appx/.
 *
 * Sem estes arquivos o electron-builder embute os logotipos de EXEMPLO que
 * acompanham a ferramenta (`SampleAppx.*.png`) -- o pacote compila, instala e
 * fica com a arte de outro app no Menu Iniciar. E uma falha silenciosa, como
 * quase tudo em MSIX: nada reclama.
 *
 * O desenho e o mesmo do icone do app, importado de generate-icons.mjs para
 * que ninguem precise manter duas versoes da mesma marca. A diferenca e a
 * moldura: aqui o fundo preenche o tile inteiro, porque quem arredonda os
 * cantos de um tile e o proprio Windows.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD, TRACK_ON_DARK, drawRing, encodePng } from './generate-icons.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const saida = resolve(root, 'build/appx')

/** Fracao da menor dimensao do tile ocupada pelo anel. */
const PROPORCAO_DO_ANEL = 0.78

/** Tela retangular preenchida com a cor de fundo do app. */
function telaSolida(largura, altura, cor) {
  const px = Buffer.alloc(largura * altura * 4)
  for (let i = 0; i < largura * altura; i++) {
    px[i * 4] = cor[0]
    px[i * 4 + 1] = cor[1]
    px[i * 4 + 2] = cor[2]
    px[i * 4 + 3] = 255
  }
  return px
}

/** Source-over de um bloco quadrado RGBA centrado na tela. */
function compor(tela, larguraTela, alturaTela, bloco, ladoBloco) {
  const dx = Math.round((larguraTela - ladoBloco) / 2)
  const dy = Math.round((alturaTela - ladoBloco) / 2)

  for (let y = 0; y < ladoBloco; y++) {
    const ty = dy + y
    if (ty < 0 || ty >= alturaTela) continue
    for (let x = 0; x < ladoBloco; x++) {
      const tx = dx + x
      if (tx < 0 || tx >= larguraTela) continue

      const o = (y * ladoBloco + x) * 4
      const a = bloco[o + 3] / 255
      if (a === 0) continue

      const d = (ty * larguraTela + tx) * 4
      for (let c = 0; c < 3; c++) {
        tela[d + c] = Math.round(bloco[o + c] * a + tela[d + c] * (1 - a))
      }
      tela[d + 3] = 255
    }
  }
  return tela
}

function tile(largura, altura) {
  // Anel sem fundo proprio: o fundo e o tile inteiro, nao um card dentro dele.
  const lado = Math.round(Math.min(largura, altura) * PROPORCAO_DO_ANEL)
  const anel = drawRing({
    size: lado,
    sweep: 0.72,
    track: TRACK_ON_DARK,
    // Tiles pequenos precisam de traco proporcionalmente mais grosso para o
    // anel nao sumir na reducao.
    ringWidth: lado <= 50 ? 0.1 : 0.072,
    radiusRatio: 0.34,
    background: null
  })
  return compor(telaSolida(largura, altura, CARD), largura, altura, anel, lado)
}

const ATIVOS = [
  ['StoreLogo.png', 50, 50],
  ['Square44x44Logo.png', 44, 44],
  ['Square150x150Logo.png', 150, 150],
  ['Wide310x150Logo.png', 310, 150],
  ['SplashScreen.png', 620, 300]
]

mkdirSync(saida, { recursive: true })

console.log('ativos do pacote MSIX em build/appx/:')
for (const [nome, largura, altura] of ATIVOS) {
  writeFileSync(resolve(saida, nome), encodePng(tile(largura, altura), largura, altura))
  console.log(`  ${nome.padEnd(24)} ${largura}x${altura}`)
}
