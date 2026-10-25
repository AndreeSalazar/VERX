// Bucle de render responsable: sólo dibuja cuando el lienzo está en pantalla y
// la pestaña visible, respeta prefers-reduced-motion (un solo frame) y mide el
// tiempo por frame para que la escena pueda bajar la calidad si va justa.

export const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export function createLoop(canvas, frame, { onSlow, slowMs = 24 } = {}) {
  let raf = 0
  let last = 0
  let visible = true
  let running = false
  let samples = 0
  let total = 0
  const reduced = prefersReducedMotion()

  const tick = (now) => {
    raf = 0
    const dt = last ? (now - last) / 1000 : 1 / 60
    last = now
    frame(dt, now / 1000)
    if (onSlow && samples < 90) {
      total += dt * 1000
      if (++samples === 90 && total / samples > slowMs) onSlow(total / samples)
    }
    schedule()
  }

  const schedule = () => {
    if (running && visible && !document.hidden && !reduced && raf === 0) raf = requestAnimationFrame(tick)
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) {
      last = 0
      schedule()
    }
  })
  io.observe(canvas)
  const onVisibility = () => {
    last = 0
    schedule()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    reduced,
    start() {
      running = true
      if (reduced) frame(0, 0) // un único frame quieto
      else schedule()
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    destroy() {
      this.stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
