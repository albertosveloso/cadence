/**
 * Gera os sons de notificacao sem dependencia externa e sem arquivo de
 * terceiros: WAV PCM escrito a mao, sintese aditiva.
 *
 * Saidas (resources/):
 *   sino.wav    -- campainha metalica, o "dring" do timer de cozinha classico
 *   suave.wav   -- duas notas macias, para quem acha o sino agressivo
 *
 * O terceiro som disponivel no app e o proprio som de notificacao do Windows,
 * que nao precisa ser empacotado.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RATE = 44100

/** WAV PCM 16 bits, mono. */
function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(v * 32767), i * 2)
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** Rampa curta no inicio e no fim, para nao estalar no alto-falante. */
function aplicarBordas(buf) {
  const n = Math.floor(RATE * 0.004)
  for (let i = 0; i < n; i++) {
    buf[i] *= i / n
    buf[buf.length - 1 - i] *= i / n
  }
  return buf
}

function normalizar(buf, pico = 0.82) {
  let max = 0
  for (const v of buf) max = Math.max(max, Math.abs(v))
  if (max === 0) return buf
  const k = pico / max
  for (let i = 0; i < buf.length; i++) buf[i] *= k
  return buf
}

/**
 * Sino. Um sino nao e harmonico: os parciais ficam em razoes irracionais, e e
 * isso que da o timbre metalico. As razoes abaixo sao as classicas de sino,
 * e os parciais agudos decaem mais rapido que o fundamental.
 */
function sino() {
  const dur = 1.5
  const n = Math.floor(RATE * dur)
  const f0 = 920
  const parciais = [1, 2.76, 5.4, 8.93, 11.34]
  const ganhos = [1, 0.55, 0.33, 0.2, 0.12]
  const decaimentos = [1, 0.62, 0.45, 0.32, 0.24]

  const buf = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    let s = 0
    for (let p = 0; p < parciais.length; p++) {
      s += ganhos[p] * Math.sin(2 * Math.PI * f0 * parciais[p] * t) * Math.exp(-t / (0.5 * decaimentos[p]))
    }
    // Tremulo leve nos primeiros 250 ms: sugere o badalo batendo, que e o que
    // distingue o timer mecanico de um sino de templo.
    const tremulo = t < 0.25 ? 1 + 0.35 * Math.sin(2 * Math.PI * 34 * t) : 1
    // Ataque percussivo muito curto.
    const ataque = Math.min(1, t / 0.002)
    buf[i] = s * tremulo * ataque
  }
  return aplicarBordas(normalizar(buf))
}

/** Duas notas macias e sobrepostas: aviso sem susto. */
function suave() {
  const dur = 1.6
  const n = Math.floor(RATE * dur)
  const notas = [
    { f: 784, inicio: 0.0, decaimento: 0.55 }, // Sol5
    { f: 1046.5, inicio: 0.18, decaimento: 0.7 } // Do6
  ]

  const buf = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    let s = 0
    for (const nota of notas) {
      const dt = t - nota.inicio
      if (dt < 0) continue
      const env = Math.min(1, dt / 0.02) * Math.exp(-dt / nota.decaimento)
      s += env * (Math.sin(2 * Math.PI * nota.f * dt) + 0.18 * Math.sin(4 * Math.PI * nota.f * dt))
    }
    buf[i] = s * 0.5
  }
  return aplicarBordas(normalizar(buf, 0.7))
}

mkdirSync(resolve(root, 'resources'), { recursive: true })
for (const [nome, gerar] of [
  ['sino', sino],
  ['suave', suave]
]) {
  const wav = encodeWav(gerar())
  writeFileSync(resolve(root, `resources/${nome}.wav`), wav)
  console.log(`  resources/${nome}.wav  ${(wav.length / 1024).toFixed(0)} kB`)
}
