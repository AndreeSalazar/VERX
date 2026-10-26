// El sistema triple del fondo (lib/blackhole-system.js), sin GPU: las órbitas,
// la cámara y la lente que desplaza dónde se ve cada agujero.
import { test, expect } from 'bun:test'
import { DIST, HOLES, apparent, camera, positions } from '../lib/blackhole-system.js'

const ROUT = 14 // radio exterior de cada disco, en rs de su agujero (el del shader)

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const at = (p, k) => [p[k * 4], p[k * 4 + 1], p[k * 4 + 2]]

test('el gigante queda quieto en el centro y cada compañero recorre su círculo', () => {
  for (const t of [0, 17, 60, 119]) {
    const p = positions(t)
    for (const x of at(p, 0)) expect(Math.abs(x)).toBe(0) // (sale −0: radio 0 por un coseno negativo)
    HOLES.forEach((h, k) => {
      expect(Math.hypot(...at(p, k))).toBeCloseTo(h.orbit, 4)
      expect(p[k * 4 + 3]).toBeCloseTo(h.rs, 6)
    })
  }
  // Un periodo después, todo vuelve a su sitio.
  const a = positions(5)
  const b = positions(5 + HOLES[1].period)
  for (let i = 0; i < 12; i++) expect(b[i]).toBeCloseTo(a[i], 3)
})

test('la cámara mira al gigante desde DIST, con ejes ortonormales', () => {
  for (const [look, scroll] of [[{ x: 0, y: 0 }, 0], [{ x: 1, y: -1 }, 0.5], [{ x: -1, y: 1 }, 1]]) {
    const { cam, fw, rt, up } = camera(look, scroll)
    expect(Math.hypot(...cam)).toBeCloseTo(DIST, 6)
    expect(dot(fw, cam) / DIST).toBeCloseTo(-1, 6)
    for (const [a, b] of [[fw, rt], [fw, up], [rt, up]]) expect(dot(a, b)).toBeCloseTo(0, 6)
    for (const v of [fw, rt, up]) expect(Math.hypot(...v)).toBeCloseTo(1, 6)
  }
})

test('los discos nunca se solapan en pantalla (si no, el trazado cortaría uno)', () => {
  let closest = Infinity
  for (let t = 0; t < HOLES[1].period; t += 0.5) {
    const p = positions(t)
    for (const scroll of [0, 0.25, 0.5, 0.75, 1]) {
      for (const look of [{ x: -1, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 1 }]) {
        const view = camera(look, scroll)
        const seen = apparent(view, p)
        for (let i = 0; i < 3; i++) {
          for (let j = i + 1; j < 3; j++) {
            // Radio aparente de cada disco, en las mismas unidades (uv ≈ radianes).
            const ri = (ROUT * p[i * 4 + 3]) / Math.hypot(...view.cam.map((c, n) => c - p[i * 4 + n]))
            const rj = (ROUT * p[j * 4 + 3]) / Math.hypot(...view.cam.map((c, n) => c - p[j * 4 + n]))
            const gap = Math.hypot(seen[i * 2] - seen[j * 2], seen[i * 2 + 1] - seen[j * 2 + 1]) / (ri + rj)
            closest = Math.min(closest, gap)
          }
        }
      }
    }
  }
  expect(closest).toBeGreaterThan(1)
})

test('la lente aparta de su sitio a los compañeros, hacia fuera del gigante', () => {
  const view = camera({ x: 0, y: 0 }, 0)
  const p = positions(30)
  const seen = apparent(view, p)
  // El gigante, casi en el centro: los compañeros también lo desvían, un poco.
  expect(Math.hypot(seen[0], seen[1])).toBeLessThan(0.02)
  for (const k of [1, 2]) {
    const v = at(p, k).map((x, n) => x - view.cam[n])
    const z = dot(v, view.fw)
    const real = Math.hypot(dot(v, view.rt) / z, dot(v, view.up) / z)
    const visto = Math.hypot(seen[k * 2], seen[k * 2 + 1])
    expect(visto).toBeGreaterThan(real)
    // Cuanto más detrás del gigante, más se aparta (aquí, hasta un ~28 %), pero
    // sólo cuenta el tramo que pasa junto a él: nunca lo manda lejos.
    expect(visto / real).toBeLessThan(1.5)
  }
})
