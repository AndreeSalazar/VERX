// Escena del agujero negro de fondo: un triángulo a pantalla completa con el
// trazador de rayos de blackhole-shader.js. Se coloca donde está el agujero CSS
// (`anchor`, que queda como respaldo) y con su mismo tamaño aparente.
//
// Cuida la GPU: dibuja a resolución reducida, la baja más si el equipo no llega
// y, si ni así, se rinde y deja el agujero CSS. Con prefers-reduced-motion no
// arranca. Nada se ejecuta al importar: el SSR puede cargar este módulo sin DOM.

import { FULLSCREEN, createGL, createLoop, prefersReducedMotion } from '@verx/gl/core'
import { FRAGMENT } from './blackhole-shader.js'

const QUALITY = 0.65 // píxeles del lienzo por píxel CSS
const MIN_QUALITY = 0.3
const SHADOW = (3 * Math.sqrt(3)) / 2 // radio aparente de la sombra, en rs
const DIST = 26 // distancia de la cámara (la misma que en el shader)

export function startBlackHole(canvas, anchor, { onLive, onGiveUp } = {}) {
  if (prefersReducedMotion() || !anchor) return null
  const ctx = createGL(canvas, { maxDpr: QUALITY })
  if (!ctx) return null
  const { gl } = ctx
  const { program, uniforms: u } = ctx.program(FULLSCREEN, FRAGMENT)
  const vao = gl.createVertexArray()
  // En el inicio, el héroe trae su propio agujero: éste sólo se dibuja al bajar.
  const hero = document.querySelector('.hero')
  const look = { x: 0, y: 0, tx: 0, ty: 0 }
  const place = { width: 0, height: 0, x: 0, y: 0, focal: 1 }
  let quality = QUALITY
  let time = 0
  let live = false
  let frames = 0
  let spent = 0
  let strikes = 0

  const onMove = (e) => {
    look.tx = (e.clientX / innerWidth) * 2 - 1
    look.ty = 1 - (e.clientY / innerHeight) * 2
  }
  addEventListener('pointermove', onMove, { passive: true })

  // Centro y escala del agujero CSS, en píxeles del lienzo. Sólo al cambiar de tamaño.
  const measure = (width, height, dpr) => {
    if (width === place.width && height === place.height) return
    const r = anchor.getBoundingClientRect()
    const c = canvas.getBoundingClientRect()
    place.width = width
    place.height = height
    place.x = (r.left + r.width / 2 - c.left) * dpr
    place.y = (c.bottom - (r.top + r.height / 2)) * dpr
    place.focal = ((r.width / 2) * dpr) / (SHADOW / DIST)
  }

  // Calidad adaptativa: cada 45 frames mira cuánto tardan de media. Los saltos de
  // más de 100 ms no cuentan: son la pestaña en segundo plano o el hilo principal
  // ocupado, no la GPU. Sólo se rinde si, al mínimo, sigue lento dos veces seguidas.
  const adapt = (dt) => {
    if (dt > 0.1) return
    spent += dt
    if (++frames < 45) return
    const avg = spent / frames
    frames = spent = 0
    if (avg < 1 / 40) {
      strikes = 0
      return
    }
    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality * 0.8)
      ctx.setMaxDpr(quality)
    } else if (avg > 1 / 24 && ++strikes >= 2) {
      stop()
      onGiveUp?.()
    }
  }

  const frame = (dt) => {
    time += dt
    if (hero !== null && scrollY < innerHeight * 0.4) return
    const { width, height, dpr } = ctx.resize()
    measure(width, height, dpr)
    const k = 1 - Math.exp(-dt * 2)
    look.x += (look.tx - look.x) * k
    look.y += (look.ty - look.y) * k
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.uniform2f(u.uCenter, place.x, place.y)
    gl.uniform1f(u.uFocal, place.focal)
    gl.uniform1f(u.uTime, time)
    gl.uniform2f(u.uLook, look.x, look.y)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!live) {
      live = true
      onLive?.()
    } else adapt(dt)
  }

  const loop = createLoop(canvas, frame)
  loop.start()

  function stop() {
    loop.destroy()
    removeEventListener('pointermove', onMove)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  return stop
}
