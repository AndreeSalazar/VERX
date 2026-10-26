// VERX Grafo para VS Code. Con `verx dev` corriendo:
//   · el grafo en un panel (el mismo de la ventana, dentro de un iframe);
//   · cada bloqueo del guardián en «Problemas», subrayado en su línea;
//   · la barra de estado siempre dice cómo va («VERX ✔» / «VERX ✖ 2»);
//   · «Abrir en VS Code» desde el grafo salta al archivo y la línea.
// Encuentra el grafo en .verx/grafo.json (lo escribe verx dev) y le habla sólo
// a 127.0.0.1 con su token. Sin dependencias: sólo la API de VS Code y Node.

const vscode = require('vscode')
const { join } = require('node:path')
const { randomBytes } = require('node:crypto')
const { readRuntime, createSSE, diagnosticsOf, summary } = require('./core.cjs')

const POLL_MS = 2000

function activate(context) {
  const folders = vscode.workspace.workspaceFolders ?? []
  const diagnostics = vscode.languages.createDiagnosticCollection('verx')
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  bar.command = 'verx.grafo'
  context.subscriptions.push(diagnostics, bar)

  let conn = null // { root, base, token, abort }
  let snapshot = null
  let panel = null
  let opened = false // ¿ya se abrió solo el panel en esta sesión de verx dev?

  const paint = () => {
    const s = summary(snapshot)
    bar.text = s.text
    bar.tooltip = s.tooltip
    bar.backgroundColor = s.bad ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined
    bar.show()
  }
  const wantsPanel = () => vscode.workspace.getConfiguration('verx').get('abrirGrafo', true)

  // ── Diagnósticos ──────────────────────────────────────────────────────────
  function update(next) {
    const before = snapshot?.problems?.length ?? 0
    snapshot = next
    diagnostics.clear()
    for (const [file, list] of diagnosticsOf(next.problems)) {
      const items = list.map((d) => {
        const range = new vscode.Range(d.line, 0, d.line, Number.MAX_SAFE_INTEGER)
        const diag = new vscode.Diagnostic(range, d.message, vscode.DiagnosticSeverity.Error)
        diag.source = 'VERX'
        diag.code = d.code
        return diag
      })
      diagnostics.set(vscode.Uri.file(join(conn.root, file)), items)
    }
    paint()
    // Un bloqueo nuevo: el grafo se asoma (sin quitarte el foco del editor).
    if (wantsPanel() && before === 0 && next.problems.length > 0 && !next.status?.checking) showPanel(true)
  }

  // ── Conexión con el grafo (SSE) ───────────────────────────────────────────
  async function connect(root, info) {
    const abort = new AbortController()
    conn = { root, base: info.base, token: info.token, abort }
    try {
      const r = await fetch(`${info.base}/events`, { headers: { 'x-verx-token': info.token }, signal: abort.signal })
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
      if (panel) panel.webview.html = page(info.base, info.token) // verx dev nuevo, token nuevo
      if (wantsPanel() && !opened) {
        opened = true
        showPanel(true)
      }
      const feed = createSSE((event, data) => {
        if (event === 'message') update(JSON.parse(data))
        else if (event === 'focus') {
          const { node, line } = JSON.parse(data)
          showPanel(true)
          if (/\.[a-z0-9]+$/i.test(node)) openFile(node, line)
        }
      })
      const decoder = new TextDecoder()
      for await (const chunk of r.body) feed(decoder.decode(chunk, { stream: true }))
    } catch {
      // verx dev se cerró o se reinició: se reintenta con el siguiente sondeo
    }
    if (conn?.abort === abort) disconnect()
  }
  function disconnect() {
    conn?.abort.abort()
    conn = null
    snapshot = null
    opened = false
    diagnostics.clear()
    paint()
  }
  function poll() {
    for (const f of folders) {
      const info = readRuntime(f.uri.fsPath)
      if (!info) continue
      if (conn && conn.base === info.base && conn.token === info.token) return
      if (conn) disconnect()
      connect(f.uri.fsPath, info)
      return
    }
    if (conn) disconnect()
  }

  // ── Abrir archivos ────────────────────────────────────────────────────────
  async function openFile(path, line) {
    if (!conn) return
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(conn.root, path)))
    const at = new vscode.Position(Math.max(0, (line || 1) - 1), 0)
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(at, at) })
  }

  // ── El panel: el grafo de siempre, en un iframe con el token en el #hash ──
  function showPanel(preserveFocus = false) {
    if (!conn) return
    if (panel) return panel.reveal(undefined, preserveFocus)
    panel = vscode.window.createWebviewPanel('verxGrafo', 'VERX Grafo', { viewColumn: vscode.ViewColumn.Beside, preserveFocus }, { enableScripts: true, retainContextWhenHidden: true })
    panel.iconPath = new vscode.ThemeIcon('type-hierarchy')
    panel.webview.html = page(conn.base, conn.token)
    panel.webview.onDidReceiveMessage((m) => {
      if (m?.verx === 'abrir' && typeof m.path === 'string') openFile(m.path, Number(m.line) || 1)
    })
    panel.onDidDispose(() => (panel = null))
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('verx.grafo', () => (conn ? showPanel() : vscode.commands.executeCommand('verx.dev'))),
    vscode.commands.registerCommand('verx.dev', () => {
      const t = vscode.window.createTerminal({ name: 'verx dev', cwd: folders[0]?.uri })
      t.show()
      t.sendText('bun run dev')
    }),
    vscode.commands.registerCommand('verx.enGrafo', async () => {
      const doc = vscode.window.activeTextEditor?.document
      if (!conn || !doc) return
      const path = vscode.workspace.asRelativePath(doc.uri, false).replaceAll('\\', '/')
      const line = (vscode.window.activeTextEditor.selection.active.line ?? 0) + 1
      showPanel()
      await fetch(`${conn.base}/enfocar`, { method: 'POST', headers: { 'x-verx-token': conn.token }, body: JSON.stringify({ node: path, line }) }).catch(() => {})
    }),
  )

  paint()
  poll()
  const timer = setInterval(poll, POLL_MS)
  context.subscriptions.push({ dispose: () => (clearInterval(timer), disconnect()) })
}

// El webview sólo puede enmarcar el grafo local, y sólo reenvía «abrir archivo».
function page(base, token) {
  const nonce = randomBytes(16).toString('base64')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${base}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; border: 0; overflow: hidden; background: #04040a; }</style>
</head>
<body>
<iframe src="${base}/#token=${encodeURIComponent(token)}" title="VERX Grafo"></iframe>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi()
  window.addEventListener('message', (e) => {
    if (e.origin === ${JSON.stringify(base)} && e.data && e.data.verx === 'abrir') vscode.postMessage(e.data)
  })
</script>
</body>
</html>`
}

function deactivate() {}

module.exports = { activate, deactivate }
