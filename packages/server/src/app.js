import { STATUS_CODES } from 'node:http'
import { Context, EMPTY, safeDecode } from './context.js'
import { loadStatic, encode, buildAsset } from './static.js'
import { compileJSON } from './json.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
const HTML = 'text/html; charset=utf-8'

// Filosofía: todo lo que se pueda decidir al arrancar se decide al arrancar.
// compile() convierte rutas, middlewares, estáticos y páginas prerenderizadas en
// la tabla `routes` de Bun.serve (router nativo escrito en Zig) con funciones ya
// compuestas. "Sólo pagas lo que usas": sin middlewares globales, un estático se
// sirve sin crear siquiera un Context.
export class App {
  constructor(options = {}) {
    this.bodyLimit = options.bodyLimit ?? 1 << 20
    this.defaultHeaders = Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])
    this.middlewares = []
    this.routes = []
    this.statics = []
    this.prerenders = []
    this.assets = new Map()
    this.notFoundHandler = (ctx) => ctx.status(404).text('Not Found')
    this.errorHandler = defaultErrorHandler
    this.table = null
    this.server = null
    this.workers = []
    this._notFound = null
    this.fetch = this.fetch.bind(this)
  }

  // Middleware global: (ctx) => void | valor | Promise. Si devuelve algo distinto
  // de undefined, o crea una respuesta, la cadena se corta y eso es la respuesta.
  use(fn) {
    this.middlewares.push(fn)
    return this
  }

  // route(método, ruta, [opciones], ...middlewares, handler)
  route(method, path, ...args) {
    const opts = typeof args[0] === 'object' && args[0] !== null ? args.shift() : {}
    if (args.length === 0 || args.some((f) => typeof f !== 'function')) {
      throw new TypeError(`${method} ${path}: se esperaba al menos un handler`)
    }
    this.routes.push({ method, path, fns: args, opts })
    return this
  }

  get(path, ...args) { return this.route('GET', path, ...args) }
  post(path, ...args) { return this.route('POST', path, ...args) }
  put(path, ...args) { return this.route('PUT', path, ...args) }
  patch(path, ...args) { return this.route('PATCH', path, ...args) }
  delete(path, ...args) { return this.route('DELETE', path, ...args) }
  options(path, ...args) { return this.route('OPTIONS', path, ...args) }
  all(path, ...args) {
    for (const m of METHODS) this.route(m, path, ...args)
    return this
  }

  static(dir, opts = {}) {
    this.statics.push({ dir, opts })
    return this
  }

  // Renderiza UNA vez al arrancar y lo sirve como un estático más: desde memoria,
  // precomprimido y con ETag. `render` puede devolver string, JSX/HTML o bytes.
  prerender(path, render, { type = HTML, cache = 'no-cache' } = {}) {
    this.prerenders.push({ path, render, type, cache })
    return this
  }

  // URL con huella de un estático ('/style.css' → '/style.3f9a2c1b4e.css').
  asset(path) {
    return this.assets.get(path) ?? path
  }

  notFound(fn) {
    this.notFoundHandler = fn
    return this
  }

  onError(fn) {
    this.errorHandler = fn
    return this
  }

  async compile() {
    if (this.table !== null) return this
    const table = Object.create(null)
    const auto = new Set() // HEAD añadidos automáticamente para cada GET
    const mw = this.middlewares

    const add = (method, path, handler) => {
      const entry = (table[path] ??= {})
      if (entry[method] && !(method === 'HEAD' && auto.has(path))) throw new Error(`Ruta duplicada: ${method} ${path}`)
      entry[method] = handler
      if (method === 'HEAD') auto.delete(path)
      if (method === 'GET' && !entry.HEAD) {
        entry.HEAD = handler // Bun descarta el cuerpo en respuestas HEAD
        auto.add(path)
      }
    }
    const addAsset = (path, asset) => {
      const handler = mw.length === 0
        ? (req) => asset.serve(req)
        : this.handler(compose([...mw, (ctx) => asset.serve(ctx.req, ctx.headers)]), null, null)
      add('GET', normalize(path), handler)
    }

    for (const { dir, opts } of this.statics) {
      for (const file of loadStatic(dir, { ...opts, headers: this.defaultHeaders })) {
        for (const p of file.paths) addAsset(p, file.asset)
        if (file.hashedPath) {
          addAsset(file.hashedPath, file.immutable)
          this.assets.set(file.path, file.hashedPath)
        }
      }
    }
    // Después de los estáticos, para que lo prerenderizado pueda usar app.asset().
    for (const { path, render, type, cache } of this.prerenders) {
      const out = await render()
      const buf = out instanceof Uint8Array ? out : Buffer.from(String(out))
      addAsset(path, buildAsset(encode(buf, type), type, cache, this.defaultHeaders))
    }
    for (const r of this.routes) {
      const { path, wildcard } = toBunPattern(r.path)
      const route = { serialize: r.opts.response ? compileJSON(r.opts.response) : null }
      add(r.method, path, this.handler(compose([...mw, ...r.fns]), route, wildcard))
    }

    this._notFound = compose([...mw, this.notFoundHandler])
    this.table = table
    return this
  }

  // Envuelve una cadena compuesta en un handler de Bun.serve.
  handler(fn, route, wildcard) {
    if (wildcard === null) {
      return (req, server) => this.run(fn, new Context(this, req, server, route, req.params ?? EMPTY))
    }
    // Bun no nombra el comodín: lo calculamos a partir del path.
    return (req, server) => {
      const params = { ...req.params, [wildcard.name]: safeDecode(pathOf(req.url).slice(wildcard.prefix)) }
      return this.run(fn, new Context(this, req, server, route, params))
    }
  }

  // Ruta caliente: sin promesas si el handler es síncrono.
  run(fn, ctx) {
    let r
    try {
      r = fn(ctx)
    } catch (err) {
      return this.fail(err, ctx)
    }
    if (isPromise(r)) return r.then((v) => this.finish(ctx, v), (err) => this.fail(err, ctx))
    return this.finish(ctx, r)
  }

  finish(ctx, value) {
    if (value === undefined) {
      return ctx.response ?? new Response(null, { status: ctx.statusCode === 200 ? 204 : ctx.statusCode })
    }
    if (value instanceof Response) return value
    try {
      return ctx.send(value)
    } catch (err) {
      return this.fail(err, ctx)
    }
  }

  fail(err, ctx) {
    if (ctx._failed) return panic(err)
    ctx._failed = true
    ctx.response = null
    ctx.headers = null
    ctx._typed = false
    ctx.statusCode = 500
    let r
    try {
      r = this.errorHandler(err, ctx)
    } catch (e) {
      return panic(e)
    }
    if (isPromise(r)) return r.then((v) => this.finish(ctx, v), panic)
    return this.finish(ctx, r)
  }

  // Lo que no encaja en ninguna ruta: barra final → redirección canónica; si no, 404.
  fetch(req, server) {
    const path = pathOf(req.url)
    if (path.length > 1 && path.endsWith('/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const q = req.url.indexOf('?')
      return new Response(null, { status: 308, headers: { location: path.replace(/\/+$/, '') + (q === -1 ? '' : req.url.slice(q)) } })
    }
    return this.run(this._notFound, new Context(this, req, server, null, EMPTY))
  }

  // listen(puerto, { hostname, workers: número | 'auto', log, ...opcionesDeBunServe })
  async listen(port = 3000, { hostname, workers = 1, log = true, ...serveOptions } = {}) {
    await this.compile()
    if (workers === 'auto') workers = navigator.hardwareConcurrency
    workers = Number(workers) || 1
    const isWorker = process.env.VERX_WORKER === '1'

    if (workers > 1 && process.platform !== 'linux') {
      if (log) console.warn('[verx] varios workers sólo reparten carga en Linux (SO_REUSEPORT); arranco 1')
      workers = 1
    }
    if (workers > 1 && !isWorker) {
      for (let i = 1; i < workers; i++) {
        this.workers.push(Bun.spawn([process.execPath, ...process.argv.slice(1)], {
          env: { ...process.env, VERX_WORKER: '1' },
          stdio: ['inherit', 'inherit', 'inherit'],
        }))
      }
      process.once('exit', () => this.workers.forEach((w) => w.kill()))
    }

    this.server = Bun.serve({
      port,
      hostname,
      routes: this.table,
      fetch: this.fetch,
      error: panic,
      maxRequestBodySize: this.bodyLimit,
      development: false,
      reusePort: workers > 1,
      ...serveOptions,
    })
    if (log && !isWorker) console.log(`[verx] escuchando en ${this.server.url}${workers > 1 ? ` (${workers} procesos)` : ''}`)
    return this.server
  }

  async close() {
    this.workers.forEach((w) => w.kill())
    await this.server?.stop(true)
  }
}

