// VERX Grafo · el servidor. Vive en el proceso de `verx dev` (que no se reinicia),
// así que la conexión con la ventana no se corta al guardar.
//
//   GET  /            la interfaz           GET  /data    el grafo con sus bloqueos
//   GET  /events      SSE en tiempo real    POST /check   revisa todas las reglas
//   GET  /file?path=  leer un archivo       POST /file    guardarlo
//
// Seguridad: puede escribir archivos, así que
//   · sólo escucha en 127.0.0.1;
//   · se entra con un token aleatorio (/entrar?token=…) que se cambia por una
//     cookie HttpOnly + SameSite=Strict: ninguna otra web puede usarla;
//   · las escrituras exigen además un Origin propio;
//   · sólo archivos de texto dentro del repo, fuera de node_modules/target/.git,
//     y si el archivo cambió en disco desde que se abrió, no se pisa (409).

import { existsSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { extname, relative, resolve, sep } from 'node:path'
import { HttpError, verx } from '@verx/server'
import { attachProblems, buildGraph } from './model.js'
import { runGuard } from './guard.js'

const COOKIE = 'verx_grafo'
export const ENTRY = '/entrar'
const UI = ['index.html', 'app.js', 'view.js', 'editor.js']
const EDITABLE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.rs', '.toml', '.json', '.md', '.css', '.html', '.sh', '.txt'])
const IGNORED = /(^|[\\/])(node_modules|target|dist|\.git)([\\/]|$)/
const MAX_BYTES = 512 * 1024

export const newToken = () => randomBytes(24).toString('base64url')
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)
const same = (a, b) => {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && timingSafeEqual(x, y)
}

// Ruta relativa del repo → absoluta, o error si no se puede tocar.
export function safePath(root, rel) {
  if (typeof rel !== 'string' || rel === '' || rel.includes('\0')) throw new HttpError(400, 'Ruta inválida')
  const full = resolve(root, rel)
  if (!full.startsWith(resolve(root) + sep)) throw new HttpError(400, 'Fuera del repositorio')
  if (IGNORED.test(relative(root, full))) throw new HttpError(400, 'Carpeta no editable')
  if (!EDITABLE.has(extname(full).toLowerCase())) throw new HttpError(400, 'Sólo archivos de texto')
  return full
}

export function createGraphApp({ root, token }) {
  root = resolve(root)
  let graph = buildGraph(root)
  let report = null
  let checking = false
  let pending = null
  const clients = new Set()
  const encoder = new TextEncoder()

  const snapshot = () => ({
    ...graph,
    problems: attachProblems(graph, report),
    status: { checking, ok: report?.ok ?? null, quick: report?.quick ?? true, error: report?.error ?? null, at: Date.now() },
  })
  const broadcast = () => {
    const data = encoder.encode(`data: ${JSON.stringify(snapshot())}\n\n`)
    for (const c of clients) {
      try {
        c.enqueue(data)
      } catch {
        clients.delete(c)
      }
    }
  }
  // Una revisión a la vez; si llegan cambios mientras tanto, se repite al acabar.
  const check = async (quick = true) => {
    if (checking) {
      pending = pending === false ? false : quick
      return
    }
    checking = true
    broadcast()
    report = await runGuard(root, { quick })
    checking = false
    broadcast()
    if (pending !== null) {
      const next = pending
      pending = null
      check(next)
    }
  }
  const refresh = () => {
    graph = buildGraph(root)
    broadcast()
    check(true)
  }

  const app = verx({ bodyLimit: MAX_BYTES + 4096 })
  app.use((ctx) => {
    if (ctx.path === ENTRY) {
      if (!same(ctx.query.token, token)) throw new HttpError(403, 'Token inválido')
      return ctx.cookie(COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' }).redirect('/', 303)
    }
    if (!same(ctx.cookies[COOKIE], token)) throw new HttpError(403, 'VERX Grafo: entra con el enlace que muestra `verx dev`')
    if (ctx.method !== 'GET' && ctx.header('origin') !== new URL(ctx.req.url).origin) throw new HttpError(403, 'Origen no permitido')
  })
  for (const file of UI) {
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'
    app.get(file === 'index.html' ? '/' : `/${file}`, () => new Response(readFileSync(new URL(`./ui/${file}`, import.meta.url)), { headers: { 'content-type': type, 'cache-control': 'no-store' } }))
  }
  app.get('/data', (ctx) => ctx.json(snapshot()))
  app.get('/events', (ctx) => {
    ctx.server?.timeout(ctx.req, 0)
    let controller
    const body = new ReadableStream({
      start(c) {
        controller = c
        clients.add(c)
        c.enqueue(encoder.encode(`retry: 1000\ndata: ${JSON.stringify(snapshot())}\n\n`))
      },
      cancel() {
        clients.delete(controller)
      },
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
  })
  app.get('/file', (ctx) => {
    const full = safePath(root, ctx.query.path)
    if (!existsSync(full) || statSync(full).size > MAX_BYTES) throw new HttpError(404, 'No existe o es demasiado grande')
    const text = readFileSync(full, 'utf8')
    return ctx.json({ path: ctx.query.path, text, hash: hash(text) })
  })
  app.post('/file', async (ctx) => {
    const { path, text, hash: base } = (await ctx.body()) ?? {}
    const full = safePath(root, path)
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new HttpError(400, 'Contenido inválido')
    if (existsSync(full) && base !== hash(readFileSync(full, 'utf8'))) {
      return ctx.status(409).json({ error: 'El archivo cambió en disco desde que lo abriste: vuelve a abrirlo' })
    }
    writeFileSync(full, text)
    return ctx.json({ ok: true, hash: hash(text) })
  })
  app.post('/check', (ctx) => {
    check(false)
    return ctx.status(202).json({ ok: true })
  })

  return { app, refresh, check, snapshot, clients }
}

// Arranca el grafo: servidor en 127.0.0.1, vigila el repo entero y revisa al cambiar.
export async function startGraph({ root, port = 3001, token = newToken() }) {
  const graph = createGraphApp({ root, token })
  const server = await graph.app.listen(port, { hostname: '127.0.0.1', log: false })
  let timer = null
  const watcher = watch(resolve(root), { recursive: true }, (_, file) => {
    if (!file || IGNORED.test(file)) return
    clearTimeout(timer)
    timer = setTimeout(graph.refresh, 250)
  })
  // Primero lo rápido; después, todas las reglas (presupuesto incluido).
  graph.check(true).then(() => graph.check(false))
  const url = `http://127.0.0.1:${server.port}${ENTRY}?token=${token}`
  return {
    url,
    close() {
      watcher.close()
      return graph.app.close()
    },
  }
}
