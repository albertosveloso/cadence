/**
 * Gera as duas artes da listagem da Microsoft Store em store/.
 *
 *   logo-300x300.png     Icone de bloco do aplicativo 1:1. A documentacao o
 *                        marca como "altamente recomendavel" para aplicativos,
 *                        e diz que a Store o prioriza sobre o icone embutido no
 *                        pacote. As artes 2:3 e 1:1 de caixa sao so para jogos.
 *
 *   heroi-1920x1080.png  Arte de super-heroi 16:9, opcional, usada em layouts
 *                        promocionais. As restricoes da documentacao moldaram o
 *                        desenho: SEM texto, evitar mostrar a interface do app,
 *                        minimizar espaco vazio, manter o essencial no centro e
 *                        fora do terco inferior, onde pode entrar um gradiente.
 *
 * Por isso a arte 16:9 nao e uma captura: e o motivo do anel repetido em
 * tamanhos diferentes -- cadencia, que e o nome do produto.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD, TRACK_ON_DARK, drawRing, encodePng } from './generate-icons.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const saida = resolve(root, 'store')

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

/** Source-over de um bloco quadrado, com posicao livre e opacidade. */
function compor(tela, lt, at, bloco, lado, dx, dy, opacidade = 1) {
  for (let y = 0; y < lado; y++) {
    const ty = dy + y
    if (ty < 0 || ty >= at) continue
    for (let x = 0; x < lado; x++) {
      const tx = dx + x
      if (tx < 0 || tx >= lt) continue
      const o = (y * lado + x) * 4
      const a = (bloco[o + 3] / 255) * opacidade
      if (a <= 0) continue
      const d = (ty * lt + tx) * 4
      for (let c = 0; c < 3; c++) {
        tela[d + c] = Math.round(bloco[o + c] * a + tela[d + c] * (1 - a))
      }
    }
  }
  return tela
}

function anel(lado, { sweep = 0.72, largura = 0.072, raio = 0.34, trilha = TRACK_ON_DARK } = {}) {
  return drawRing({ size: lado, sweep, track: trilha, ringWidth: largura, radiusRatio: raio, background: null })
}

// ---------------------------------------------------------------- 300 x 300

{
  const L = 300
  const lado = Math.round(L * 0.78)
  const tela = compor(
    telaSolida(L, L, CARD), L, L,
    anel(lado), lado, Math.round((L - lado) / 2), Math.round((L - lado) / 2)
  )
  mkdirSync(saida, { recursive: true })
  writeFileSync(resolve(saida, 'logo-300x300.png'), encodePng(tela, L, L))
  console.log('  logo-300x300.png      300x300')
}

// --------------------------------------------------------------- 1920 x 1080

{
  const W = 1920
  const H = 1080
  const tela = telaSolida(W, H, CARD)

  // Brilho suave no alto, como o do topo da janela do app.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - W * 0.5) / (W * 0.55)
      const ny = (y - H * 0.1) / (H * 0.75)
      const t = Math.max(0, 1 - Math.hypot(nx, ny))
      if (t <= 0) continue
      const i = (y * W + x) * 4
      const ganho = t * t * 26
      tela[i] = Math.min(255, tela[i] + ganho * 1.6)
      tela[i + 1] = Math.min(255, tela[i + 1] + ganho * 0.7)
      tela[i + 2] = Math.min(255, tela[i + 2] + ganho * 0.45)
    }
  }

  /**
   * Aneis em tamanhos e avancos diferentes, densos o bastante para nao sobrar
   * espaco vazio. O centro de massa fica acima da metade: o terco inferior
   * pode receber um gradiente da Store e nao deve carregar nada essencial.
   */
  const COMPOSICAO = [
    { lado: 620, x: 650, y: 150, sweep: 0.72, op: 1.0 },
    { lado: 300, x: 300, y: 120, sweep: 0.45, op: 0.72 },
    { lado: 220, x: 1370, y: 110, sweep: 0.9, op: 0.62 },
    { lado: 400, x: 1340, y: 420, sweep: 0.3, op: 0.5 },
    { lado: 180, x: 150, y: 520, sweep: 0.62, op: 0.42 },
    { lado: 260, x: 430, y: 620, sweep: 0.84, op: 0.3 },
    { lado: 150, x: 1200, y: 760, sweep: 0.55, op: 0.22 },
    { lado: 110, x: 820, y: 830, sweep: 0.38, op: 0.18 }
  ]

  for (const { lado, x, y, sweep, op } of COMPOSICAO) {
    compor(tela, W, H, anel(lado, { sweep, largura: lado > 400 ? 0.055 : 0.075 }), lado, x, y, op)
  }

  writeFileSync(resolve(saida, 'heroi-1920x1080.png'), encodePng(tela, W, H))
  console.log('  heroi-1920x1080.png  1920x1080')
}
