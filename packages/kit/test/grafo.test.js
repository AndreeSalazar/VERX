// VERX Grafo: el modelo sobre un monorepo de juguete y la seguridad del servidor.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { attachProblems, buildGraph, findRepoRoot } from '../src/grafo/model.js'
import { createGraphApp, ENTRY, mergeReports, mergeSame } from '../src/grafo/server.js'
import { pinpoint, tidy } from '../src/grafo/blame.js'

let root
let server
let base
let cookie
let graphApp
let opens = 0
const token = 'token-de-prueba-123'
const SITE = 'http://localhost:3000'

const files = {
  'package.json': JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }),
  'packages/a/package.json': JSON.stringify({ name: '@verx/a', dependencies: { '@verx/b': 'workspace:*' } }),
  'packages/a/src/index.js': "import { b } from '@verx/b'\nimport './util.js'\nexport const a = b\n",
  'packages/a/src/util.js': 'export const u = 1\n',
  'packages/a/src/usa.js': "// usa util\nimport { uu } from './util.js'\nexport default uu\n",
  'packages/b/package.json': JSON.stringify({ name: '@verx/b' }),
  'packages/b/index.js': '#!/usr/bin/env bun\nexport const b = 2\n',
  'packages/b/node_modules/x/ignorado.js': 'export {}\n',
  'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: { '@verx/a': 'workspace:*' } }),
  'apps/web/app/page.jsx': "import { a } from '@verx/a'\nexport default () => <p>{a}</p>\n",
  'crates/Cargo.toml': '[workspace]\nmembers = ["c"]\n',
  'crates/c/Cargo.toml': '[package]\nname = "verx-c"\n\n[package.metadata.verx]\nbridge = "packages/b"\nwasm = "c.wasm"\n',
  'crates/c/src/lib.rs': 'pub mod abi;\n#[cfg(test)]\n#[path = "c_check.rs"]\nmod check;\n',
  'crates/c/src/abi.rs': '//! abi\n',
  'crates/c/src/c_check.rs': '//! tests\n',
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'verx-grafo-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  graphApp = createGraphApp({ root, token, appOrigins: [SITE], onOpen: () => opens++ })
  server = await graphApp.app.listen(0, { hostname: '127.0.0.1', log: false })
  base = `http://127.0.0.1:${server.port}`
})
afterAll(async () => {
  await server?.stop?.(true)
  rmSync(root, { recursive: true, force: true })
})

test('el modelo: mundos, espacios de trabajo, carpetas, archivos y aristas reales', () => {
  expect(findRepoRoot(join(root, 'apps', 'web'))).toBe(root)
  const g = buildGraph(root)
  const ids = new Set(g.nodes.map((n) => n.id))
  for (const id of ['@rust', '@bun', '@app', 'packages/a', 'packages/a/src', 'packages/a/src/index.js', 'crates/c', 'crates/c/src/lib.rs', 'apps/web/app/page.jsx']) {
    expect(ids.has(id)).toBe(true)
  }
  expect(ids.has('packages/b/node_modules/x/ignorado.js')).toBe(false)
  expect(g.nodes.find((n) => n.id === 'crates/c')).toMatchObject({ kind: 'workspace', world: 'rust', parent: '@rust' })
  const has = (from, to, kind) => g.edges.some((e) => e.from === from && e.to === to && e.kind === kind)
  expect(has('packages/a', 'packages/b', 'dep')).toBe(true)
  expect(has('crates/c', 'packages/b', 'bridge')).toBe(true)
  expect(has('packages/a/src/index.js', 'packages/a/src/util.js', 'import')).toBe(true)
  expect(has('packages/a/src/index.js', 'packages/b', 'import')).toBe(true)
  expect(has('apps/web/app/page.jsx', 'packages/a', 'import')).toBe(true)
  expect(has('crates/c/src/lib.rs', 'crates/c/src/abi.rs', 'import')).toBe(true)
  expect(has('crates/c/src/lib.rs', 'crates/c/src/c_check.rs', 'import')).toBe(true)
  expect(g.nodes.some((n) => n.broken)).toBe(false) // la línea #! no rompe el análisis
})

