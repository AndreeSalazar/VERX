// El corazón del meta-framework: lee app/, decide cómo se sirve cada página y
// lo registra todo en @verx/server.
//
// Modo de cada página (como en Next.js, pero decidido al arrancar):
//   · estática  (por defecto)                → se renderiza una vez y se sirve
//                                               precomprimida desde memoria.
//   · ISR       (export const revalidate=N)  → caché que se regenera cada N s
//                                               en segundo plano.
//   · dinámica  (export const dynamic='force-dynamic', o [param] sin
//                generateStaticParams)        → SSR en cada petición.
// Una página con [param] + generateStaticParams prerenderiza esos params y
// renderiza el resto bajo demanda (salvo export const dynamicParams = false).

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { STATUS_CODES } from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'
import { brotliCompressSync, constants as Z } from 'node:zlib'
import { verx } from '@verx/server'
import { IMMUTABLE } from '@verx/server/assets'
import { renderToString, onIsland, raw } from '@verx/ui/server'
import { scanRoutes, fillPath } from './scan.js'
import { buildClient } from './client.js'
import { mergeMetadata, renderDocument } from './document.js'
import { IsrCache } from './isr.js'
import { NotFoundError, RedirectError, setCurrent } from './navigation.js'
import { desktopGuard, desktopAllows } from './desktop.js'
import { IMAGE_PREFIX, createImageStore } from './images.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
const HTML = 'text/html; charset=utf-8'
const JS = 'text/javascript; charset=utf-8'
const EMPTY = Object.freeze({})
const BOOT = Date.now().toString(36)

export async function loadConfig(root) {
  for (const name of ['verx.config.js', 'verx.config.ts']) {
    const file = join(root, name)
    if (existsSync(file)) return (await import(pathToFileURL(file).href)).default ?? {}
  }
  return {}
}

const load = (file) => import(pathToFileURL(file).href)

