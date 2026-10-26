import { test, expect, beforeAll, afterAll } from 'bun:test'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKit, exportStatic, measureBudget, checkBudget } from '../src/index.js'
import { scanRoutes, fillPath } from '../src/scan.js'
import { mergeMetadata } from '../src/document.js'

const root = fileURLToPath(new URL('./fixtures/basic/', import.meta.url))
let kit
let base

beforeAll(async () => {
  kit = await createKit({ root })
  const server = await kit.listen(0, { log: false })
  base = server.url.href.replace(/\/$/, '')
})
afterAll(async () => {
  await kit.close()
  rmSync(join(root, 'dist'), { recursive: true, force: true })
})

const get = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init, headers: { accept: 'text/html', ...init.headers } })

test('scan: grupos sin segmento, carpetas privadas fuera, params y catch-all', () => {
  const { pages, apis } = scanRoutes(join(root, 'app'))
  const paths = pages.map((p) => p.path).sort()
  expect(paths).toEqual(['/', '/cached', '/form', '/galeria', '/inside', '/island', '/items/:id', '/live'])
  expect(apis.map((a) => a.path).sort()).toEqual(['/api/eco', '/api/indice', '/api/ping'])
  expect(pages.find((p) => p.path === '/inside').layouts).toHaveLength(1)
  expect(fillPath('/docs/*path', { path: 'a/b c' })).toBe('/docs/a/b%20c')
})

test('metadata: plantilla de título y absolute', () => {
  const layout = { title: { default: 'Sitio', template: '%s · Sitio' }, description: 'd' }
  expect(mergeMetadata([layout, { title: 'Blog' }]).title).toBe('Blog · Sitio')
  expect(mergeMetadata([layout]).title).toBe('Sitio')
  expect(mergeMetadata([layout, { title: { absolute: 'Solo' } }]).title).toBe('Solo')
})

test('página estática: layout, metadata, CSS con huella y cero JS', async () => {
  const html = await (await get('/')).text()
  expect(html).toContain('<div id="root"><h1>Inicio</h1></div>')
  expect(html).toContain('<title>Fixture</title>')
  expect(html).toMatch(/href="\/a\.[0-9a-f]{10}\.css"/)
  expect(html).toContain('type="speculationrules"')
  expect(html).not.toContain('<script type="module"')
})

test('generateStaticParams prerenderiza; otros params van por SSR y pueden dar 404', async () => {
  expect(kit.pages.map((p) => p.path)).toContain('/items/1')
  const one = await get('/items/1')
  expect(await one.text()).toContain('<title>Item 1 | Fixture</title>')
  expect(one.headers.get('etag')).toBeTruthy() // viene de la caché precomprimida
  expect(await (await get('/items/7')).text()).toContain('item 7')
  const missing = await get('/items/99')
  expect(missing.status).toBe(404)
})

test('force-dynamic lee searchParams en cada petición', async () => {
  expect(await (await get('/live?q=mundo')).text()).toContain('hola mundo')
})

test('ISR: MISS y luego HIT sin volver a renderizar', async () => {
  const a = await get('/cached')
  const b = await get('/cached')
  expect(a.headers.get('x-verx-cache')).toBe('MISS')
  expect(b.headers.get('x-verx-cache')).toBe('HIT')
  expect(b.headers.get('cache-control')).toContain('s-maxage=60')
  expect(await b.text()).toContain('render 1')
})

test('acciones de formulario: re-render con actionData y redirect()', async () => {
  const echo = await get('/form', { method: 'POST', body: new URLSearchParams({ name: 'Ana' }) })
  expect(await echo.text()).toContain('eco: Ana')
  const go = await get('/form', { method: 'POST', body: new URLSearchParams({ go: '1' }) })
  expect(go.status).toBe(303)
  expect(go.headers.get('location')).toBe('/')
})

test('islas: SSR + runtime + módulo inmutable', async () => {
  const html = await (await get('/island')).text()
  const src = html.match(/<verx-island data-src="([^"]+)" data-export="default" data-load="load"/)?.[1]
  expect(src).toMatch(/^\/_verx\/Clicker-\w+\.js$/)
  expect(html).toContain('<button>2</button>')
  expect(html).toMatch(/<script type="module" src="\/_verx\/runtime-\w+\.js"><\/script>/)
  const js = await get(src)
  expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  expect(js.headers.get('content-type')).toContain('javascript')
})

test('API, grupos de rutas y 404 dentro del layout', async () => {
  expect(await (await fetch(base + '/api/ping?q=1')).json()).toEqual({ pong: true, q: '1' })
  expect(await (await get('/inside')).text()).toContain('dentro del grupo')
  const nf = await get('/_private')
  expect(nf.status).toBe(404)
  expect(await nf.text()).toContain('<div id="root">')
})

