// Prueba el sitio de punta a punta tal como lo sirve `verx start`.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { createKit } from '@verx/kit'
import { docs } from '../lib/docs.js'
import { encodePointer, decodeServer } from '../lib/galaxy-protocol.js'

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
  expect(page.match(/<verx-island/g)).toHaveLength(3) // Galaxy + Counter + CopyButton
  expect(page).toContain('<title>VERX · Rápido por diseño</title>')
})

test('el héroe 3D: la galaxia carga ya y su .wasm se sirve como application/wasm, inmutable', async () => {
  const page = await (await html('/')).text()
  const src = page.match(/<verx-island data-src="([^"]+)" data-export="default" data-load="load"/)?.[1]
  expect(src).toMatch(/^\/_verx\/Galaxy-\w+\.js$/)
  const code = await (await fetch(base + src)).text()
  const wasm = code.match(/\/_verx\/sim-\w+\.wasm/)?.[0]
  expect(wasm).toBeTruthy()
  const r = await fetch(base + wasm)
  expect(r.headers.get('content-type')).toBe('application/wasm')
  expect(r.headers.get('cache-control')).toContain('immutable')
  expect(WebAssembly.validate(await r.arrayBuffer())).toBe(true)
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
  expect(['MISS', 'HIT', 'STALE']).toContain(isr.headers.get('x-verx-cache'))
  const slash = await html('/docs/')
  expect(slash.status).toBe(308)
  expect(slash.headers.get('location')).toBe('/docs')
})

const until = async (check, ms = 3000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('tiempo agotado esperando el WebSocket')
    await Bun.sleep(10)
  }
}

const visitor = (url) =>
  new Promise((resolve) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    const msgs = []
    ws.onmessage = (e) => msgs.push(decodeServer(e.data))
    ws.onopen = () => resolve({ ws, msgs })
  })

test('galaxia multijugador: lo que mueve uno lo ve el otro', async () => {
  const url = base.replace('http', 'ws') + '/api/galaxia'
  const [a, b] = await Promise.all([visitor(url), visitor(url)])
  await until(() => a.msgs[0]?.type === 'welcome' && b.msgs[0]?.type === 'welcome')
  const idA = a.msgs[0].id
  a.ws.send(encodePointer([1.5, 0, -2]))
  const sees = () => b.msgs.some((m) => m?.type === 'snapshot' && m.cursors.some((c) => c.id === idA && Math.abs(c.x - 1.5) < 1e-6))
  await until(sees)
  expect(b.msgs.findLast((m) => m?.type === 'snapshot').online).toBeGreaterThanOrEqual(2)
  a.ws.close()
  b.ws.close()
})