// desktop: { token } activa el modo escritorio (ver desktop.js).
export async function createKit({ root = process.cwd(), dev = false, desktop = null } = {}) {
  root = resolve(root)
  const config = { lang: 'es', speculation: 'prerender', ...(await loadConfig(root)) }
  const appDir = join(root, 'app')
  if (!existsSync(appDir)) throw new Error(`No existe ${appDir}: crea al menos app/page.jsx`)

  const app = verx({ headers: config.headers, bodyLimit: config.bodyLimit })
  const kit = { root, dev, desktop, config, app, pages: [], statics: [], dynamic: [], apis: [], client: null, routes: null }
  if (desktop) app.use(desktopGuard(desktop.token))
  setCurrent(kit)

  const publicDir = join(root, 'public')
  if (existsSync(publicDir)) app.static(publicDir)
  kit.publicDir = existsSync(publicDir) ? publicDir : null
  // Imágenes de public/ con variantes y placeholder (verx-img): ver images.js.
  kit.images = kit.publicDir ? await createImageStore(kit.publicDir) : null
  app.get(IMAGE_PREFIX + ':file', (ctx) => {
    const file = kit.images?.files.get(ctx.path)
    if (!file) return ctx.status(404).text('Not Found')
    return new Response(file.bytes, { headers: { 'content-type': file.type, 'cache-control': IMMUTABLE } })
  })

  const client = (kit.client = await buildClient({ root, dev }))
  for (const f of client.files) app.prerender(f.path, () => f.bytes, { type: f.type || JS, cache: IMMUTABLE })

  const routes = (kit.routes = scanRoutes(appDir))
  const isr = new IsrCache({ headers: app.defaultHeaders })
  const rootLayout = routes.rootLayout ? [await load(routes.rootLayout)] : []

  // ── Render ──────────────────────────────────────────────────────────────
  // AsyncLocalStorage aísla cada render (pueden solaparse): así sabemos QUÉ
  // islas usó esta página; sólo si usó alguna se le añade el runtime, y el
  // presupuesto de rendimiento suma exactamente lo que descargará.
  const als = new AsyncLocalStorage()
  onIsland((meta) => als.getStore()?.islands.add(meta.src))

  const renderPage = (route, props) =>
    als.run({ islands: new Set() }, async () => {
      let node = route.page.default(props)
      for (let i = route.layouts.length - 1; i >= 0; i--) node = route.layouts[i].default({ ...props, children: node })
      const body = await renderToString(node)
      const metas = []
      let head = ''
      for (const m of [...route.layouts, route.page]) {
        metas.push(typeof m.generateMetadata === 'function' ? await m.generateMetadata(props) : m.metadata)
        if (typeof m.head === 'function') head += await renderToString(m.head(props))
      }
      const islands = [...als.getStore().islands]
      const html = renderDocument({
        body,
        head,
        meta: mergeMetadata(metas),
        lang: config.lang,
        siteUrl: config.siteUrl,
        islands: islands.length > 0,
        runtime: client.runtime,
        speculation: config.speculation,
        dev,
      })
      return { html, islands }
    })
  const render = async (route, props) => (await renderPage(route, props)).html

  const respond = async (ctx, route, params, { status = 200, actionData } = {}) => {
    const html = await render(route, { params, searchParams: ctx.query, actionData })
    return htmlResponse(ctx.req, html, status, 'no-cache', app.defaultHeaders)
  }

  // ── Páginas ─────────────────────────────────────────────────────────────
  for (const p of routes.pages) {
    const route = { page: await load(p.file), layouts: await Promise.all(p.layouts.map(load)) }
    const m = route.page
    if (typeof m.default !== 'function') throw new Error(`${p.file}: falta el export default (el componente de la página)`)
    const mode = m.dynamic === 'force-dynamic' ? 'dynamic' : m.revalidate > 0 ? 'isr' : p.dynamic && m.dynamic !== 'force-static' ? 'dynamic' : 'static'
    const renderAt = (params) => render(route, { params, searchParams: EMPTY })

    let known = []
    if (!p.dynamic) known = mode === 'dynamic' ? [] : [{ path: p.path, params: EMPTY }]
    else if (typeof m.generateStaticParams === 'function') {
      known = (await m.generateStaticParams()).map((params) => ({ path: fillPath(p.path, params), params }))
    }

    for (const { path, params } of known) {
      kit.pages.push({ path, mode, render: () => renderAt(params), measure: () => renderPage(route, { params, searchParams: EMPTY }) })
      if (mode === 'isr') app.get(path, (ctx) => isr.serve(ctx.req, path, m.revalidate, () => renderAt(params)))
      else app.prerender(path, () => renderAt(params))
    }

    const fallback = p.dynamic ? m.dynamicParams !== false : mode === 'dynamic'
    if (fallback) {
      kit.dynamic.push(`GET ${p.path}`)
      if (mode === 'isr') app.get(p.path, (ctx) => isr.serve(ctx.req, ctx.path, m.revalidate, () => renderAt(ctx.params)))
      else app.get(p.path, (ctx) => respond(ctx, route, ctx.params))
    }

    // Acciones de formulario (Remix/SvelteKit): POST a la misma URL, funciona sin JS.
    if (typeof m.action === 'function') {
      kit.dynamic.push(`POST ${p.path}`)
      app.post(p.path, async (ctx) => {
        const result = await m.action({ form: await ctx.body(), params: ctx.params, request: ctx.req, ctx })
        if (result instanceof Response) return result
        return respond(ctx, route, ctx.params, { actionData: result })
      })
    }
  }

  // ── API: route.js exporta GET/POST/… como handlers de @verx/server, y
  //    WS = { open, message, close, upgrade? } para tiempo real (WebSocket) ──
  for (const a of routes.apis) {
    const m = await load(a.file)
    const methods = METHODS.filter((method) => m[method])
    if (methods.length === 0 && !m.WS) throw new Error(`${a.file}: exporta al menos un método (GET, POST…) o WS`)
    if (m.WS) {
      if (methods.includes('GET')) throw new Error(`${a.file}: WS y GET no pueden convivir (el WebSocket usa el GET del upgrade)`)
      // Los WebSockets no pasan por los middlewares: el candado de escritorio va en el upgrade.
      const ws = !desktop ? m.WS : { ...m.WS, upgrade: (req) => desktopAllows(req, desktop.token) && (m.WS.upgrade?.(req) ?? {}) }
      app.ws(a.path, ws)
      kit.apis.push(`WS ${a.path}`)
    }
    // GET estático (export const dynamic = 'force-static'): se ejecuta UNA vez,
    // se sirve precomprimido desde memoria y `verx build` lo exporta como archivo.
    if (m.dynamic === 'force-static') {
      if (typeof m.GET !== 'function' || methods.length > 1 || a.path.includes(':')) {
        throw new Error(`${a.file}: una ruta force-static exporta sólo GET (una función sin parámetros de URL)`)
      }
      const out = await staticRoute(m.GET)
      app.prerender(a.path, () => out.bytes, { type: out.type })
      kit.statics.push({ path: a.path, ...out })
      continue
    }
    for (const method of methods) {
      const h = m[method]
      if (typeof h === 'function') app.route(method, a.path, h)
      else app.route(method, a.path, { response: h.response }, h.handler)
      kit.apis.push(`${method} ${a.path}`)
    }
  }

  if (routes.middleware) app.use((await load(routes.middleware)).default)

  // ── 404 y errores, renderizados dentro del layout raíz ─────────────────
  const notFoundRoute = {
    page: routes.notFound ? await load(routes.notFound) : { default: () => raw('<h1>404</h1><p>Página no encontrada.</p>'), metadata: { title: 'No encontrado' } },
    layouts: rootLayout,
  }
  const errorRoute = {
    page: routes.error ? await load(routes.error) : { default: ({ error }) => raw(`<h1>${error.status}</h1>`), metadata: { title: 'Error' } },
    layouts: rootLayout,
  }
  kit.renderNotFound = () => render(notFoundRoute, { params: EMPTY, searchParams: EMPTY })

  const wantsHtml = (ctx) => (ctx.req.headers.get('accept') ?? '').includes('text/html')
  const wantsJson = (ctx) => (ctx.req.headers.get('accept') ?? '').includes('application/json')

  app.notFound(async (ctx) => {
    if (!wantsHtml(ctx)) return ctx.status(404).send(wantsJson(ctx) ? { error: 'Not Found' } : 'Not Found')
    return htmlResponse(ctx.req, await kit.renderNotFound(), 404, 'no-cache', app.defaultHeaders)
  })

  app.onError(async (err, ctx) => {
    if (err instanceof RedirectError) return ctx.redirect(err.location, err.status)
    if (err instanceof NotFoundError) return app.notFoundHandler(ctx)
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 500
    if (status >= 500) console.error(err)
    const message = err?.expose ? err.message : STATUS_CODES[status]
    if (!wantsHtml(ctx)) return ctx.status(status).send(wantsJson(ctx) ? { error: message } : message)
    const error = { status, message, stack: dev ? String(err?.stack ?? err) : undefined }
    return htmlResponse(ctx.req, await render(errorRoute, { params: EMPTY, searchParams: EMPTY, error }), status, 'no-cache', app.defaultHeaders)
  })

  // ── Recarga en vivo (sólo en desarrollo) ────────────────────────────────
  if (dev) {
    app.get('/_verx/dev', (ctx) => {
      ctx.server?.timeout(ctx.req, 0)
      const body = new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode(`retry: 300\ndata: ${BOOT}\n\n`)) })
      return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
    })
  }

  kit.listen = (port, opts) => app.listen(port, opts)
  kit.close = () => app.close()
  return kit
}

