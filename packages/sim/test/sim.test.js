// Prueba el contrato JS ↔ Rust con el .wasm real.
import { test, expect } from 'bun:test'
import { createGalaxy, ABI_VERSION } from '../src/index.js'

const bytes = await Bun.file(new URL('../sim.wasm', import.meta.url)).arrayBuffer()
const manifest = await Bun.file(new URL('../sim.manifest.json', import.meta.url)).json()

test('el manifiesto y el módulo hablan la misma ABI', async () => {
  expect(manifest.abi).toBe(ABI_VERSION)
  expect(manifest.bytes).toBe(bytes.byteLength)
  const galaxy = await createGalaxy({ source: bytes, count: 1000 })
  expect(galaxy.count).toBe(1000)
  expect(galaxy.points).toHaveLength(4000)
  expect(galaxy.colors).toHaveLength(3000)
})

test('el número de partículas se limita al máximo de la memoria estática', async () => {
  const galaxy = await createGalaxy({ source: bytes, count: 10_000_000 })
  expect(galaxy.count).toBe(65_536)
})

test('misma semilla, misma galaxia; colores en [0, 1]', async () => {
  const a = await createGalaxy({ source: bytes, count: 500, seed: 3 })
  const b = await createGalaxy({ source: bytes, count: 500, seed: 3 })
  expect([...a.step(0)]).toEqual([...b.step(0)])
  expect(a.colors.every((c) => c >= 0 && c <= 1)).toBe(true)
})

test('el puntero agita las partículas y el muelle las calma', async () => {
  const g = await createGalaxy({ source: bytes, count: 2000, seed: 9 })
  const first = g.step(0)
  const pointer = [first[0] + 0.05, first[1], first[2]]
  for (let i = 0; i < 30; i++) g.step(1 / 60, [pointer])
  const glow = () => g.points.filter((_, i) => i % 4 === 3).reduce((max, v) => Math.max(max, v), 0)
  expect(glow()).toBeGreaterThan(0.1)
  for (let i = 0; i < 900; i++) g.step(1 / 60)
  expect(glow()).toBeLessThan(0.01)
  expect(g.points.every(Number.isFinite)).toBe(true)
})

test('una ABI distinta se rechaza con un mensaje claro', async () => {
  const module = new WebAssembly.Module(bytes)
  const fake = { exports: { verx_abi: () => 99 } }
  const original = WebAssembly.instantiate
  WebAssembly.instantiate = async () => fake
  try {
    await expect(createGalaxy({ source: module })).rejects.toThrow(/bun run wasm/)
  } finally {
    WebAssembly.instantiate = original
  }
})

test('ABI v2: varios punteros a la vez, limitados a maxPointers', async () => {
  const g = await createGalaxy({ source: bytes, count: 3000, seed: 4 })
  expect(g.maxPointers).toBe(16)
  const p = g.step(0)
  const near = (i) => [p[i * 4] + 0.05, p[i * 4 + 1], p[i * 4 + 2]]
  // Más punteros de los que caben: no debe romper nada, sólo usa los 16 primeros.
  const many = Array.from({ length: 40 }, (_, i) => near(i * 50))
  for (let i = 0; i < 20; i++) g.step(1 / 60, many)
  const glowing = [...g.points].filter((v, i) => i % 4 === 3 && v > 0.05).length
  expect(glowing).toBeGreaterThan(16)
  expect(g.points.every(Number.isFinite)).toBe(true)
})
