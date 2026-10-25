// Rutas por archivos, con las convenciones del App Router de Next.js:
//
//   app/page.jsx                    → /
//   app/blog/page.jsx               → /blog
//   app/blog/[slug]/page.jsx        → /blog/:slug
//   app/docs/[...path]/page.jsx     → /docs/*path   (catch-all)
//   app/(marketing)/precios/page.jsx → /precios     (grupo: no cambia la URL)
//   app/_componentes/…              → ignorado      (carpeta privada)
//   app/api/posts/route.js          → API: exporta GET, POST…
//   layout.jsx                      → envuelve a todo lo que cuelga de su carpeta
//   app/not-found.jsx, app/error.jsx, app/middleware.js → especiales (sólo en la raíz)

import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXTENSIONS = ['.jsx', '.tsx', '.js', '.ts']

function pick(dir, files, base) {
  for (const ext of EXTENSIONS) if (files.has(base + ext)) return join(dir, base + ext)
  return null
}

export function scanRoutes(appDir) {
  const pages = []
  const apis = []
  const seen = new Map()
  const out = { pages, apis, rootLayout: null, notFound: null, error: null, middleware: null }

  const claim = (path, file) => {
    const prev = seen.get(path)
    if (prev) throw new Error(`Dos archivos producen la misma ruta ${path}:\n  ${relative(appDir, prev)}\n  ${relative(appDir, file)}`)
    seen.set(path, file)
  }

  function walk(dir, segments, layouts, isRoot) {
    const entries = readdirSync(dir, { withFileTypes: true })
    const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name))
    const layout = pick(dir, files, 'layout')
    const chain = layout ? [...layouts, layout] : layouts
    const page = pick(dir, files, 'page')
    const api = pick(dir, files, 'route')
    const path = '/' + segments.join('/')

    if (page && api) throw new Error(`${relative(appDir, dir) || 'app'}: page y route no pueden estar en la misma carpeta`)
    if (page) {
      claim(path, page)
      pages.push({ path, file: page, layouts: chain, dynamic: segments.some((s) => s[0] === ':' || s[0] === '*') })
    }
    if (api) {
      claim(path, api)
      apis.push({ path, file: api })
    }
    if (isRoot) {
      out.rootLayout = layout
      out.notFound = pick(dir, files, 'not-found')
      out.error = pick(dir, files, 'error')
      out.middleware = pick(dir, files, 'middleware')
    }

    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue
      walk(join(dir, e.name), segmentFor(e.name, segments), chain, false)
    }
  }

  walk(appDir, [], [], true)
  return out
}

function segmentFor(name, segments) {
  if (name.startsWith('(') && name.endsWith(')')) return segments
  if (name.startsWith('[[')) throw new Error(`[[...${name}]] (catch-all opcional) no está soportado; usa page.jsx + [...param]`)
  if (name.startsWith('[...')) return [...segments, '*' + name.slice(4, -1)]
  if (name.startsWith('[')) return [...segments, ':' + name.slice(1, -1)]
  return [...segments, name]
}

// '/blog/:slug' + { slug: 'hola' } → '/blog/hola'
export function fillPath(pattern, params) {
  return pattern.replace(/[:*]([\w-]+)/g, (_, name) => {
    const v = params[name]
    if (v === undefined) throw new Error(`generateStaticParams no devolvió "${name}" para ${pattern}`)
    return pattern.includes('*' + name) ? String(v).split('/').map(encodeURIComponent).join('/') : encodeURIComponent(v)
  })
}