// HTML dinámico: compresión rápida al vuelo (brotli 4 ≈ gzip en CPU, menos bytes).
function htmlResponse(req, html, status, cache, extra) {
  const headers = [['content-type', HTML], ['cache-control', cache], ...extra]
  let body = html
  if (html.length > 1024) {
    headers.push(['vary', 'accept-encoding'])
    const ae = req.headers.get('accept-encoding') ?? ''
    if (ae.includes('br')) {
      body = brotliCompressSync(Buffer.from(html), { params: { [Z.BROTLI_PARAM_QUALITY]: 4, [Z.BROTLI_PARAM_MODE]: Z.BROTLI_MODE_TEXT } })
      headers.push(['content-encoding', 'br'])
    } else if (ae.includes('gzip')) {
      body = Bun.gzipSync(Buffer.from(html), { level: 6 })
      headers.push(['content-encoding', 'gzip'])
    }
  }
  return new Response(body, { status, headers })
}

// Ejecuta un GET estático (sin petición, como en la exportación) y lo convierte
// en bytes + tipo. Acepta Response, bytes, string u objeto (JSON).
async function staticRoute(GET) {
  const out = await GET()
  if (out instanceof Response) {
    return { bytes: new Uint8Array(await out.arrayBuffer()), type: out.headers.get('content-type') ?? 'application/octet-stream' }
  }
  if (out instanceof Uint8Array) return { bytes: out, type: 'application/octet-stream' }
  if (typeof out === 'string') return { bytes: Buffer.from(out), type: 'text/plain; charset=utf-8' }
  return { bytes: Buffer.from(JSON.stringify(out)), type: 'application/json; charset=utf-8' }
}
