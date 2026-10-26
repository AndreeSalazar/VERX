// @verx/compat/prefetch · la precarga al pasar el ratón, para los navegadores
// sin Speculation Rules (Safari, Firefox). El kit sólo lo carga ahí.
//
// Sigue las mismas reglas que document.js da a Chrome: enlaces de este mismo
// sitio, nunca /api/* ni los marcados con rel=nofollow. Precarga tras 65 ms
// encima del enlace (como `eagerness: moderate`), al tocarlo en una pantalla
// táctil o al llegar a él con el teclado, y sólo una vez cada página.
//
// Donde hay <link rel=prefetch> (Firefox) se usa ése; donde no (Safari), un
// fetch de baja prioridad que deja la página en la caché HTTP. Con «ahorro
// de datos» activado no precarga nada.

const HOVER = 65 // ms encima del enlace antes de precargar

/** La URL que hay que precargar para el enlace `a`, o null si no se debe. */
export function target(a, here) {
  if (!a?.href || a.hasAttribute?.('download') || /\bnofollow\b/.test(a.rel ?? '')) return null
  let url
  try {
    url = new URL(a.href, here)
  } catch {
    return null
  }
  const now = new URL(here)
  if (url.origin !== now.origin || !/^https?:$/.test(url.protocol) || url.pathname.startsWith('/api/')) return null
  url.hash = ''
  now.hash = ''
  return url.href === now.href ? null : url.href
}

/** ¿Le hace falta este respaldo al navegador? */
export function needs(win = globalThis) {
  return !win.HTMLScriptElement?.supports?.('speculationrules')
}

export function start(doc = document, win = window) {
  if (win.navigator?.connection?.saveData) return null
  const done = new Set()
  const link = doc.createElement('link').relList?.supports?.('prefetch')
  const load = (href) => {
    if (done.has(href)) return
    done.add(href)
    if (link) {
      const l = doc.createElement('link')
      l.rel = 'prefetch'
      l.href = href
      doc.head.append(l)
    } else {
      win.fetch(href, { credentials: 'same-origin', priority: 'low' }).catch(() => done.delete(href))
    }
  }
  const from = (e) => target(e.target?.closest?.('a[href]'), win.location.href)
  let timer = null
  const over = (e) => {
    const href = from(e)
    clearTimeout(timer)
    if (href) timer = setTimeout(() => load(href), HOVER)
  }
  const now = (e) => {
    const href = from(e)
    if (href) load(href)
  }
  const out = () => clearTimeout(timer)
  doc.addEventListener('pointerover', over, { passive: true })
  doc.addEventListener('pointerout', out, { passive: true })
  doc.addEventListener('touchstart', now, { passive: true })
  doc.addEventListener('focusin', now)
  return () => {
    clearTimeout(timer)
    doc.removeEventListener('pointerover', over)
    doc.removeEventListener('pointerout', out)
    doc.removeEventListener('touchstart', now)
    doc.removeEventListener('focusin', now)
  }
}

// Con ?verx-compat en la URL arranca aunque el navegador no lo necesite (para probarlo).
if (typeof document !== 'undefined' && (needs() || /[?&]verx-compat\b/.test(location.search))) start()
