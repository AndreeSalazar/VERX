import { test, expect, beforeAll, afterAll } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createKit } from '../src/index.js'
import { exportVercel } from '../src/vercel.js'
import { routeRegex, vercelConfig, FUNCTION } from '../src/vercel-routes.js'

test('routeRegex: parámetros, comodines y barra final opcional', () => {
  const re = (path) => new RegExp(routeRegex(path))
  expect(routeRegex('/')).toBe('^/$')
  expect(re('/blog/:slug').test('/blog/hola')).toBe(true)
  expect(re('/blog/:slug').test('/blog/hola/')).toBe(true)
  expect(re('/blog/:slug').test('/blog/a/b')).toBe(false)
  expect(re('/docs/*path').test('/docs/a/b')).toBe(true)
  expect(re('/a.b').test('/axb')).toBe(false)
})

test('vercelConfig: escrituras antes de los archivos, lecturas después y la 404 al final', () => {
  const { config, skipped, usesFunction } = vercelConfig({
    pages: [{ path: '/' }, { path: '/contacto' }, { path: '/blog/hola' }],
    statics: [{ path: '/api/buscar', type: 'application/x-verx-search' }],
    immutable: ['/_verx/*', '/styles.abc.css'],
    headers: [['x-frame-options', 'DENY']],
    dynamic: ['GET /blog/:slug', 'POST /contacto'],
    apis: ['WS /api/galaxia', 'GET /api/posts', 'POST /api/posts'],
  })
  const { routes } = config
  const at = (pred) => routes.findIndex(pred)
  const fs = at((r) => r.handle === 'filesystem')
  expect(config.version).toBe(3)
  expect(routes[0]).toMatchObject({ status: 308 })
  expect(at((r) => r.src === '^/contacto/?$' && r.methods?.[0] === 'POST')).toBeLessThan(fs)
  expect(routes.find((r) => r.src === '^/api/posts/?$' && r.methods.includes('POST')).dest).toBe(FUNCTION)
  expect(at((r) => r.src === '^/blog/([^/]+)/?$')).toBeGreaterThan(fs)
  expect(routes.at(-1)).toEqual({ src: '^/.*$', status: 404, dest: '/404.html' })
  expect(skipped).toEqual(['WS /api/galaxia'])
  expect(usesFunction).toBe(true)

  const cache = new RegExp(routes.find((r) => r.headers?.['cache-control']).src)
  expect(cache.test('/_verx/runtime-x.js')).toBe(true)
  expect(cache.test('/styles.abc.css')).toBe(true)
  expect(cache.test('/stylesXabc.css')).toBe(false)
  expect(routes.find((r) => r.continue && r.headers['x-frame-options'])).toBeTruthy()

  expect(config.overrides).toEqual({
    'contacto/index.html': { path: 'contacto' },
    'blog/hola/index.html': { path: 'blog/hola' },
    'api/buscar': { contentType: 'application/x-verx-search' },
  })
})

test('vercelConfig: un sitio sin nada dinámico no necesita función', () => {
  expect(vercelConfig({ pages: [{ path: '/' }] }).usesFunction).toBe(false)
})

// La exportación completa del sitio de prueba, en una carpeta fuera del repo:
// así la función sólo encuentra los paquetes que lleva dentro.
const root = fileURLToPath(new URL('./fixtures/basic/', import.meta.url))
let out
let r
beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'verx-vercel-'))
  r = await exportVercel(await createKit({ root }), out)
})
afterAll(() => rmSync(out, { recursive: true, force: true }))

test('exportVercel: static/ sin .br ni _headers, config.json y la función de Bun', () => {
  const statics = join(out, 'static')
  expect(existsSync(join(statics, 'index.html'))).toBe(true)
  expect(existsSync(join(statics, '404.html'))).toBe(true)
  expect(existsSync(join(statics, 'index.html.br'))).toBe(false)
  expect(existsSync(join(statics, '_headers'))).toBe(false)

  const config = JSON.parse(readFileSync(join(out, 'config.json'), 'utf8'))
  expect(config.routes.some((x) => x.handle === 'filesystem')).toBe(true)

  const fn = join(out, 'functions', '_verx.func')
  const vc = JSON.parse(readFileSync(join(fn, '.vc-config.json'), 'utf8'))
  expect(vc).toMatchObject({ runtime: 'bun1.x', handler: '_verx.js', launcherType: 'Nodejs' })
  expect(r.fn.packages).toEqual(expect.arrayContaining(['@verx/kit', '@verx/server', '@verx/ui', '@verx/compat', '@verx/img']))
  expect(existsSync(join(fn, 'node_modules', '@verx', 'kit', 'src', 'kit.js'))).toBe(true)
  expect(existsSync(join(fn, 'node_modules', '@verx', 'kit', 'test'))).toBe(false)
  expect(readFileSync(join(fn, 'app', 'page.jsx'), 'utf8')).toStartWith('/** @jsxImportSource @verx/ui */ ')
  // El cliente va ya empaquetado: la función no llama a Bun.build.
  const manifest = JSON.parse(readFileSync(join(fn, '_verx.json'), 'utf8'))
  expect(Object.keys(manifest.client.sources)).toEqual(['components/Clicker.jsx'])
  // …con las mismas URLs que los archivos de static/.
  for (const url of [manifest.client.runtime.src, ...Object.values(manifest.client.sources)]) expect(existsSync(join(statics, url))).toBe(true)
})

test('la función atiende lo dinámico y deja lo estático a la CDN', async () => {
  const { default: handler } = await import(pathToFileURL(join(out, 'functions', '_verx.func', '_verx.js')).href)
  const call = (path, init = {}) => handler.fetch(new Request('https://x.vercel.app' + path, { ...init, headers: { accept: 'text/html', ...init.headers } }))

  const item = await call('/items/7')
  expect(item.status).toBe(200)
  expect(await item.text()).toContain('item 7')
  const form = await call('/form', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=ana' })
  expect(await form.text()).toContain('eco: ana')
  expect(await (await call('/api/ping', { headers: { accept: 'application/json' } })).text()).toContain('pong')

  // Lo estático no pasa por la función (lo sirve la CDN): aquí es un 404.
  expect((await call('/')).status).toBe(404)
})
