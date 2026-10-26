// La extensión de VS Code sin VS Code: el .vsix (un ZIP que se vuelve a leer
// aquí) y la parte pura (SSE, diagnósticos, barra de estado).
import { test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildVsix, crc32, zip } from '../src/vsix.js'
import core from '../src/core.cjs'

const decoder = new TextDecoder()

// Lector mínimo de ZIP «stored» a partir del directorio central.
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out = new Map()
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + view.getUint16(local + 26, true)
    const data = bytes.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    out.set(name, decoder.decode(data))
    at += 46 + nameLen
  }
  return out
}

test('CRC-32 con los vectores de siempre', () => {
  expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  expect(crc32(new Uint8Array())).toBe(0)
})

test('el ZIP se vuelve a leer igual (con nombres UTF-8)', () => {
  const files = unzip(zip([{ name: 'a.txt', data: 'hola' }, { name: 'carpeta/ñandú.json', data: '{"x":1}' }]))
  expect([...files]).toEqual([['a.txt', 'hola'], ['carpeta/ñandú.json', '{"x":1}']])
})

test('el .vsix lleva manifiesto, package.json de la extensión y su código', () => {
  const { name, bytes } = buildVsix(join(import.meta.dir, '..'))
  expect(name).toMatch(/^verx\.verx-grafo-\d+\.\d+\.\d+\.vsix$/)
  const files = unzip(bytes)
  expect([...files.keys()]).toEqual(['extension.vsixmanifest', '[Content_Types].xml', 'extension/package.json', 'extension/extension.cjs', 'extension/core.cjs', 'extension/README.md'])
  const ext = JSON.parse(files.get('extension/package.json'))
  expect(ext).toMatchObject({ name: 'verx-grafo', publisher: 'verx', main: './extension.cjs' })
  expect(ext.contributes.commands.map((c) => c.command)).toEqual(['verx.grafo', 'verx.enGrafo', 'verx.dev'])
  expect(files.get('extension.vsixmanifest')).toContain(`Version="${ext.version}" Publisher="verx"`)
  expect(files.get('extension/extension.cjs')).toContain("require('./core.cjs')")
})

test('SSE por trozos: eventos con nombre, varias líneas de datos y \\r\\n', () => {
  const seen = []
  const feed = core.createSSE((event, data) => seen.push([event, data]))
  feed('retry: 1000\nda')
  feed('ta: {"a":1}\n\nevent: focus\r\ndata: x\r\ndata: y\r\n\r\n: comentario\n\n')
  expect(seen).toEqual([['message', '{"a":1}'], ['focus', 'x\ny']])
})

test('los bloqueos de archivos son diagnósticos; los de carpetas, no', () => {
  const problems = [
    { rule: 'sin-restos', title: 'T', message: 'debugger', fix: 'quítalo', file: 'apps/web/a.js', line: 3 },
    { rule: 'tamano', title: 'T2', message: 'largo', fix: 'divide', file: 'apps/web/a.js', line: null },
    { rule: 'paquete-completo', title: 'T3', message: 'falta README', fix: 'añádelo', file: 'packages/x', line: null },
  ]
  const d = core.diagnosticsOf(problems)
  expect([...d.keys()]).toEqual(['apps/web/a.js'])
  expect(d.get('apps/web/a.js')).toEqual([
    { line: 2, code: 'sin-restos', message: 'T\ndebugger\n→ quítalo' },
    { line: 0, code: 'tamano', message: 'T2\nlargo\n→ divide' },
  ])
})

test('la barra de estado: sin dev, en orden y con bloqueos', () => {
  expect(core.summary(null)).toMatchObject({ bad: false, text: '$(debug-disconnect) VERX' })
  expect(core.summary({ problems: [], status: { checking: false } })).toMatchObject({ bad: false, text: '$(pass) VERX' })
  const s = core.summary({ problems: [{ rule: 'r', file: 'a.js', line: 2 }], status: { checking: true } })
  expect(s).toMatchObject({ bad: true, text: '$(error) VERX 1 $(sync~spin)' })
  expect(s.tooltip).toContain('r · a.js:2')
})

test('sólo se fía de un grafo vivo en 127.0.0.1', () => {
  const root = mkdtempSync(join(tmpdir(), 'verx-vscode-'))
  try {
    mkdirSync(join(root, '.verx'))
    const write = (info) => writeFileSync(join(root, core.RUNTIME), JSON.stringify(info))
    expect(core.readRuntime(root)).toBe(null) // sin archivo
    write({ base: 'http://127.0.0.1:3001', token: 't', pid: process.pid })
    expect(core.readRuntime(root)).toMatchObject({ base: 'http://127.0.0.1:3001', token: 't' })
    write({ base: 'http://malo.test:3001', token: 't', pid: process.pid })
    expect(core.readRuntime(root)).toBe(null) // el token no sale de esta máquina
    write({ base: 'http://127.0.0.1:3001', token: 't', pid: 2 ** 22 + 12345 })
    expect(core.readRuntime(root)).toBe(null) // verx dev ya no corre
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
