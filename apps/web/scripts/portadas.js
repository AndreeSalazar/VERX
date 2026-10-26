// Genera las portadas del blog (public/portadas/*.png): una nebulosa, estrellas
// y un agujero negro con su disco, en los tonos de cada artículo. Arte
// procedural codificado con verx-img, para no depender de fotos de fuera.
//
//   bun run portadas     (desde apps/web)
//
// Son el ORIGINAL: el sitio las sirve reducidas con <Image> (variantes y placeholder).

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createImages } from '@verx/img'

const W = 1600
const H = 900
const out = fileURLToPath(new URL('../public/portadas/', import.meta.url))

// Tonos de cada portada: [nebulosa A, nebulosa B, disco], en RGB 0..1.
const COVERS = {
  'por-que-otro-framework': [[0.42, 0.18, 0.75], [0.95, 0.42, 0.22], [1, 0.72, 0.38]],
  'de-node-a-bun': [[0.12, 0.42, 0.78], [0.62, 0.22, 0.7], [0.85, 0.9, 1]],
  'cero-js-por-defecto': [[0.85, 0.3, 0.2], [0.35, 0.12, 0.55], [1, 0.85, 0.55]],
}

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

// Ruido de valor suave (rejilla con interpolación) y fbm de pocas octavas: así el
// PNG comprime bien (nada de ruido de alta frecuencia).
function noise2(seed) {
  const r = rng(seed)
  const N = 256
  const table = Float32Array.from({ length: N * N }, r)
  const at = (x, y) => table[((y & (N - 1)) * N + (x & (N - 1))) | 0]
  const smooth = (t) => t * t * (3 - 2 * t)
  return (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = smooth(x - xi)
    const v = smooth(y - yi)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u
    return a + (b - a) * v
  }
}

function cover(seed, [nebA, nebB, disk]) {
  const n = noise2(seed)
  const fbm = (x, y) => n(x, y) * 0.55 + n(x * 2.1 + 5, y * 2.1 + 9) * 0.3 + n(x * 4.3 + 17, y * 4.3 + 3) * 0.15
  const rgba = new Uint8Array(W * H * 4)
  const cx = W * 0.66
  const cy = H * 0.5
  const R = H * 0.13 // radio de la sombra
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / 260
      const ny = y / 260
      // Nebulosa: oscura, con filamentos (el ruido se deforma con otro ruido).
      const warp = fbm(nx + 3, ny + 7) * 2.4
      const cloud = Math.max(0, fbm(nx + warp, ny + warp * 0.6) - 0.46) ** 1.6 * 2.6
      const mix = fbm(nx * 0.6 + 11, ny * 0.6 + 2)
      const dx = (x - cx) / R
      const dy = (y - cy) / R
      const d = Math.hypot(dx, dy)
      // 1. Lo de detrás: nebulosa, halo y la luz del disco curvada por encima y por debajo (la lente).
      const halo = Math.exp(-(d * d) / 3.2) * 0.14
      const lens = Math.exp(-(((d - 1.12) / 0.07) ** 2)) * (dy < 0 ? 1.1 : 0.55)
      let r = 0.004 + cloud * (nebA[0] * mix + nebB[0] * (1 - mix)) * 0.55 + disk[0] * (halo + lens)
      let g = 0.004 + cloud * (nebA[1] * mix + nebB[1] * (1 - mix)) * 0.55 + disk[1] * (halo + lens)
      let b = 0.012 + cloud * (nebA[2] * mix + nebB[2] * (1 - mix)) * 0.55 + disk[2] * (halo + lens)
      // 2. La sombra: no escapa nada de lo de detrás.
      if (d < 1) {
        const keep = 1 - Math.min(1, (1 - d) * 30)
        r *= keep
        g *= keep
        b *= keep
      }
      // 3. La parte delantera del disco, casi de canto, pasa por delante de la sombra.
      // Doppler: el lado que se acerca (izquierda) brilla más.
      const band = Math.exp(-((dy * 7.5) ** 2)) * (0.5 * Math.exp(-((dx / 3.4) ** 2)) + 0.9 * Math.exp(-(((Math.abs(dx) - 1.5) / 0.8) ** 2)))
      const doppler = Math.min(1.6, Math.max(0.35, 1 - dx * 0.22))
      r += disk[0] * band * doppler
      g += disk[1] * band * doppler
      b += disk[2] * band * doppler
      // Tono fílmico suave y a sRGB.
      const i = (y * W + x) * 4
      rgba[i] = Math.round(255 * Math.pow(1 - Math.exp(-r * 1.5), 1 / 2.2))
      rgba[i + 1] = Math.round(255 * Math.pow(1 - Math.exp(-g * 1.5), 1 / 2.2))
      rgba[i + 2] = Math.round(255 * Math.pow(1 - Math.exp(-b * 1.5), 1 / 2.2))
      rgba[i + 3] = 255
    }
  }
  // Estrellas: pocas y nítidas.
  const r = rng(seed * 7 + 1)
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(r() * W)
    const y = Math.floor(r() * H)
    const v = 120 + Math.floor(r() * 135)
    const i = (y * W + x) * 4
    rgba[i] = Math.max(rgba[i], v)
    rgba[i + 1] = Math.max(rgba[i + 1], v)
    rgba[i + 2] = Math.max(rgba[i + 2], Math.min(255, v + 20))
  }
  return rgba
}

const img = await createImages()
mkdirSync(out, { recursive: true })
let seed = 11
for (const [slug, tones] of Object.entries(COVERS)) {
  const png = img.encode(cover(seed++, tones), W, H)
  writeFileSync(out + slug + '.png', png)
  console.log(`portadas/${slug}.png · ${W}×${H} · ${(png.length / 1024).toFixed(0)} KB`)
}
