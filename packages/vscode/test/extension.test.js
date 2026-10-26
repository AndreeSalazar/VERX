// La extensión entera contra un grafo de mentira: un `vscode` simulado
// (mock.module) y un servidor SSE que habla el mismo protocolo que el de verx dev.
import { test, expect, mock, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const calls = { diagnostics: new Map(), panels: [], bar: null, opened: [], posts: [] }
class Range {
  constructor(a, b, c, d) {
    Object.assign(this, { a, b, c, d })
  }
}
const vscode = {
  StatusBarAlignment: { Left: 1 },
  ViewColumn: { One: 1, Beside: -2 },
  DiagnosticSeverity: { Error: 0 },
  Range,
  Position: class {
    constructor(line, ch) {
      Object.assign(this, { line, ch })
    }
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      Object.assign(this, { range, message, severity })
    }
  },
  ThemeColor: class {
    constructor(id) {
      this.id = id
    }
  },
  ThemeIcon: class {},
  Uri: { file: (p) => ({ fsPath: p, toString: () => p }) },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (_, d) => d }),
    openTextDocument: async (uri) => ({ uri }),
    asRelativePath: (uri) => uri.fsPath,
  },
  window: {
    createStatusBarItem: () => (calls.bar = { show() {}, dispose() {} }),
    createWebviewPanel: (...args) => {
      const panel = { args, webview: { html: '', onDidReceiveMessage: (fn) => (panel.onMessage = fn) }, reveal() {}, onDidDispose() {} }
      calls.panels.push(panel)
      return panel
    },
    showTextDocument: async (doc, opts) => calls.opened.push([doc.uri.fsPath, opts.selection]),
    createTerminal: () => ({ show() {}, sendText() {} }),
  },
  languages: {
    createDiagnosticCollection: () => ({
      clear: () => calls.diagnostics.clear(),
      set: (uri, items) => calls.diagnostics.set(uri.fsPath, items),
      dispose() {},
    }),
  },
  commands: { registerCommand: (id, fn) => ({ id, fn, dispose() {} }), executeCommand() {} },
}
mock.module('vscode', () => vscode)

const root = mkdtempSync(join(tmpdir(), 'verx-ext-'))
const token = 'token-de-prueba'
const snapshot = {
  problems: [{ rule: 'sin-restos', title: 'Sin restos', message: 'debugger', fix: 'quítalo', file: 'apps/web/a.js', line: 4, node: 'apps/web/a.js' }],
  status: { checking: false },
}
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  idleTimeout: 0,
  fetch(req) {
    if (req.headers.get('x-verx-token') !== token) return new Response('no', { status: 403 })
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`retry: 1000\ndata: ${JSON.stringify(snapshot)}\n\nevent: focus\ndata: {"node":"apps/web/a.js","line":4}\n\n`))
      },
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  },
})
mkdirSync(join(root, '.verx'))
writeFileSync(join(root, '.verx', 'grafo.json'), JSON.stringify({ base: `http://127.0.0.1:${server.port}`, token, pid: process.pid, root }))
vscode.workspace.workspaceFolders = [{ uri: { fsPath: root } }]

const context = { subscriptions: [] }
afterAll(() => {
  for (const s of context.subscriptions) s.dispose?.()
  server.stop(true)
  rmSync(root, { recursive: true, force: true })
})

test('conecta con el token, subraya el bloqueo, pinta la barra y abre el panel', async () => {
  const { activate } = await import('../src/extension.cjs')
  activate(context)
  for (let i = 0; i < 50 && calls.opened.length === 0; i++) await Bun.sleep(20)

  const file = join(root, 'apps/web/a.js')
  const [diag] = calls.diagnostics.get(file)
  expect(diag.range).toMatchObject({ a: 3, b: 0 }) // línea 4 → índice 3
  expect(diag).toMatchObject({ source: 'VERX', code: 'sin-restos', message: 'Sin restos\ndebugger\n→ quítalo' })
  expect(calls.bar.text).toBe('$(error) VERX 1')
  expect(calls.bar.backgroundColor.id).toBe('statusBarItem.errorBackground')

  // El panel enmarca el grafo local con el token en el #hash, y nada más.
  expect(calls.panels.length).toBe(1)
  const html = calls.panels[0].webview.html
  expect(html).toContain(`<iframe src="http://127.0.0.1:${server.port}/#token=${token}"`)
  expect(html).toContain(`frame-src http://127.0.0.1:${server.port};`)

  // «focus» del grafo (p. ej. desde el aviso del sitio) → abre el archivo en su línea.
  expect(calls.opened[0][0]).toBe(file)
  expect(calls.opened[0][1].a).toMatchObject({ line: 3 })

  // «Abrir en VS Code» dentro del panel llega como mensaje.
  calls.panels[0].onMessage({ verx: 'abrir', path: 'apps/web/b.js', line: 9 })
  await Bun.sleep(10)
  expect(calls.opened.at(-1)[0]).toBe(join(root, 'apps/web/b.js'))
})
