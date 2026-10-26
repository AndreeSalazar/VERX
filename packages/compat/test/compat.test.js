// Los respaldos sin navegador: sus decisiones son funciones puras, y el
// arranque se prueba con un DOM de mentira (lo justo para seguir el rastro).
import { test, expect } from 'bun:test'
import { keyframes, needs as needsReveal, start as startReveal, stateOf } from '../src/reveal.js'
import { needs as needsPrefetch, start as startPrefetch, target } from '../src/prefetch.js'

const rect = (top, bottom) => ({ top, bottom })

test('cada bloque está debajo, dentro o encima de la pantalla', () => {
  const root = { top: 60, bottom: 772 }
  expect(stateOf({ isIntersecting: true, boundingClientRect: rect(300, 400), rootBounds: root })).toBe('dentro')
  expect(stateOf({ isIntersecting: false, boundingClientRect: rect(900, 1000), rootBounds: root })).toBe('debajo')
  expect(stateOf({ isIntersecting: false, boundingClientRect: rect(-200, 40), rootBounds: root })).toBe('encima')
})

test('los fotogramas: entrar sube, salir se disuelve, las imágenes se destapan', () => {
  expect(keyframes('dentro', 'dentro')).toBe(null)
  const [from, to] = keyframes('debajo', 'dentro')
  expect(from).toMatchObject({ opacity: 0, transform: 'translateY(26px) scale(0.985)' })
  expect(to).toMatchObject({ opacity: 1, transform: 'none', filter: 'blur(0px)' })
  expect(keyframes('dentro', 'encima')[1]).toMatchObject({ opacity: 0, transform: 'translateY(-16px) scale(0.985)' })
  expect(keyframes('debajo', 'dentro', true)[0].clipPath).toBe('inset(12% 10% round 18px)')
})

test('sólo hacen falta donde el navegador no lo tiene', () => {
  expect(needsReveal({ CSS: { supports: () => true } })).toBe(false)
  expect(needsReveal({ CSS: { supports: () => false } })).toBe(true)
  expect(needsReveal({})).toBe(true)
  expect(needsPrefetch({ HTMLScriptElement: { supports: (t) => t === 'speculationrules' } })).toBe(false)
  expect(needsPrefetch({ HTMLScriptElement: {} })).toBe(true)
})

test('qué enlaces se precargan: los del sitio, salvo /api, nofollow, descargas y la misma página', () => {
  const here = 'https://verx.test/docs/empezar#arriba'
  const a = (href, extra = {}) => ({ href, rel: '', hasAttribute: (n) => n in extra, ...extra })
  expect(target(a('https://verx.test/blog#x'), here)).toBe('https://verx.test/blog')
  expect(target(a('/docs/rutas'), here)).toBe('https://verx.test/docs/rutas')
  expect(target(a('https://otro.test/'), here)).toBe(null)
  expect(target(a('/api/galaxia'), here)).toBe(null)
  expect(target({ ...a('/blog'), rel: 'nofollow noopener' }, here)).toBe(null)
  expect(target(a('/informe.pdf', { download: '' }), here)).toBe(null)
  expect(target(a('/docs/empezar#otra'), here)).toBe(null)
  expect(target(a('mailto:hola@verx.test'), here)).toBe(null)
  expect(target(null, here)).toBe(null)
})

// Un DOM mínimo: elementos con estilo calculado y animate(), y un
// IntersectionObserver que se dispara a mano.
function fakePage(marked) {
  const calls = []
  let observer = null
  const els = marked.map(([tag, reveal, i]) => ({
    tagName: tag,
    style: { '--verx-reveal': reveal, '--i': String(i ?? 0) },
    animate(frames, opts) {
      const call = { el: this, frames, opts, cancelled: false, cancel: () => (call.cancelled = true) }
      calls.push(call)
      return call
    },
  }))
  const doc = { querySelectorAll: () => els }
  const win = {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (el) => ({ getPropertyValue: (p) => el.style[p] ?? '' }),
    IntersectionObserver: class {
      constructor(cb, opts) {
        this.cb = cb
        this.opts = opts
        this.seen = []
        observer = this
      }
      observe(el) {
        this.seen.push(el)
      }
      disconnect() {
        this.gone = true
      }
    },
  }
  const fire = (el, top, bottom, isIntersecting) => observer.cb([{ target: el, isIntersecting, boundingClientRect: rect(top, bottom), rootBounds: { top: 60, bottom: 772 } }])
  return { doc, win, els, calls, fire, observer: () => observer }
}

test('reveal: observa sólo lo marcado y anima al entrar y al salir', () => {
  const page = fakePage([['P', '1', 0], ['SPAN', '', 0], ['DIV', '1', 2]])
  const stop = startReveal(page.doc, page.win)
  const io = page.observer()
  expect(io.seen).toEqual([page.els[0], page.els[2]])
  expect(io.opts.rootMargin).toBe('-60px 0px -40px 0px')
  const [visible, , below] = page.els
  // Primera vez: lo visible se queda quieto; lo de debajo, oculto al instante.
  page.fire(visible, 100, 200, true)
  page.fire(below, 1200, 1300, false)
  expect(page.calls.length).toBe(1)
  expect(page.calls[0]).toMatchObject({ el: below, opts: { duration: 0, fill: 'forwards' } })
  // Entra con el retraso de su columna (--i = 2) y sin dejar nada puesto al final.
  page.fire(below, 500, 600, true)
  expect(page.calls[0].cancelled).toBe(true)
  expect(page.calls[1]).toMatchObject({ el: below, opts: { delay: 180, fill: 'backwards', duration: 800 } })
  // Se va por arriba: se disuelve y se queda oculto.
  page.fire(visible, -300, 20, false)
  expect(page.calls[2]).toMatchObject({ el: visible, opts: { delay: 0, fill: 'forwards' } })
  expect(page.calls[2].frames[1].opacity).toBe(0)
  stop()
  expect(io.gone).toBe(true)
})

test('reveal: con «reducir movimiento» o sin nada marcado, no arranca', () => {
  const page = fakePage([['P', '1']])
  expect(startReveal(page.doc, { ...page.win, matchMedia: () => ({ matches: true }) })).toBe(null)
  expect(startReveal(fakePage([['P', '']]).doc, page.win)).toBe(null)
})

test('prefetch: una sola vez por página, con <link> o con fetch, y nada con ahorro de datos', async () => {
  const listeners = {}
  const appended = []
  const fetched = []
  const anchor = { href: 'https://verx.test/blog', rel: '', hasAttribute: () => false }
  const doc = {
    createElement: () => ({ relList: { supports: () => false } }),
    head: { append: (l) => appended.push(l) },
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
  }
  const win = { location: { href: 'https://verx.test/' }, navigator: {}, fetch: (href, opts) => (fetched.push([href, opts.priority]), Promise.resolve()) }
  const stop = startPrefetch(doc, win)
  const event = { target: { closest: () => anchor } }
  listeners.touchstart(event)
  listeners.focusin(event)
  expect(fetched).toEqual([['https://verx.test/blog', 'low']]) // sin <link rel=prefetch> (Safari): fetch, y una sola vez
  listeners.pointerover({ target: { closest: () => ({ ...anchor, href: 'https://verx.test/docs' }) } })
  await Bun.sleep(90)
  expect(fetched.map(([h]) => h)).toEqual(['https://verx.test/blog', 'https://verx.test/docs'])
  stop()
  expect(Object.keys(listeners)).toEqual([])
  expect(startPrefetch(doc, { ...win, navigator: { connection: { saveData: true } } })).toBe(null)
})
