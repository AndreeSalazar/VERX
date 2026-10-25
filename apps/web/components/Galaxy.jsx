'use client'
import { onMount } from '@verx/ui'
import { startGalaxy } from '../lib/galaxy-scene.js'

// Lienzo del héroe. En el servidor es un <canvas> vacío sobre un degradado CSS;
// en el navegador arranca la galaxia (Rust → WASM → WebGL2) y aparece con un fundido.
export default function Galaxy({ seed = 7 }) {
  let canvas = null
  onMount(() => {
    let stop = null
    let gone = false
    startGalaxy(canvas, { seed })
      .then((s) => {
        if (gone) return s()
        stop = s
        canvas.classList.add('is-live')
      })
      .catch((err) => console.warn('[verx] galaxia desactivada:', err))
    return () => {
      gone = true
      stop?.()
    }
  })
  return <canvas class="galaxy" aria-hidden="true" ref={(el) => (canvas = el)} />
}