export const verx = (options) => new App(options)

// '/docs/*path' → { path: '/docs/*', wildcard: { name: 'path', prefix: 6 } }
function toBunPattern(raw) {
  const path = normalize(raw)
  const star = path.indexOf('/*')
  if (star === -1) return { path, wildcard: null }
  if (path.indexOf('/', star + 1) !== -1) throw new Error(`El comodín debe ser el último segmento: "${raw}"`)
  return { path: path.slice(0, star + 2), wildcard: { name: path.slice(star + 2) || '*', prefix: star + 1 } }
}

function normalize(path) {
  if (path[0] !== '/') path = '/' + path
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

// Extrae el path de una URL absoluta sin construir un objeto URL.
function pathOf(url) {
  const start = url.indexOf('/', url.indexOf('//') + 2)
  const q = url.indexOf('?', start)
  return q === -1 ? url.slice(start) : url.slice(start, q)
}

// Compone la cadena una sola vez por ruta. Con un único handler no hay envoltura.
// Los middlewares síncronos no crean promesas.
function compose(fns) {
  if (fns.length === 1) return fns[0]
  const last = fns.length - 1
  const step = (ctx, i) => {
    for (; i < last; i++) {
      const r = fns[i](ctx)
      if (r !== undefined) {
        if (isPromise(r)) return r.then((v) => (v !== undefined || ctx.response !== null ? v : step(ctx, i + 1)))
        return r
      }
      if (ctx.response !== null) return
    }
    return fns[last](ctx)
  }
  return (ctx) => step(ctx, 0)
}

function isPromise(v) {
  return v !== null && typeof v === 'object' && typeof v.then === 'function'
}

function defaultErrorHandler(err, ctx) {
  const raw = err?.status ?? err?.statusCode
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500
  if (status >= 500) console.error(err)
  const message = err?.expose ? err.message : STATUS_CODES[status]
  ctx.status(status)
  const accept = ctx.req.headers.get('accept')
  if (accept !== null && accept.includes('application/json')) return ctx.json({ error: message })
  return ctx.text(message)
}

function panic(err) {
  console.error(err)
  return new Response('Internal Server Error', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