test('cada bloqueo cuelga del nodo más profundo que lo contiene', () => {
  const g = buildGraph(root)
  const report = {
    rules: [
      { id: 'sin-restos', title: 't', fix: 'f', problems: [{ file: 'packages/a/src/util.js', line: 1, message: 'debugger' }] },
      { id: 'presupuesto', title: 't', fix: 'f', problems: [{ file: 'apps/web /blog', line: null, message: 'pesa mucho' }] },
      { id: 'paquete-completo', title: 't', fix: 'f', problems: [{ file: 'packages/b', line: null, message: 'falta README.md' }] },
      { id: 'x', title: 't', fix: 'f', problems: [{ file: 'no/existe.js', line: null, message: '?' }] },
    ],
  }
  expect(attachProblems(g, report).map((p) => p.node)).toEqual(['packages/a/src/util.js', 'apps/web', 'packages/b', ''])
})

test('sin el token no se entra; con él, cookie HttpOnly y SameSite=Strict', async () => {
  expect((await fetch(base + '/data')).status).toBe(403)
  expect((await fetch(`${base}${ENTRY}?token=malo`, { redirect: 'manual' })).status).toBe(403)
  const r = await fetch(`${base}${ENTRY}?token=${token}`, { redirect: 'manual' })
  expect(r.status).toBe(303)
  const set = r.headers.get('set-cookie')
  expect(set).toContain('HttpOnly')
  expect(set).toContain('SameSite=Strict')
  cookie = set.split(';')[0]
  const data = await (await fetch(base + '/data', { headers: { cookie } })).json()
  expect(data.nodes.length).toBeGreaterThan(10)
  expect(data.status).toMatchObject({ checking: false })
})

