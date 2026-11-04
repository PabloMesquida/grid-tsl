import { DataTexture, RGFormat, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter } from 'three/webgpu'

// Textura de ruido del modo mate, generada por código: no hay archivos que distribuir.
//   R: grano (ruido blanco).
//   G: manchas (ruido de valor periódico con varias octavas).
// Ambos canales tienen distribución uniforme y media 0.5, así que sus mipmaps convergen a 0.5
// y en la distancia el ruido se apaga solo, sin moiré ni parpadeo.

/** Texels por lado: una repetición del grano abarca NOISE_SIZE granos. */
export const NOISE_SIZE = 256
/** Manchas por lado en una repetición del canal G. */
export const MOTTLE_CELLS = 8

const OCTAVES = [[1, 1], [2, 0.5], [4, 0.25]]   // [frecuencia, amplitud]

let shared = null

/** Generador determinista (mulberry32): el suelo se ve igual en cada carga. */
function createRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruido de valor que se repite sin costuras; `u` y `v` van de 0 a 1. */
function periodicNoise(cells, random) {
  const lattice = Float32Array.from({ length: cells * cells }, random)
  const at = (x, y) => lattice[(y % cells) * cells + (x % cells)]
  const smooth = (t) => t * t * (3 - 2 * t)
  const lerp = (a, b, t) => a + (b - a) * t

  return (u, v) => {
    const x = u * cells
    const y = v * cells
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = smooth(x - x0)
    const ty = smooth(y - y0)
    return lerp(
      lerp(at(x0, y0), at(x0 + 1, y0), tx),
      lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx),
      ty,
    )
  }
}

/** Sustituye cada valor por su posición relativa: distribución uniforme de 0 a 1. */
function equalize(values) {
  const order = Uint32Array.from(values.keys()).sort((a, b) => values[a] - values[b])
  const result = new Float32Array(values.length)
  order.forEach((index, rank) => { result[index] = rank / (values.length - 1) })
  return result
}

function generateMottle(random) {
  const octaves = OCTAVES.map(([frequency, amplitude]) => [periodicNoise(MOTTLE_CELLS * frequency, random), amplitude])
  const values = new Float32Array(NOISE_SIZE * NOISE_SIZE)
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      let sum = 0
      for (const [noise, amplitude] of octaves) sum += noise(x / NOISE_SIZE, y / NOISE_SIZE) * amplitude
      values[y * NOISE_SIZE + x] = sum
    }
  }
  return equalize(values)
}

/** Textura compartida por todos los materiales; se crea la primera vez que se pide. */
export function getNoiseTexture() {
  if (shared) return shared

  const random = createRandom(0x67726964)
  const mottle = generateMottle(random)
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 2)
  for (let i = 0; i < mottle.length; i++) {
    data[i * 2] = Math.floor(random() * 256)
    data[i * 2 + 1] = Math.round(mottle[i] * 255)
  }

  shared = new DataTexture(data, NOISE_SIZE, NOISE_SIZE, RGFormat)
  shared.wrapS = shared.wrapT = RepeatWrapping
  shared.magFilter = LinearFilter
  shared.minFilter = LinearMipmapLinearFilter
  shared.generateMipmaps = true
  shared.anisotropy = 8
  shared.needsUpdate = true
  return shared
}
