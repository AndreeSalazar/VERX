// @verx/compat/reveal · las transiciones con el scroll, para los navegadores
// sin `animation-timeline` (Firefox, Safari < 26). El kit sólo lo carga ahí.
//
// El contrato con el CSS del sitio:
//   · cada bloque que se anima lleva `--verx-reveal: 1` (una propiedad
//     registrada con @property y `inherits: false`, para que no la hereden
//     sus hijos), y su retraso en las rejillas en `--i` (0, 1, 2…);
//   · las animaciones de verdad siguen en un `@supports (animation-timeline…)`.
//
// Cada bloque pasa por tres estados: «debajo» (aún no ha entrado: oculto),
// «dentro» y «encima» (se fue por arriba: disuelto). IntersectionObserver
// avisa de los cambios y la Web Animations API hace la transición: no toca
// `transition` ni deja estilos puestos al terminar (las tarjetas conservan su
// :hover y no queda ningún filtro aplicado).

const TOP = 60 // la cabecera: lo que pasa por debajo ya cuenta como fuera
const BOTTOM = 40 // entra cuando asoma 40 px, no con el primer píxel
const DELAY = 90 // ms entre columnas de una rejilla (--i)

const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const SHOWN = { opacity: 1, filter: 'blur(0px)', transform: 'none', clipPath: 'inset(0% 0% round 0px)' }
const BELOW = { opacity: 0, filter: 'blur(6px)', transform: 'translateY(26px) scale(0.985)', clipPath: 'inset(0% 0% round 0px)' }
const ABOVE = { opacity: 0, filter: 'blur(5px)', transform: 'translateY(-16px) scale(0.985)', clipPath: 'inset(0% 0% round 0px)' }
// Las imágenes no suben: se destapan desde el centro (como `unveil` en el CSS).
const UNVEIL = { opacity: 0, filter: 'blur(4px)', transform: 'scale(1.06)', clipPath: 'inset(12% 10% round 18px)' }

/** ¿Le hace falta este respaldo al navegador? */
export function needs(win = globalThis) {
  return !win.CSS?.supports?.('animation-timeline: view()')
}

/** «debajo», «dentro» o «encima», según lo que cuenta IntersectionObserver. */
export function stateOf({ isIntersecting, boundingClientRect, rootBounds }) {
  if (isIntersecting) return 'dentro'
  return boundingClientRect.bottom <= (rootBounds?.top ?? TOP) ? 'encima' : 'debajo'
}

/** Los fotogramas para ir de `from` a `to` (null: no hay que animar). */
export function keyframes(from, to, image = false) {
  const look = { debajo: image ? UNVEIL : BELOW, dentro: SHOWN, encima: ABOVE }
  return from === to ? null : [look[from], look[to]]
}

/**
 * Pone en marcha el respaldo. Devuelve una función para pararlo, o null si no
 * hay nada que animar (o la persona pidió menos movimiento).
 */
export function start(doc = document, win = window) {
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
  const blocks = [...doc.querySelectorAll('main *, footer *')].filter((el) => win.getComputedStyle(el).getPropertyValue('--verx-reveal').trim() === '1')
  if (blocks.length === 0) return null

  const state = new Map()
  const running = new Map()
  const io = new win.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target
        const next = stateOf(entry)
        const prev = state.get(el)
        state.set(el, next)
        if (prev === undefined) {
          // Primera vez: lo que ya se ve se queda quieto; lo de debajo espera oculto.
          if (next !== 'dentro') running.set(el, el.animate([keyframes('dentro', next, el.tagName === 'IMG')[1]], { duration: 0, fill: 'forwards' }))
          continue
        }
        const frames = keyframes(prev, next, el.tagName === 'IMG')
        if (!frames) continue
        running.get(el)?.cancel()
        const entering = next === 'dentro'
        const i = Number.parseFloat(win.getComputedStyle(el).getPropertyValue('--i')) || 0
        running.set(
          el,
          el.animate(frames, {
            duration: entering ? 800 : 450,
            delay: entering && prev === 'debajo' ? i * DELAY : 0,
            easing: EASE,
            // Al entrar no queda nada puesto al acabar; oculto, sí se queda oculto.
            fill: entering ? 'backwards' : 'forwards',
          }),
        )
      }
    },
    { rootMargin: `-${TOP}px 0px -${BOTTOM}px 0px` },
  )
  for (const el of blocks) io.observe(el)
  return () => {
    io.disconnect()
    for (const a of running.values()) a.cancel()
  }
}

// Con ?verx-compat en la URL arranca aunque el navegador no lo necesite (para probarlo).
if (typeof document !== 'undefined' && (needs() || /[?&]verx-compat\b/.test(location.search))) start()
