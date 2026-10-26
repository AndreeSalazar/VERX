// Prueba el sitio de punta a punta tal como lo sirve `verx start`.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { createKit } from '@verx/kit'
import { createSearch } from '@verx/search'
import { anchor, docs } from '../lib/docs.js'
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
  expect(page.match(/<verx-island/g)).toHaveLength(4) // Galaxy + Counter + CopyButton + el agujero negro
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

// El framework sigue mandando 0 KB por defecto (lo prueba @verx/kit); este sitio
// decide poner de fondo un agujero negro en la GPU. Nunca bloquea el primer pintado.
test('una página sin islas propias sólo carga el fondo, en idle, con el agujero CSS de respaldo', async () => {
  const page = await (await html('/privacidad')).text()
  const islands = [...page.matchAll(/<verx-island data-src="([^"]+)"[^>]*data-load="(\w+)"/g)].map((m) => [m[1].replace(/-\w+\.js$/, ""), m[2]])
  expect(islands).toEqual([['/_verx/BlackHoleGL', 'idle']])
  expect(page).toContain('<span class="bh-horizon"></span>')
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

test('en la web normal no existe la página de escritorio ni su enlace', async () => {
  expect((await html('/escritorio')).status).toBe(404)
  expect(await (await html('/')).text()).not.toContain('desktop-link')
})

test('buscador: índice estático de Rust, por secciones y con anclas que existen', async () => {
  const r = await fetch(base + '/api/buscar', { headers: { 'accept-encoding': 'br' } })
  expect(r.headers.get('content-type')).toBe('application/x-verx-search')
  expect(r.headers.get('content-encoding')).toBe('br')
  const search = await createSearch()
  const sections = docs.reduce((n, d) => n + d.sections.length, 0)
  expect(search.load(await r.arrayBuffer())).toBe(sections)
  expect(search.query('galaxia webgl')[0].href).toBe('/docs/rust-3d')
  const [hit] = search.query('estructura app')
  expect(hit).toMatchObject({ href: `/docs/empezar#${anchor('Estructura de una app')}`, parent: 'Empezar' })
  expect(await (await html('/docs/empezar')).text()).toContain(`id="${anchor('Estructura de una app')}"`)
  // Mientras escribes: prefijos y sin acentos.
  expect(search.query('exportaci').map((h) => h.href)).toContain('/docs/despliegue')
})

test('docs y blog salen de Markdown: código resaltado, índice de la página y sin JS para pintarlo', async () => {
  const page = await (await html('/docs/islas')).text()
  expect(page).toContain('<figure class="code"><figcaption>components/Counter.jsx</figcaption>')
  expect(page).toContain('<span class="t-kw">export</span>')
  // El índice «En esta página» sólo aparece con dos secciones o más.
  expect(page).not.toContain('class="on-page"')
  const rust3d = await (await html('/docs/rust-3d')).text()
  expect(rust3d).toMatch(/<nav class="on-page" aria-label="En esta página">.*href="#multijugador"/s)
  expect(page).toContain('min de lectura')
  const post = await (await html('/blog/de-node-a-bun')).text()
  expect(post).toContain('<p>La primera versión iba sobre <code>node:http</code>')
  // El HTML de los .md nunca trae HTML crudo: todo lo que parece una etiqueta se escapa.
  expect(page).not.toMatch(/<script(?! type="(module|speculationrules)")/)
})

test('portadas del blog: variantes de verx-img, la del artículo con prioridad y placeholder', async () => {
  const list = await (await html('/blog')).text()
  expect(list.match(/<img src="\/_verx\/img\/[\w-]+-800\.\w{10}\.jpg" srcset="[^"]+ 480w, [^"]+ 800w"/g)).toHaveLength(3)
  const post = await (await html('/blog/de-node-a-bun')).text()
  const cover = post.match(/<img [^>]*class="cover"[^>]*>/)?.[0] ?? ''
  expect(cover).toContain('width="1600" height="900"')
  expect(cover).toContain('alt="Un agujero negro de luz fría entre nubes azules y violetas"')
  expect(cover).toContain('fetchpriority="high"')
  expect(cover).toContain('url(&quot;data:image/svg+xml')
  // Las portadas son opacas: JPEG, y la más pequeña pesa muchísimo menos que el original.
  const small = await fetch(base + list.match(/srcset="(\S+) 480w/)[1])
  expect(small.headers.get('content-type')).toBe('image/jpeg')
  expect((await small.arrayBuffer()).byteLength).toBeLessThan(60_000)
})