test('GET force-static: una sola ejecución, servido desde memoria', async () => {
  const a = await get('/api/indice')
  expect(a.headers.get('content-type')).toBe('application/x-verx-test')
  expect([...new Uint8Array(await a.arrayBuffer())]).toEqual([86, 88, 83, 49, 1])
  const b = await get('/api/indice')
  expect([...new Uint8Array(await b.arrayBuffer())]).toEqual([86, 88, 83, 49, 1])
  expect(kit.apis).not.toContain('GET /api/indice')
})

test('exportación estática con precompresión y _headers', async () => {
  const r = await exportStatic(kit, 'dist')
  const dist = join(root, 'dist')
  expect(existsSync(join(dist, 'index.html'))).toBe(true)
  expect(existsSync(join(dist, 'items', '1', 'index.html'))).toBe(true)
  expect(existsSync(join(dist, '404.html'))).toBe(true)
  expect(readFileSync(join(dist, '_headers'), 'utf8')).toContain('/_verx/*')
  expect(r.needsServer).toEqual(expect.arrayContaining(['GET /items/:id', 'GET /live', 'POST /form', 'GET /api/ping']))
  // Las variantes de las imágenes también se exportan.
  expect(readdirSync(join(dist, '_verx', 'img')).sort()).toEqual([expect.stringMatching(/^foto-300\.\w{10}\.png$/), expect.stringMatching(/^foto-600\.\w{10}\.png$/)])
  expect([...readFileSync(join(dist, 'api', 'indice'))]).toEqual([86, 88, 83, 49, 1])
  expect(readFileSync(join(dist, '_headers'), 'utf8')).toContain('/api/indice\n  Content-Type: application/x-verx-test')
  expect(r.needsServer).not.toContain('GET /api/indice')
  expect(r.isr).toEqual(['/cached'])
})

test('presupuesto: mide el JS de cada página y detecta lo que se pasa', async () => {
  const report = await measureBudget(kit)
  const home = report.pages.find((p) => p.path === '/')
  const island = report.pages.find((p) => p.path === '/island')
  expect(home.bytes).toBe(0) // sin islas, cero JS
  expect(island.islands.map((i) => i.name)).toEqual(['Clicker'])
  expect(island.bytes).toBe(report.runtime + island.islands[0].bytes)
  expect(checkBudget(report, { page: 100_000, island: 100_000 })).toEqual([])
  expect(checkBudget(report, { page: 10, island: 10 }).map((p) => p.where)).toEqual(['/island', 'Clicker'])
})

test('route.js con export WS: WebSocket en tiempo real', async () => {
  const ws = new WebSocket(base.replace('http', 'ws') + '/api/eco')
  const received = []
  ws.addEventListener('message', (e) => received.push(e.data))
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  ws.send('hola')
  for (let i = 0; i < 50 && received.length < 2; i++) await Bun.sleep(10)
  expect(received).toEqual(['conectado', 'eco:hola'])
  expect(kit.apis).toContain('WS /api/eco')
  ws.close()
})

test('<Image>: variantes en /_verx/img, srcset, tamaño y placeholder sin JS', async () => {
  const html = await (await get('/galeria')).text()
  const img = html.match(/<img [^>]*>/)?.[0] ?? ''
  expect(img).toMatch(/src="\/_verx\/img\/foto-600\.\w{10}\.png"/)
  expect(img).toMatch(/srcset="\/_verx\/img\/foto-300\.\w{10}\.png 300w, \/_verx\/img\/foto-600\.\w{10}\.png 600w"/)
  expect(img).toContain('width="900" height="500"')
  expect(img).toContain('alt="Un degradado"')
  expect(img).toContain('loading="eager" fetchpriority="high"')
  expect(img).toMatch(/style="background:#[0-9a-f]{6} url\(&quot;data:image\/svg\+xml/)
  expect(html).toMatch(/900×500 · #[0-9a-f]{6}/)
  // La variante se sirve como PNG inmutable y mide lo que dice.
  const r = await get(img.match(/src="([^"]+)"/)[1])
  expect(r.headers.get('content-type')).toBe('image/png')
  expect(r.headers.get('cache-control')).toContain('immutable')
  const png = new Uint8Array(await r.arrayBuffer())
  expect(new DataView(png.buffer).getUint32(16)).toBe(600) // ancho en el IHDR
  expect((await get('/_verx/img/no-existe.png')).status).toBe(404)
  expect(kit.pages.map((p) => p.path)).toContain('/galeria')
})