const post = (body, headers = {}) =>
  fetch(base + '/file', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

test('editar: lee y guarda, pero nunca fuera del repo ni pisando cambios ajenos', async () => {
  const file = await (await fetch(`${base}/file?path=packages/a/src/util.js`, { headers: { cookie } })).json()
  expect(file.text).toBe('export const u = 1\n')
  // Otra web no puede escribir (Origin ajeno), aunque el navegador mandara la cookie.
  expect((await post({ path: 'packages/a/src/util.js', text: 'x', hash: file.hash }, { origin: 'http://malo.test' })).status).toBe(403)
  for (const path of ['../fuera.js', 'packages/b/node_modules/x/ignorado.js', 'packages/a/programa.exe', '']) {
    expect((await post({ path, text: 'x', hash: file.hash })).status).toBe(400)
  }
  const ok = await post({ path: 'packages/a/src/util.js', text: 'export const u = 2\n', hash: file.hash })
  expect(ok.status).toBe(200)
  expect(readFileSync(join(root, 'packages/a/src/util.js'), 'utf8')).toBe('export const u = 2\n')
  // Con el hash viejo: el archivo ya cambió → 409 y no se toca.
  expect((await post({ path: 'packages/a/src/util.js', text: 'pisado', hash: file.hash })).status).toBe(409)
  expect(readFileSync(join(root, 'packages/a/src/util.js'), 'utf8')).toBe('export const u = 2\n')
})

test('tiempo real: /events manda el grafo nada más conectar', async () => {
  const ctrl = new AbortController()
  const r = await fetch(base + '/events', { headers: { cookie }, signal: ctrl.signal })
  expect(r.headers.get('content-type')).toBe('text/event-stream')
  const reader = r.body.getReader()
  const { value } = await reader.read()
  const text = new TextDecoder().decode(value)
  expect(text).toMatch(/^retry: 1000\ndata: \{/)
  expect(JSON.parse(text.slice(text.indexOf('{'))).nodes.some((n) => n.id === 'crates/c')).toBe(true)
  // Cerrar la conexión (como al cerrar la ventana) la saca de la lista de clientes.
  expect(graphApp.clients.size).toBe(1)
  ctrl.abort()
  for (let i = 0; i < 40 && graphApp.clients.size > 0; i++) await Bun.sleep(10)
  expect(graphApp.clients.size).toBe(0)
})

test('el culpable: quien importa mal, en su línea, y con el nombre parecido', () => {
  const g = buildGraph(root)
  const raw = `\x1b[31mSyntaxError\x1b[0m: Export named 'uu' not found in module '${join(root, 'packages', 'a', 'src', 'util.js')}'.\n\nBun v1.3.14 (Windows x64)\nerror: script "budget" exited with code 1`
  expect(tidy(raw, root)).toBe("SyntaxError: Export named 'uu' not found in module 'packages/a/src/util.js'.")
  expect(pinpoint(raw, g, root)).toEqual({ file: 'packages/a/src/usa.js', line: 2, fix: '«uu» no existe en packages/a/src/util.js: ¿quisiste decir «u»?' })
  const missing = `Cannot find module './nada.js' from '${join(root, 'packages', 'a', 'src', 'usa.js')}'`
  // Se sabe quién importa, pero ninguna línea lo nombra: el archivo, sin inventar línea.
  expect(pinpoint(missing, g, root)).toEqual({ file: 'packages/a/src/usa.js', line: null, fix: '«./nada.js» no existe: revisa la ruta del import' })
  expect(pinpoint('at packages/a/src/index.js:3:7', g, root)).toEqual({ file: 'packages/a/src/index.js', line: 3 })
  expect(pinpoint('algo pasó', g, root)).toBe(null)
})

test('la revisión rápida conserva lo que sólo mide la completa; un error, un bloqueo', () => {
  const full = { quick: false, ok: false, rules: [{ id: 'presupuesto', skipped: false, problems: [{ file: 'apps/web', message: 'x' }] }, { id: 'lf', skipped: false, problems: [] }] }
  const quick = { quick: true, ok: true, rules: [{ id: 'presupuesto', skipped: true, problems: [] }, { id: 'lf', skipped: false, problems: [] }] }
  const merged = mergeReports(full, quick)
  expect(merged.ok).toBe(false)
  expect(merged.quick).toBe(false)
  expect(merged.rules[0]).toMatchObject({ id: 'presupuesto', stale: true, problems: [{ message: 'x' }] })
  expect(mergeReports(null, quick)).toBe(quick)
  const p = { node: 'a.js', line: 2, message: 'm' }
  expect(mergeSame([{ ...p, rule: 'arranque' }, { ...p, rule: 'presupuesto' }, { ...p, line: 3, rule: 'x' }]).map((x) => x.rule)).toEqual(['arranque · presupuesto', 'x'])
})

test('el sitio no arranca: el bloqueo cae en el archivo culpable y la ventana se abre sola', async () => {
  const before = opens
  const crash = `SyntaxError: Export named 'uu' not found in module '${join(root, 'packages', 'a', 'src', 'util.js')}'.`
  graphApp.setRuntime(crash)
  const [p] = graphApp.snapshot().problems.filter((x) => x.rule.includes('arranque'))
  expect(p).toMatchObject({ node: 'packages/a/src/usa.js', line: 2 })
  expect(opens).toBe(before + 1) // sin ventana abierta: la abre, ya en usa.js:2
  graphApp.setRuntime(null)
  graphApp.setRuntime(crash)
  expect(opens).toBe(before + 1) // el mismo fallo no la vuelve a abrir
  graphApp.setRuntime(null)
  expect(graphApp.snapshot().problems.some((x) => x.rule.includes('arranque'))).toBe(false)
})

test('una página que da 500 se cuenta por /fallo (con token) y señala la línea de la pila', async () => {
  const fallo = (headers, body) => fetch(base + '/fallo', { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(body) })
  const stack = `Error: boom\n    at Page (${join(root, 'packages', 'a', 'src', 'index.js')}:3:9)\n    at render (${join(root, 'packages', 'b', 'index.js')}:2:1)`
  expect((await fallo({}, { path: '/', message: stack })).status).toBe(403) // sin token, nadie
  expect((await fallo({ 'x-verx-token': token }, { path: '/' })).status).toBe(400)
  expect((await fallo({ 'x-verx-token': token }, { path: '/blog', message: stack })).status).toBe(200)
  const [p] = graphApp.snapshot().problems.filter((x) => x.rule.includes('render'))
  expect(p).toMatchObject({ node: 'packages/a/src/index.js', line: 3 })
  expect(p.message).toStartWith('/blog: Error: boom')
  graphApp.refresh() // al guardar algo, se olvida: si sigue roto, el sitio lo volverá a contar
  expect(graphApp.snapshot().problems.some((x) => x.rule.includes('render'))).toBe(false)
  // refresh() lanza el guardián en el repo de juguete: se espera a que acabe
  // (en Windows, un proceso vivo dentro de la carpeta impide borrarla).
  for (let i = 0; i < 200 && graphApp.snapshot().status.checking; i++) await Bun.sleep(50)
})

test('VS Code entra con la cabecera del token; el aviso, sólo desde el sitio', async () => {
  expect((await fetch(base + '/data', { headers: { 'x-verx-token': token } })).status).toBe(200)
  expect((await fetch(base + '/data', { headers: { 'x-verx-token': 'malo' } })).status).toBe(403)
  expect((await fetch(base + '/', {})).status).toBe(200) // la interfaz no tiene secretos; los datos sí
  const ok = await fetch(base + '/aviso', { headers: { origin: SITE } })
  expect(ok.headers.get('access-control-allow-origin')).toBe(SITE)
  const { version, problems } = await ok.json()
  expect(Array.isArray(problems)).toBe(true)
  // Sin cambios desde esa versión: 204 vacío (el aviso pregunta, no se queda escuchando).
  expect((await fetch(`${base}/aviso?v=${version}`, { headers: { origin: SITE } })).status).toBe(204)
  expect((await fetch(base + '/aviso', { headers: { origin: 'http://malo.test' } })).status).toBe(403)
  expect((await fetch(base + '/aviso.js')).headers.get('access-control-allow-origin')).toBe('*')
})

test('«ver en el grafo» desde el sitio: abre la ventana y la lleva al archivo', async () => {
  const focus = (origin) => fetch(base + '/enfocar', { method: 'POST', headers: { origin }, body: JSON.stringify({ node: 'packages/a/src/usa.js', line: 2 }) })
  expect((await focus('http://malo.test')).status).toBe(403)
  const before = opens
  const r = await focus(SITE)
  expect(await r.json()).toEqual({ ok: true, opened: true })
  expect(opens).toBe(before + 1)
  // La ventana que se abre recibe el foco nada más conectar.
  const ctrl = new AbortController()
  const events = await fetch(`${base}/events?token=${token}`, { signal: ctrl.signal })
  const reader = events.body.getReader()
  let text = ''
  while (!text.includes('event: focus')) text += new TextDecoder().decode((await reader.read()).value)
  expect(text).toContain('event: focus\ndata: {"node":"packages/a/src/usa.js","line":2}')
  ctrl.abort()
})

test('navegadores: cada carpeta suma lo que exigen sus archivos y dónde se pierde', async () => {
  const { browserMap, lacking, badge, section } = await import('../src/grafo/ui/browsers.js')
  const compat = {
    target: { chrome: '120', safari: '17', firefox: '128' },
    features: [
      { id: 'animaciones-con-scroll', title: 'Animaciones con scroll', policy: 'proteger', missing: ['safari', 'firefox'], respaldo: '@verx/compat/reveal' },
      { id: 'has', title: ':has()', policy: 'degrada', missing: [], respaldo: null },
    ],
    files: { 'apps/web/a.css': [['animaciones-con-scroll', 4, true], ['has', 9, false]], 'apps/web/b.css': [['has', 2, false]] },
  }
  const parents = { 'apps/web/a.css': 'apps/web', 'apps/web/b.css': 'apps/web', 'apps/web': '' }
  const ancestors = (id) => {
    const out = []
    for (let n = id; n !== undefined; n = parents[n]) out.push(n)
    return out
  }
  const map = browserMap(compat, ancestors)
  const web = map.get('apps/web')
  expect([...web.keys()]).toEqual(['animaciones-con-scroll', 'has'])
  expect(web.get('has').files.size).toBe(2)
  // Lo de a.css va protegido (y tiene respaldo): no cuenta como pérdida.
  expect(lacking(web, compat)).toEqual([])
  const unguarded = browserMap({ ...compat, files: { 'apps/web/c.css': [['animaciones-con-scroll', 1, false]] } }, () => ['apps/web/c.css'])
  expect(lacking(unguarded.get('apps/web/c.css'), compat)).toEqual(['safari', 'firefox'])
  expect(lacking(map.get('apps/web/b.css'), compat)).toEqual([])
  expect(badge(['safari', 'firefox'])).toBe('Safari · Firefox')
  const html = section(map.get('apps/web/a.css'), compat, (s) => String(s))
  expect(html).toContain('✔ falta en Safari 17, Firefox 128 · protegido')
  expect(html).toContain('↳ @verx/compat/reveal')
  expect(html).toContain('✔ en todos')
})
