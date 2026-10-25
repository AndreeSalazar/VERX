import { test, expect, beforeAll, afterAll } from 'bun:test'
import { readFileSync } from 'node:fs'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { verx, HttpError, HTML_MARK, compileJSON } from '../src/index.js'

const fixtures = new URL('./fixtures/public/', import.meta.url)
const page = (s) => ({ [HTML_MARK]: true, toString: () => s }) // lo que produce el JSX de @verx/ui

const app = verx({ headers: { 'x-content-type-options': 'nosniff' }, bodyLimit: 64 * 1024 })
app.static(fixtures)
app.prerender('/', () => page(`<!doctype html><link rel="stylesheet" href="${app.asset('/style.css')}"><h1>Hola</h1>${'<p>relleno</p>'.repeat(100)}`))
app.get('/hola', (ctx) => `¡Hola, ${ctx.query.nombre ?? 'mundo'}!`)
app.get('/html', () => page('<b>negrita</b>'))
app.get('/users/:id', { response: { type: 'object', properties: { id: { type: 'string' } } } }, (ctx) => ({ id: ctx.params.id, secreto: 'x' }))
app.get('/users/me', () => 'soy yo')
app.get('/files/*path', (ctx) => ctx.params.path)
app.post('/echo', async (ctx) => ({ recibido: await ctx.body() }))
app.get('/boom', () => {
  throw new Error('fallo interno')
})
app.get('/teapot', () => {
  throw new HttpError(418, 'Soy una tetera')
})
const auth = (ctx) => {
  if (ctx.header('authorization') !== 'Bearer ok') throw new HttpError(401)
}
app.get('/privado', auth, (ctx) => ctx.status(201).set('x-extra', '1').json({ ok: true }))
app.get('/cookie', (ctx) => ctx.cookie('a', '1').cookie('b', '2').text('ok'))
app.get('/vacio', () => undefined)

let base
beforeAll(async () => {
  const server = await app.listen(0, { log: false })
  base = server.url.href.replace(/\/$/, '')
})
afterAll(() => app.close())

const get = (path, init) => fetch(base + path, { redirect: 'manual', ...init })

test('texto plano, query y cabeceras por defecto', async () => {
  const r = await get('/hola?nombre=%3Cscript%3E')
  expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(r.headers.get('x-content-type-options')).toBe('nosniff')
  expect(await r.text()).toBe('¡Hola, <script>!')
})

test('objetos con marca HTML → text/html', async () => {
  const r = await get('/html')
  expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(await r.text()).toBe('<b>negrita</b>')
})

test('params, prioridad de rutas exactas y comodín con nombre', async () => {
  expect(await (await get('/users/me')).text()).toBe('soy yo')
  expect(await (await get('/files/a/b%20c.txt')).text()).toBe('a/b c.txt')
})

test('el esquema de respuesta filtra campos', async () => {
  expect(await (await get('/users/42')).json()).toEqual({ id: '42' })
})

test('barra final → 308 a la URL canónica', async () => {
  const r = await get('/hola/?x=1')
  expect(r.status).toBe(308)
  expect(r.headers.get('location')).toBe('/hola?x=1')
})

test('HEAD en rutas GET: cabeceras sin cuerpo', async () => {
  const r = await get('/users/42', { method: 'HEAD' })
  expect(r.status).toBe(200)
  expect(await r.text()).toBe('')
})

test('prerender: brotli, ETag, 304 y bytes exactos', async () => {
  const r = await get('/', { headers: { 'accept-encoding': 'br' }, decompress: false })
  expect(r.headers.get('content-encoding')).toBe('br')
  const html = brotliDecompressSync(Buffer.from(await r.arrayBuffer())).toString()
  expect(html).toContain('<h1>Hola</h1>')
  const again = await get('/', { headers: { 'accept-encoding': 'br', 'if-none-match': r.headers.get('etag') } })
  expect(again.status).toBe(304)
})

test('estáticos: gzip, sin comprimir y URL con huella immutable', async () => {
  const original = readFileSync(new URL('style.css', fixtures))
  const gz = await get('/style.css', { headers: { 'accept-encoding': 'gzip' }, decompress: false })
  expect(gz.headers.get('content-encoding')).toBe('gzip')
  expect(gunzipSync(Buffer.from(await gz.arrayBuffer()))).toEqual(original)
  const plain = await get('/style.css', { headers: { 'accept-encoding': 'identity' }, decompress: false })
  expect(Buffer.from(await plain.arrayBuffer())).toEqual(original)
  const hashed = app.asset('/style.css')
  expect(hashed).toMatch(/^\/style\.[0-9a-f]{10}\.css$/)
  expect((await get(hashed)).headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
})

test('cuerpo JSON, formulario y JSON roto', async () => {
  const json = await get('/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' })
  expect(await json.json()).toEqual({ recibido: { a: 1 } })
  const form = await get('/echo', { method: 'POST', body: new URLSearchParams({ b: '2' }) })
  expect(await form.json()).toEqual({ recibido: { b: '2' } })
  const bad = await get('/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{roto' })
  expect(bad.status).toBe(400)
})

test('cuerpo demasiado grande → 413', async () => {
  const r = await get('/echo', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x'.repeat(100 * 1024) })
  expect(r.status).toBe(413)
})

test('errores: 500 opaco, HttpError expuesto, JSON si se acepta', async () => {
  const boom = await get('/boom')
  expect(boom.status).toBe(500)
  expect(await boom.text()).toBe('Internal Server Error')
  const tea = await get('/teapot', { headers: { accept: 'application/json' } })
  expect(tea.status).toBe(418)
  expect(await tea.json()).toEqual({ error: 'Soy una tetera' })
})

test('middleware de ruta, status y cabeceras extra', async () => {
  expect((await get('/privado')).status).toBe(401)
  const ok = await get('/privado', { headers: { authorization: 'Bearer ok' } })
  expect(ok.status).toBe(201)
  expect(ok.headers.get('x-extra')).toBe('1')
})

test('varias cookies y respuesta vacía → 204', async () => {
  const r = await get('/cookie')
  expect(r.headers.getSetCookie()).toEqual(['a=1; Path=/; HttpOnly; SameSite=Lax', 'b=2; Path=/; HttpOnly; SameSite=Lax'])
  expect((await get('/vacio')).status).toBe(204)
})

test('404 para lo desconocido', async () => {
  expect((await get('/no/existe')).status).toBe(404)
})

test('compileJSON: proyección anidada idéntica a JSON.stringify', () => {
  const serialize = compileJSON({
    type: 'array',
    items: { type: 'object', properties: { id: { type: 'integer' }, author: { type: 'object', properties: { name: { type: 'string' } } } } },
  })
  const input = [{ id: 1, pass: 'x', author: { name: 'Ana', pass: 'y' } }, { id: 2, author: null }]
  expect(serialize(input)).toBe(JSON.stringify([{ id: 1, author: { name: 'Ana' } }, { id: 2, author: null }]))
})
