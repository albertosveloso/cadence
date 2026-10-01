/**
 * Gera os icones do app sem nenhuma dependencia externa: PNG e ICO escritos
 * a mao com o zlib do proprio Node.
 *
 * Saidas:
 *   build/icon.ico            -- instalador e executavel (16..256)
 *   resources/tray-light.png  -- bandeja sobre fundo escuro (16 e 32)
 *   resources/tray-dark.png   -- bandeja sobre fundo claro (16 e 32)
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Paleta espelhando os tokens de src/renderer/src/index.css
export const RED = [240, 58, 23]
export const AMBER = [245, 165, 36]
export const TRACK_ON_DARK = [84, 87, 93]
// Cinza medio: legivel tanto na barra de tarefas clara quanto na escura.
const TRACK_NEUTRAL = [150, 144, 138]
// #191A1C -- mesmo fundo do tema escuro do app
export const CARD = [25, 26, 28]

const SS = 4 // supersampling para antialiasing

const lerp = (a, b, t) => a + (b - a) * t
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/**
 * Desenha o anel de progresso: trilha completa + arco de `sweep` do total,
 * comecando no topo e girando no sentido do relogio, com o gradiente
 * vermelho -> ambar na direcao do avanco (como na referencia visual).
 */
export function drawRing({ size, sweep, track, ringWidth, radiusRatio, background, cornerRatio }) {
  const px = new Float64Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS
          const fy = y + (sy + 0.5) / SS
          let sr = 0, sg = 0, sb = 0, sa = 0

          // Fundo opcional: quadrado de cantos arredondados (icone do app)
          if (background) {
            const inset = size * 0.055
            const rad = size * cornerRatio
            const cx = Math.min(Math.max(fx, inset + rad), size - inset - rad)
            const cy = Math.min(Math.max(fy, inset + rad), size - inset - rad)
            const d = Math.hypot(fx - cx, fy - cy)
            if (fx >= inset && fx <= size - inset && fy >= inset && fy <= size - inset && d <= rad) {
              sr = background[0]; sg = background[1]; sb = background[2]; sa = 1
            }
          }

          // Anel
          const cx = size / 2
          const cy = size / 2
          const dist = Math.hypot(fx - cx, fy - cy)
          const radius = size * radiusRatio
          const half = (size * ringWidth) / 2

          if (Math.abs(dist - radius) <= half) {
            // angulo 0 no topo, crescendo no sentido do relogio
            let ang = Math.atan2(fx - cx, cy - fy)
            if (ang < 0) ang += Math.PI * 2
            const t = ang / (Math.PI * 2)

            const color = t <= sweep ? mixRgb(RED, AMBER, sweep > 0 ? t / sweep : 0) : track
            sr = color[0]; sg = color[1]; sb = color[2]; sa = 1
          }

          r += sr * sa; g += sg * sa; b += sb * sa; a += sa
        }
      }

      const n = SS * SS
      const alpha = a / n
      const i = (y * size + x) * 4
      // Pre-multiplicado de volta para nao escurecer as bordas
      px[i] = alpha > 0 ? r / a : 0
      px[i + 1] = alpha > 0 ? g / a : 0
      px[i + 2] = alpha > 0 ? b / a : 0
      px[i + 3] = alpha * 255
    }
  }

  const out = Buffer.alloc(size * size * 4)
  for (let i = 0; i < px.length; i++) out[i] = Math.round(Math.min(255, Math.max(0, px[i])))
  return out
}

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

export function encodePng(rgba, width, height = width) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filtro none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ------------------------------------------------------------------ ICO

function encodeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)

  let offset = 6 + pngs.length * 16
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[4] = 1 // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32BE(0, 8)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

// ------------------------------------------------------------------ Saida

/**
 * So grava quando executado direto (`node scripts/generate-icons.mjs`). Sem
 * esta guarda, importar `drawRing` daqui reescreveria os icones como efeito
 * colateral do import.
 */
const executadoDireto = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (executadoDireto) {
  mkdirSync(resolve(root, 'build'), { recursive: true })
mkdirSync(resolve(root, 'resources'), { recursive: true })

// Icone do app: card escuro arredondado com o anel em ~72%
const appSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = appSizes.map((size) => ({
  size,
  data: encodePng(
    drawRing({
      size,
      sweep: 0.72,
      track: TRACK_ON_DARK,
      ringWidth: size <= 32 ? 0.11 : 0.075,
      radiusRatio: 0.315,
      background: CARD,
      cornerRatio: 0.22
    }),
    size
  )
}))
writeFileSync(resolve(root, 'build/icon.ico'), encodeIco(icoPngs))

// Icones de bandeja: fundo transparente, anel maior para render em 16px
// Um unico icone de bandeja. O Electron nao expoe o tema real do sistema
// quando themeSource esta forcado, entao escolher entre variante clara e
// escura pelo shouldUseDarkColors erraria o icone justamente quando o usuario
// forca um tema diferente do Windows.
for (const [name, track] of [['tray', TRACK_NEUTRAL]]) {
  for (const [suffix, size] of [['', 16], ['@2x', 32]]) {
    const rgba = drawRing({
      size,
      sweep: 0.72,
      track,
      ringWidth: size <= 16 ? 0.17 : 0.14,
      radiusRatio: 0.36,
      background: null,
      cornerRatio: 0
    })
    writeFileSync(resolve(root, `resources/${name}${suffix}.png`), encodePng(rgba, size))
  }
}

console.log('icones gerados:')
console.log('  build/icon.ico            ' + appSizes.join(', '))
console.log('  resources/tray.png        16, 32 (@2x)')
}
