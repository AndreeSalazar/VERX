'use client'
import { onMount, signal } from '@verx/ui'
import { startGalaxy } from '../lib/galaxy-scene.js'

// Lienzo del héroe. En el servidor es un <canvas> vacío sobre un degradado CSS;
// en el navegador arranca la galaxia (Rust → WASM → WebGL2) y aparece con un
// fundido. Si hay más gente conectada, se ve cuánta y sus punteros como orbes.
export default function Galaxy({ seed = 7 }) {
  let canvas = null
  const online = signal(0)
  onMount(() => {
    let stop = null
    let gone = false
    startGalaxy(canvas, { seed, onOnline: (n) => online.set(n) })
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
  return (
    <>
      <canvas class="galaxy" aria-hidden="true" ref={(el) => (canvas = el)} />
      {() =>
        online() > 1 && (
          <p class="online" role="status">
            <span class="dot" /> {online} personas moviendo la galaxia ahora
          </p>
        )
      }
    </>
  )
}
