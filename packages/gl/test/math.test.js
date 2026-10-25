import { test, expect } from 'bun:test'
import { m4 } from '../src/index.js'

const close = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps)

test('lookAt + perspective: el objetivo cae en el centro de la pantalla', () => {
  const eye = [3, 4, 5]
  const view = m4.lookAt(m4.mat4(), eye, [0, 0, 0])
  const proj = m4.perspective(m4.mat4(), Math.PI / 3, 16 / 9, 0.1, 100)
  const vp = m4.multiply(m4.mat4(), proj, view)
  expect(close(m4.project(vp, [0, 0, 0]), [0, 0])).toBe(true)
})

test('un punto a la derecha de la cámara se proyecta a la derecha', () => {
  const eye = [0, 0, 5]
  const vp = m4.multiply(m4.mat4(), m4.perspective(m4.mat4(), Math.PI / 2, 1, 0.1, 100), m4.lookAt(m4.mat4(), eye, [0, 0, 0]))
  const [x, y] = m4.project(vp, [1, 0, 0])
  expect(x).toBeGreaterThan(0)
  expect(Math.abs(y)).toBeLessThan(1e-6)
})

test('rayToPlaneY es la inversa de project sobre el plano y = 0', () => {
  const eye = [2, 5, 6]
  const target = [0, 0, 0]
  const fov = Math.PI / 3.5
  const aspect = 1.6
  const vp = m4.multiply(m4.mat4(), m4.perspective(m4.mat4(), fov, aspect, 0.1, 100), m4.lookAt(m4.mat4(), eye, target))
  for (const p of [[0, 0, 0], [1.5, 0, -0.5], [-2, 0, 1]]) {
    const [x, y] = m4.project(vp, p)
    expect(close(m4.rayToPlaneY(eye, target, fov, aspect, x, y), p, 1e-3)).toBe(true)
  }
})

test('un rayo que no corta el plano devuelve null', () => {
  expect(m4.rayToPlaneY([0, 5, 5], [0, 5, 0], Math.PI / 3, 1, 0, 0.9)).toBeNull()
})
