/**
 * Converte os tokens de cor de index.css para hexadecimal.
 * Le o arquivo de verdade: nenhum valor e transcrito a mao.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(resolve(raiz, 'src/renderer/src/index.css'), 'utf8')

const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

function oklchParaHex(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((v) => Math.round(Math.min(1, Math.max(0, gamma(v))) * 255))
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')
}

function bloco(nome, regex) {
  const m = css.match(regex)
  if (!m) return {}
  const tokens = {}
  for (const linha of m[1].split('\n')) {
    const t = linha.match(/^\s*(--[\w-]+):\s*(.+?);/)
    if (!t) continue
    tokens[t[1]] = t[2].trim()
  }
  return tokens
}

const claro = bloco('claro', /^:root \{([\s\S]*?)^\}/m)
const escuro = bloco('escuro', /^\.dark \{([\s\S]*?)^\}/m)

function resolver(tokens, valor, profundidade = 0) {
  if (profundidade > 4) return valor
  const ref = valor.match(/^var\((--[\w-]+)\)$/)
  if (ref) return resolver(tokens, tokens[ref[1]] ?? valor, profundidade + 1)
  return valor
}

function hex(tokens, valor) {
  const v = resolver(tokens, valor)
  const ok = v.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/)
  if (ok) return oklchParaHex(+ok[1], +ok[2], +ok[3])
  return v // alfa, gradiente ou outro formato
}

const grupos = [
  ['Fundos e superficies', ['--background', '--card', '--popover', '--muted', '--secondary', '--accent']],
  ['Texto', ['--foreground', '--muted-foreground']],
  ['Bordas e contornos', ['--border', '--input', '--app-edge', '--ring']],
  ['Acao principal', ['--primary', '--primary-foreground']],
  ['Fases do ciclo', ['--phase-focus', '--phase-focus-tail', '--phase-break', '--phase-water']],
  ['Anel e controles', ['--track', '--switch-on', '--switch-off', '--switch-thumb']],
  ['Destrutivo', ['--destructive']]
]

for (const [titulo, chaves] of grupos) {
  console.log('\n' + titulo)
  console.log('  ' + 'token'.padEnd(24) + 'escuro     claro')
  for (const k of chaves) {
    const e = escuro[k] ? hex(escuro, escuro[k]) : '—'
    const c = claro[k] ? hex(claro, claro[k]) : '—'
    console.log('  ' + k.padEnd(24) + String(e).padEnd(11) + c)
  }
}
