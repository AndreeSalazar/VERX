// VERX Grafo: el modelo sobre un monorepo de juguete y la seguridad del servidor.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { attachProblems, buildGraph, findRepoRoot } from '../src/grafo/model.js'
import { createGraphApp, ENTRY } from '../src/grafo/server.js'

let root
let server
let base
let cookie
const token = 'token-de-prueba-123'

const files = {
  'package.json': JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }),
  'packages/a/package.json': JSON.stringify({ name: '@verx/a', dependencies: { '@verx/b': 'workspace:*' } }),
  'packages/a/src/index.js': "import { b } from '@verx/b'\nimport './util.js'\nexport const a = b\n",
  'packages/a/src/util.js': 'export const u = 1\n',
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
  const graph = createGraphApp({ root, token })
  server = await graph.app.listen(0, { hostname: '127.0.0.1', log: false })
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
  const r = await fetch(base + '/events', { headers: { cookie } })
  expect(r.headers.get('content-type')).toBe('text/event-stream')
  const reader = r.body.getReader()
  const { value } = await reader.read()
  const text = new TextDecoder().decode(value)
  expect(text).toMatch(/^retry: 1000\ndata: \{/)
  expect(JSON.parse(text.slice(text.indexOf('{'))).nodes.some((n) => n.id === 'crates/c')).toBe(true)
  await reader.cancel()
})
