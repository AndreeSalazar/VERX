'use client'
import { onMount } from '@verx/ui'
import { startBlackHole } from '../lib/blackhole-scene.js'

// El agujero negro "de verdad": trazado de rayos en la GPU (lib/blackhole-shader.js).
// En el servidor es un <canvas> vacío y se ve el agujero CSS; en el navegador,
// cuando éste queda libre, arranca el motor y aparece con un fundido. Si no hay
// WebGL2, el equipo no llega o se pide menos movimiento, se queda el CSS.
export default function BlackHoleGL() {
  let canvas = null
  onMount(() => {
    const anchor = canvas.closest('.cosmos')?.querySelector('.bh')
    let stop = null
    try {
      stop = startBlackHole(canvas, anchor, {
        onLive: () => canvas.classList.add('is-live'),
        onGiveUp: () => canvas.classList.remove('is-live'),
      })
    } catch (err) {
      console.warn('[verx] agujero negro WebGL desactivado:', err)
    }
    return () => stop?.()
  })
  return <canvas class="cosmos-gl" aria-hidden="true" ref={(el) => (canvas = el)} />
}
