// Runtime de islas en el navegador (~0.5 KB + el chunk compartido de @veloz/ui).
// Cada <veloz-island> trae su módulo, el export y las props; aquí sólo decidimos
// CUÁNDO cargarlo, como las directivas de Astro:
//   client:load    → en cuanto se pueda
//   client:idle    → cuando el navegador esté libre
//   client:visible → cuando entre en pantalla (por defecto)

import { mount } from '@veloz/ui'

const strategies = {
  load: (el, go) => go(),
  idle: (el, go) => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 200)),
  visible: (el, go) => {
    // <veloz-island> usa display:contents y no tiene caja: observamos su primer hijo.
    const target = el.firstElementChild
    if (!target) return go()
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          go()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(target)
  },
}

function hydrate(el) {
  const { src, export: name, load, props } = el.dataset
  const go = () =>
    import(src)
      .then((mod) => mount(mod[name], JSON.parse(props), el))
      .catch((err) => console.error('[veloz] no se pudo hidratar', src, err))
  ;(strategies[load] ?? strategies.visible)(el, go)
}

document.querySelectorAll('veloz-island').forEach(hydrate)
