// VERX Grafo · el servidor. Vive en el proceso de `verx dev` (que no se reinicia),
// así que la conexión con la ventana no se corta al guardar.
//
//   GET  /            la interfaz           GET  /data    el grafo con sus bloqueos
//   GET  /events      SSE en tiempo real    POST /check   revisa todas las reglas
//   GET  /file?path=  leer un archivo       POST /file    guardarlo
//   GET  /aviso       los bloqueos, de sólo lectura, para el aviso del sitio (aviso.js)
//   POST /enfocar     el sitio pide enseñar un nodo (y abre la ventana si no hay)
//
// Seguridad: puede escribir archivos, así que
//   · sólo escucha en 127.0.0.1;
//   · se entra con un token aleatorio: /entrar?token=… lo cambia por una cookie
//     HttpOnly + SameSite=Strict (la ventana), o va en la cabecera x-verx-token
//     (el panel de VS Code, donde la cookie no viaja). Ninguna otra web lo tiene;
//   · las escrituras exigen además un Origin propio;
//   · sólo archivos de texto dentro del repo, fuera de node_modules/target/.git,
//     y si el archivo cambió en disco desde que se abrió, no se pisa (409);
//   · /aviso y /enfocar no llevan token, pero sólo responden al origen del sitio
//     en desarrollo, y no leen ni escriben archivos.

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { extname, join, relative, resolve, sep } from 'node:path'
import { HttpError, verx } from '@verx/server'
import { attachProblems, buildGraph } from './model.js'
import { runGuard } from './guard.js'

const COOKIE = 'verx_grafo'
export const ENTRY = '/entrar'
const UI = ['index.html', 'app.js', 'view.js', 'editor.js', 'browsers.js', 'aviso.js']
const PUBLIC = new Set(['/', ...UI.map((f) => `/${f}`), '/aviso', '/enfocar'])
const EDITABLE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.rs', '.toml', '.json', '.md', '.css', '.html', '.sh', '.txt'])
export const IGNORED = /(^|[\\/])(node_modules|target|dist|\.git|\.verx)([\\/]|$)/
const MAX_BYTES = 512 * 1024
// El archivo con el que otras herramientas (la extensión de VS Code) encuentran el grafo.
export const RUNTIME = join('.verx', 'grafo.json')

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

// Una revisión rápida no mide el presupuesto ni los imports: lo que se saltó se
// conserva de la última revisión completa (marcado `stale`) en vez de borrarse.
export function mergeReports(prev, next) {
  if (!next?.rules || !next.quick || !prev?.rules) return next
  const old = new Map(prev.rules.filter((r) => !r.skipped).map((r) => [r.id, r]))
  const rules = next.rules.map((r) => (r.skipped && old.has(r.id) ? { ...old.get(r.id), stale: true } : r))
  return { ...next, rules, ok: rules.every((r) => r.problems.length === 0), quick: rules.some((r) => r.skipped) }
}

// Un mismo error que tumba varias reglas (el sitio no arranca y el presupuesto
// no se puede medir) es un solo bloqueo: «arranque · presupuesto».
export function mergeSame(problems) {
  const out = new Map()
  for (const p of problems) {
    const key = `${p.node}|${p.line}|${p.message}`
    const prev = out.get(key)
    if (prev) prev.rule = `${prev.rule} · ${p.rule}`
    else out.set(key, { ...p })
  }
  return [...out.values()]
}

