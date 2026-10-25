// Escena 3D del héroe: la galaxia la simula Rust (WebAssembly, @verx/sim) y
// la dibuja WebGL2 (@verx/gl). Cada frame:
//   puntero → rayo → plano de la galaxia → Rust empuja partículas →
//   vista Float32Array sobre la memoria del .wasm → GPU (sin copias en JS).
// Multijugador: los punteros de los demás visitantes (vía /api/galaxia) también
// empujan la galaxia y se ven como orbes de colores.
// Nada se ejecuta al importar: el SSR puede cargar este módulo sin DOM.

import { createGL, createLoop, createPointCloud, createBackdrop, m4 } from '@verx/gl'
import { createGalaxy } from '@verx/sim'
import { connectGalaxy } from './galaxy-net.js'
import { MAX_CURSORS } from './galaxy-protocol.js'

const FOV = Math.PI / 4.2
const TARGET = [0, 0, 0]
// Un color por visitante (id % 8): oro, coral, violeta, cian, menta, rosa, lima, azul.
const ORBS = [
  [1, 0.84, 0.42], [1, 0.48, 0.36], [0.62, 0.42, 1], [0.26, 0.72, 1],
  [0.35, 1, 0.75], [1, 0.45, 0.8], [0.75, 1, 0.35], [0.4, 0.55, 1],
]
const socketUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/galaxia`

// Menos partículas en pantallas pequeñas o equipos modestos.
function budget() {
  const base = innerWidth < 720 ? 16_000 : 38_000
  return Math.round(base * ((navigator.hardwareConcurrency || 4) <= 4 ? 0.6 : 1))
}

export async function startGalaxy(canvas, { seed = 7, multiplayer = true, onOnline } = {}) {
  const ctx = createGL(canvas, { maxDpr: 1.75 })
  if (!ctx) return () => {} // sin WebGL2 se queda el degradado CSS del héroe
  const galaxy = await createGalaxy({ count: budget(), seed })
  const cloud = createPointCloud(ctx, { count: galaxy.count, colors: galaxy.colors })
  const backdrop = createBackdrop(ctx)
  const orbPoints = new Float32Array(MAX_CURSORS * 4)
  const orbColors = new Float32Array(MAX_CURSORS * 3)
  const orbs = createPointCloud(ctx, { count: MAX_CURSORS, colors: orbColors })
  const net = multiplayer ? connectGalaxy(socketUrl(), { onOnline }) : null
  const view = m4.mat4()
  const proj = m4.mat4()
  const vp = m4.mat4()
  const pointer = { x: 0, y: 0, inside: false, at: 0 }
  const look = { x: 0, y: 0 }
  let time = 0

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.y = 1 - ((e.clientY - r.top) / r.height) * 2
    pointer.inside = Math.abs(pointer.x) <= 1 && Math.abs(pointer.y) <= 1
    pointer.at = performance.now()
  }
  const onLeave = () => (pointer.inside = false)
  addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)

  const frame = (dt) => {
    time += dt
    const { aspect, dpr } = ctx.resize()
    // En pantallas anchas la galaxia se desplaza a la derecha (desplazamiento de lente).
    // En vertical (móvil) baja a la mitad inferior, bajo el texto.
    const shift = Math.min(0.5, Math.max(0, (aspect - 0.9) * 0.9))
    const shiftY = aspect < 0.9 ? -0.38 : 0
    const k = 1 - Math.exp(-dt * 3)
    look.x += ((pointer.inside ? pointer.x - shift : 0) - look.x) * k
    look.y += ((pointer.inside ? pointer.y - shiftY : 0) - look.y) * k

    const yaw = 0.35 + time * 0.03 + look.x * 0.3
    const pitch = 0.6 + look.y * 0.12
    const portrait = aspect < 0.9
    const dist = 7.4 * Math.max(1, 0.75 / aspect)
    const eye = [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist]
    m4.lookAt(view, eye, TARGET)
    m4.perspective(proj, FOV, aspect, 0.1, 100)
    proj[8] -= shift
    proj[9] -= shiftY
    m4.multiply(vp, proj, view)

    const recent = pointer.inside && performance.now() - pointer.at < 1500
    const hit = recent ? m4.rayToPlaneY(eye, TARGET, FOV, aspect, pointer.x - shift, pointer.y - shiftY) : null

    // Tu puntero y los de los demás empujan la misma galaxia.
    const pointers = hit ? [hit] : []
    let visible = 0
    if (net) {
      net.send(hit)
      net.smooth(dt)
      for (const [id, c] of net.cursors) {
        if (visible >= MAX_CURSORS) break
        pointers.push([c.x, 0, c.z])
        orbPoints.set([c.x, 0.08, c.z, 1], visible * 4)
        orbColors.set(ORBS[id % ORBS.length], visible * 3)
        visible++
      }
    }
    cloud.update(galaxy.step(dt, pointers))

    const [cx, cy] = m4.project(vp, TARGET)
    backdrop.draw([cx * 0.5 + 0.5, cy * 0.5 + 0.5], aspect)
    // En vertical hay menos partículas: puntos algo mayores y más brillo.
    cloud.draw(vp, { size: (portrait ? 30 : 24) * dpr, intensity: portrait ? 1.4 : 0.95 })
    if (visible > 0) {
      orbs.update(orbPoints)
      orbs.setColors(orbColors)
      orbs.draw(vp, { size: 150 * dpr, intensity: 1.6, visible })
    }
  }

  const loop = createLoop(canvas, frame, { onSlow: () => ctx.setMaxDpr(1) })
  loop.start()

  return () => {
    net?.close()
    loop.destroy()
    removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    ctx.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
