// Prueba el sitio de punta a punta tal como lo sirve `veloz start`.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { createKit } from '@veloz/kit'
import { docs } from '../lib/docs.js'

const root = fileURLToPath(new URL('..', import.meta.url))
let kit
let base

beforeAll(async () => {
  kit = await createKit({ root })
  base = (await kit.listen(0, { log: false })).url.href.replace(/\/$/, '')
})
afterAll(() => kit.close())

const html = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init, headers: { accept: 'text/html', ...init.headers } })

test('todas las páginas públicas responden 200', async () => {
  const paths = ['/', '/docs', '/blog', '/isr', '/contacto', '/privacidad', ...docs.map((d) => `/docs/${d.slug}`), '/blog/de-node-a-bun']
  const statuses = await Promise.all(paths.map(async (p) => [p, (await html(p)).status]))
  expect(statuses.filter(([, s]) => s !== 200)).toEqual([])
})

test('inicio: islas sólo donde hay interacción, cabeceras de seguridad y brotli', async () => {
  const r = await html('/', { headers: { 'accept-encoding': 'br' } })
  expect(r.headers.get('x-content-type-options')).toBe('nosniff')
  const page = await r.text()
  expect(page.match(/<veloz-island/g)).toHaveLength(2) // Counter + CopyButton
  expect(page).toContain('<title>Veloz · Rápido por diseño</title>')
})

test('una página sin islas no manda ni un byte de JavaScript', async () => {
  const page = await (await html('/privacidad')).text()
  expect(page).not.toContain('<script type="module"')
  expect(page).not.toContain('modulepreload')
})

test('slugs de docs desconocidos: 404 sin renderizar (dynamicParams = false)', async () => {
  expect((await html('/docs/no-existe')).status).toBe(404)
})

test('la API no filtra campos internos', async () => {
  const list = await (await fetch(base + '/api/posts')).json()
  expect(list).toHaveLength(3)
  expect(JSON.stringify(list)).not.toContain('interno@ejemplo.com')
  const missing = await fetch(base + '/api/posts/99', { headers: { accept: 'application/json' } })
  expect(missing.status).toBe(404)
  expect(await missing.json()).toEqual({ error: 'No existe ese artículo' })
})

test('formulario de contacto: errores y éxito sin JavaScript', async () => {
  const bad = await (await html('/contacto', { method: 'POST', body: new URLSearchParams({ nombre: '', email: 'x', mensaje: 'hola' }) })).text()
  expect(bad).toContain('Dinos cómo te llamas.')
  expect(bad).toContain('Ese email no parece válido.')
  const ok = await (await html('/contacto', { method: 'POST', body: new URLSearchParams({ nombre: 'Ana', email: 'ana@ejemplo.com', mensaje: 'Hola, qué tal todo' }) })).text()
  expect(ok).toContain('¡Gracias, Ana!')
})

test('ISR y URL canónica sin barra final', async () => {
  const isr = await html('/isr')
  expect(['MISS', 'HIT', 'STALE']).toContain(isr.headers.get('x-veloz-cache'))
  const slash = await html('/docs/')
  expect(slash.status).toBe(308)
  expect(slash.headers.get('location')).toBe('/docs')
})
