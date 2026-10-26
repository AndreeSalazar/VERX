// Prueba el contrato JS ↔ Rust con el .wasm real.
import { test, expect } from 'bun:test'
import { createImages, ABI_VERSION } from '../src/index.js'

const bytes = await Bun.file(new URL('../img.wasm', import.meta.url)).arrayBuffer()
const manifest = await Bun.file(new URL('../img.manifest.json', import.meta.url)).json()
const img = await createImages()

// Un degradado de prueba: rojo en horizontal, verde en vertical.
function gradient(w, h, alpha = 255) {
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) rgba.set([Math.floor((x * 255) / w), Math.floor((y * 255) / h), 90, alpha], (y * w + x) * 4)
  }
  return rgba
}

test('el manifiesto y el módulo hablan la misma ABI', async () => {
  expect(manifest.abi).toBe(ABI_VERSION)
  expect(manifest.bytes).toBe(bytes.byteLength)
  const fromBytes = await createImages({ source: bytes })
  expect(fromBytes.process(fromBytes.encode(gradient(4, 4), 4, 4)).width).toBe(4)
})

test('codifica un PNG válido y lo vuelve a leer', () => {
  const png = img.encode(gradient(320, 180), 320, 180)
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(png.length).toBeLessThan(10_000) // 230 KB de píxeles
  const info = img.process(png)
  expect(info).toMatchObject({ width: 320, height: 180, alpha: false })
  expect(info.color).toMatch(/^#[0-9a-f]{6}$/)
})

test('variantes proporcionales, sin agrandar nunca, y placeholder diminuto', () => {
  const png = img.encode(gradient(1600, 900), 1600, 900)
  const out = img.process(png, { widths: [480, 960, 960, 4000], placeholder: 20 })
  expect(out.variants.map((v) => [v.width, v.height])).toEqual([
    [480, 270],
    [960, 540],
    [1600, 900],
  ])
  for (const v of out.variants) expect(img.process(v.bytes, { placeholder: 0 })).toMatchObject({ width: v.width, height: v.height })
  expect([out.placeholder.width, out.placeholder.height]).toEqual([20, 11])
  expect(out.placeholder.bytes.length).toBeLessThan(1200)
})

test('la transparencia se conserva', () => {
  const out = img.process(img.encode(gradient(64, 64, 128), 64, 64), { widths: [16] })
  expect(out.alpha).toBe(true)
  expect(img.process(out.variants[0].bytes).alpha).toBe(true)
})

test('archivos rotos o ajenos dan un error claro', () => {
  expect(() => img.process(new Uint8Array([1, 2, 3]))).toThrow(/no es un PNG/)
  const png = img.encode(gradient(8, 8), 8, 8)
  expect(() => img.process(png.subarray(0, 40))).toThrow(/PNG no válido/)
  expect(() => img.encode(new Uint8Array(10), 8, 8)).toThrow(/faltan píxeles/)
})

test('una foto grande se procesa rápido (la memoria del .wasm crece sola)', () => {
  const big = img.encode(gradient(3000, 2000), 3000, 2000)
  const t0 = performance.now()
  const out = img.process(big, { widths: [640, 1280] })
  const ms = performance.now() - t0
  expect(out.variants.map((v) => v.width)).toEqual([640, 1280])
  expect(ms).toBeLessThan(5000)
})

test('una ABI distinta se rechaza con un mensaje claro', async () => {
  const original = WebAssembly.instantiate
  WebAssembly.instantiate = async () => ({ exports: { verx_abi: () => 99 } })
  try {
    await expect(createImages({ source: new WebAssembly.Module(bytes) })).rejects.toThrow(/bun run wasm/)
  } finally {
    WebAssembly.instantiate = original
  }
})
