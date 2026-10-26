// El config.json de la Build Output API v3 de Vercel, a partir de lo que ya
// sabe el kit. Sin disco, para poder probarlo entero (vercel.js lo escribe).
//
// Orden de las rutas (Vercel las recorre de arriba abajo):
//  1. sin barra final: /blog/ → 308 a /blog;
//  2. cabeceras: las de verx.config.js para todo y un año para lo que lleva huella;
//  3. lo que no es GET (acciones de formulario, POST de las API) va a la función
//     ANTES de mirar los archivos: /contacto es una página estática, pero su POST no;
//  4. { handle: 'filesystem' }: lo exportado lo sirve la CDN;
//  5. los GET dinámicos (SSR, slugs sin prerenderizar, API) van a la función;
//  6. todo lo demás, la 404 del sitio.

import { IMMUTABLE } from '@verx/server/assets'

export const FUNCTION = '/_verx'
const READS = ['GET', 'HEAD']

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// '/blog/:slug' → '^/blog/([^/]+)/?$' · '/docs/*path' → '^/docs/(.+?)/?$'
export function routeRegex(path) {
  if (path === '/') return '^/$'
  const segments = path.split('/').filter(Boolean)
  const body = segments.map((s) => (s[0] === ':' ? '([^/]+)' : s[0] === '*' ? '(.+?)' : escapeRe(s))).join('/')
  return `^/${body}/?$`
}

// '/_verx/*' → '/_verx/.*' (el formato de _headers)
const globRe = (p) => p.split('*').map(escapeRe).join('.*')

// 'POST /contacto' → { method, path }
const parse = (entry) => {
  const [method, path] = entry.split(' ')
  return { method, path }
}

// pages: [{ path }] · statics: [{ path, type }] · immutable: rutas con * ·
// headers: [[k, v]] · dynamic/apis: ['GET /blog/:slug', 'WS /api/x', …]
export function vercelConfig({ pages = [], statics = [], immutable = [], headers = [], dynamic = [], apis = [], fn = FUNCTION }) {
  const routes = [{ src: '^/(.+)/$', headers: { location: '/$1' }, status: 308 }]
  if (headers.length) routes.push({ src: '^/.*$', headers: Object.fromEntries(headers), continue: true })
  if (immutable.length) routes.push({ src: `^(?:${immutable.map(globRe).join('|')})$`, headers: { 'cache-control': IMMUTABLE }, continue: true })

  // Agrupa los métodos de cada ruta: GET /x y POST /x quedan en dos reglas.
  const writes = new Map()
  const reads = new Set()
  const skipped = []
  for (const { method, path } of [...dynamic, ...apis].map(parse)) {
    if (method === 'WS') skipped.push(`WS ${path}`) // las funciones de Vercel no aceptan WebSockets
    else if (READS.includes(method)) reads.add(path)
    else writes.set(path, [...(writes.get(path) ?? []), method])
  }
  for (const [path, methods] of writes) routes.push({ src: routeRegex(path), methods, dest: fn })
  routes.push({ handle: 'filesystem' })
  for (const path of reads) routes.push({ src: routeRegex(path), methods: READS, dest: fn })
  routes.push({ src: '^/.*$', status: 404, dest: '/404.html' })

  // Las páginas se exportan como carpeta/index.html: se sirven en /carpeta.
  // Los GET estáticos sin extensión (p. ej. /api/buscar) llevan su tipo.
  const overrides = {}
  for (const p of pages) {
    if (p.path === '/') continue
    const path = decodeURIComponent(p.path.slice(1))
    overrides[`${path}/index.html`] = { path }
  }
  for (const s of statics) overrides[decodeURIComponent(s.path.slice(1))] = { contentType: s.type }

  return { config: { version: 3, routes, overrides }, skipped, usesFunction: writes.size + reads.size > 0 }
}