// `onOpen` abre una ventana del grafo; `autoOpen`: ¿se abre sola cuando algo falla?
export function createGraphApp({ root, token, appOrigins = [], onOpen = null, autoOpen = true }) {
  root = resolve(root)
  let graph = buildGraph(root)
  let report = null
  let runtime = null // { id: 'arranque', … } mientras el sitio no arranca
  let checking = false
  let pending = null
  let focus = null // un «enséñame esto» que espera a que se abra una ventana
  const clients = new Set()
  let version = 0 // sube con cada cambio: el aviso del sitio pregunta «¿hay algo nuevo?»
  const encoder = new TextEncoder()

  const failures = new Map() // ruta → error al renderizarla (lo cuenta el sitio por /fallo)
  const guided = new Set() // fallos que ya abrieron la ventana: no se abre otra vez por lo mismo
  const failing = () =>
    failures.size
      ? [{ id: 'render', title: 'Una página falla al renderizarse', fix: 'arregla el error y recarga la página', skipped: false, problems: [...failures].map(([path, message]) => ({ file: '', line: null, message: `${path}: ${message}` })) }]
      : []
  const problems = () => mergeSame(attachProblems(graph, { rules: [...(runtime ? [runtime] : []), ...failing(), ...(report?.rules ?? [])] }))
  const snapshot = () => {
    const list = problems()
    return {
      ...graph,
      problems: list,
      // Qué funciones del navegador usa cada archivo y dónde faltan (regla `navegadores`).
      compat: report?.compat ?? null,
      status: { checking, ok: report?.ok == null && !runtime ? null : list.length === 0, quick: report?.quick ?? true, error: report?.error ?? null, at: Date.now() },
    }
  }
  const send = (set, text) => {
    const data = encoder.encode(text)
    for (const c of set) {
      try {
        c.enqueue(data)
      } catch {
        set.delete(c)
      }
    }
  }
  const broadcast = () => {
    version++
    send(clients, `data: ${JSON.stringify(snapshot())}\n\n`)
  }
  // Una revisión a la vez; si llegan cambios mientras tanto, se repite al acabar.
  const check = async (quick = true) => {
    if (checking) {
      pending = pending === false ? false : quick
      return
    }
    checking = true
    broadcast()
    report = mergeReports(report, await runGuard(root, { quick }))
    checking = false
    // Si viene otra revisión detrás, no se anuncia un «terminado» a medias.
    if (pending !== null) {
      const next = pending
      pending = null
      return check(next)
    }
    broadcast()
  }
  // Tras un cambio: primero lo rápido y, en cuanto acaba, todas las reglas. Los
  // errores de render se olvidan: si sigue roto, la siguiente petición lo dirá.
  const refresh = () => {
    graph = buildGraph(root)
    failures.clear()
    broadcast()
    check(true)
    check(false)
  }
  // El sitio no arranca (lo cuenta dev.js con su error); null cuando vuelve.
  const setRuntime = (message) => {
    const next = message
      ? { id: 'arranque', title: 'El sitio no arranca (verx dev)', fix: 'arregla el error y guarda: el sitio se reinicia solo', skipped: false, problems: [{ file: '', line: null, message }] }
      : null
    if (JSON.stringify(next) === JSON.stringify(runtime)) return
    runtime = next
    broadcast()
    if (next) guide('arranque')
  }
  // Una página dio error al renderizarse (500): se apunta y se guía hasta él.
  const reportFailure = (path, message) => {
    if (failures.get(path) === message) return
    failures.set(path, message)
    broadcast()
    guide('render')
  }
  // Enseña un nodo en la ventana del grafo; si no hay ninguna, la abre (y se
  // lo enseña al conectar). Devuelve si hubo que abrirla.
  const focusOn = (next, { open = true } = {}) => {
    const opened = clients.size === 0 && open && onOpen !== null
    if (clients.size === 0) {
      focus = next
      if (opened) onOpen()
    } else send(clients, `event: focus\ndata: ${JSON.stringify(next)}\n\n`)
    return opened
  }
  // Algo falló (el arranque o un render): la ventana va directa al culpable,
  // una sola vez por fallo, y sólo se abre sola si no se pidió --sin-ventana.
  const guide = (rule) => {
    const p = problems().find((x) => x.rule.split(' · ').includes(rule))
    if (!p) return
    const key = `${p.node}|${p.line}|${p.message}`
    if (guided.has(key)) return
    guided.add(key)
    focusOn({ node: p.node, line: p.line }, { open: autoOpen })
  }
  // Un cliente SSE cuenta mientras su conexión siga abierta: al cerrar la
  // ventana, `req.signal` lo saca (si no, «¿hay ventana?» mentiría).
  const stream = (req, set, first, headers = {}) => {
    let controller
    const body = new ReadableStream({
      start(c) {
        controller = c
        set.add(c)
        c.enqueue(encoder.encode(`retry: 1000\n${first()}`))
        req.signal?.addEventListener('abort', () => set.delete(c), { once: true })
      },
      cancel() {
        set.delete(controller)
      },
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...headers } })
  }
  const fromApp = (origin) => origin != null && appOrigins.includes(origin)

  const app = verx({ bodyLimit: MAX_BYTES + 4096 })
  app.use((ctx) => {
    if (ctx.path === ENTRY) {
      if (!same(ctx.query.token, token)) throw new HttpError(403, 'Token inválido')
      return ctx.cookie(COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' }).redirect('/', 303)
    }
    if (PUBLIC.has(ctx.path)) return
    const given = [ctx.cookies[COOKIE], ctx.header('x-verx-token'), ctx.path === '/events' ? ctx.query.token : null]
    if (!given.some((t) => t && same(t, token))) throw new HttpError(403, 'VERX Grafo: entra con el enlace que muestra `verx dev`')
    if (ctx.method !== 'GET' && ctx.header('origin') !== new URL(ctx.req.url).origin) throw new HttpError(403, 'Origen no permitido')
  })
  for (const file of UI) {
    const headers = { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }
    // aviso.js lo carga el sitio desde otro origen: un <script type=module> necesita CORS.
    if (file === 'aviso.js') headers['access-control-allow-origin'] = '*'
    app.get(file === 'index.html' ? '/' : `/${file}`, () => new Response(readFileSync(new URL(`./ui/${file}`, import.meta.url)), { headers }))
  }
  app.get('/data', (ctx) => ctx.json(snapshot()))
  app.get('/events', (ctx) => {
    ctx.server?.timeout(ctx.req, 0)
    return stream(ctx.req, clients, () => {
      let text = `data: ${JSON.stringify(snapshot())}\n\n`
      if (focus) text += `event: focus\ndata: ${JSON.stringify(focus)}\n\n`
      focus = null
      return text
    })
  })
  // El aviso pregunta en vez de quedarse escuchando: el navegador sólo abre 6
  // conexiones por host, y un SSE por pestaña del sitio acabaría dejando sin
  // sitio a los guardados del editor. Sin cambios desde `?v=`, 204 vacío.
  app.get('/aviso', (ctx) => {
    const origin = ctx.header('origin')
    if (origin != null && !fromApp(origin)) throw new HttpError(403, 'Origen no permitido')
    if (origin) ctx.set('access-control-allow-origin', origin).set('vary', 'origin')
    if (Number(ctx.query.v) === version) return ctx.status(204).send('')
    return ctx.json({ version, root, checking, problems: problems() })
  })
  // Cuerpo en texto plano (petición «simple»: sin preflight); Origin del sitio obligatorio.
  app.post('/enfocar', async (ctx) => {
    const origin = ctx.header('origin')
    const trusted = same(ctx.header('x-verx-token'), token) // VS Code, con el token
    if (!trusted && !fromApp(origin) && origin !== new URL(ctx.req.url).origin) throw new HttpError(403, 'Origen no permitido')
    let target
    try {
      target = JSON.parse(await ctx.req.text())
    } catch {
      throw new HttpError(400, 'JSON inválido')
    }
    const opened = focusOn({ node: String(target?.node ?? ''), line: Number(target?.line) || null })
    if (origin) ctx.set('access-control-allow-origin', origin)
    return ctx.json({ ok: true, opened })
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
  // El sitio (kit.js, en desarrollo) cuenta aquí cada página que da error 500.
  app.post('/fallo', async (ctx) => {
    const { path, message } = (await ctx.body()) ?? {}
    if (typeof path !== 'string' || typeof message !== 'string') throw new HttpError(400, 'Hace falta { path, message }')
    reportFailure(path.slice(0, 300), message.slice(0, 4000))
    return ctx.json({ ok: true })
  })
  app.post('/check', (ctx) => {
    check(false)
    return ctx.status(202).json({ ok: true })
  })

  return { app, refresh, check, snapshot, setRuntime, reportFailure, focusOn, clients }
}

// Arranca el grafo: servidor en 127.0.0.1, vigila el repo entero y revisa al cambiar.
// Deja su dirección y su token en .verx/grafo.json (fuera de git) para VS Code.
export async function startGraph({ root, port = 3001, token = newToken(), appOrigins = [], onOpen = null, autoOpen = true }) {
  root = resolve(root)
  const graph = createGraphApp({ root, token, appOrigins, onOpen, autoOpen })
  const server = await graph.app.listen(port, { hostname: '127.0.0.1', log: false })
  let timer = null
  const watcher = watch(root, { recursive: true }, (_, file) => {
    if (!file || IGNORED.test(file)) return
    clearTimeout(timer)
    timer = setTimeout(graph.refresh, 250)
  })
  // Primero lo rápido; después, todas las reglas (presupuesto incluido).
  graph.check(true).then(() => graph.check(false))
  const base = `http://127.0.0.1:${server.port}`
  const runtimeFile = join(root, RUNTIME)
  mkdirSync(join(root, '.verx'), { recursive: true })
  writeFileSync(runtimeFile, JSON.stringify({ base, token, pid: process.pid, root }, null, 2) + '\n')
  const forget = () => rmSync(runtimeFile, { force: true })
  process.on('exit', forget)
  return {
    url: `${base}${ENTRY}?token=${token}`,
    base,
    token,
    setRuntime: graph.setRuntime,
    clients: graph.clients,
    close() {
      watcher.close()
      forget()
      process.off('exit', forget)
      return graph.app.close()
    },
  }
}
