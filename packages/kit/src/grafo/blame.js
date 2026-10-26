// VERX Grafo · ¿quién tiene la culpa? Algunas reglas (el presupuesto, que
// renderiza cada página) sólo saben que «apps/web» falla, y el error de Bun
// nombra el módulo importado, no el que lo importa mal. Aquí se lee el mensaje
// y se busca el archivo y la línea exactos, para poder arreglarlo ahí mismo.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ANSI = /\x1b\[[0-9;?]*[@-~]/g
// Ruido de `bun run` alrededor del error de verdad.
const NOISE = [/^\$ /, /^Bun v\d/, /^error: script ".*" exited with code \d+/]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Rutas absolutas del repo → relativas con «/». «C:\…\apps\web\x.js» → «apps/web/x.js».
function relativize(text, root) {
  const prefixes = new Set([root, root.replaceAll('\\', '/')])
  let out = text
  for (const p of prefixes) out = out.replace(new RegExp(`${escapeRe(p)}[\\\\/]([^'"\\s:)]+)`, 'gi'), (_, rest) => rest.replaceAll('\\', '/'))
  return out
}

/** El mensaje, sin colores ni ruido y con rutas relativas al repo. */
export function tidy(message, root) {
  const lines = relativize(String(message).replace(ANSI, ''), root)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !NOISE.some((re) => re.test(l)))
  return lines.join('\n')
}

// Lo que exporta un módulo JS del repo (con el analizador de Bun).
function exportsOf(root, file) {
  try {
    const ext = file.split('.').pop()
    return new Bun.Transpiler({ loader: ext === 'mjs' ? 'js' : ext }).scan(readFileSync(join(root, file), 'utf8')).exports
  } catch {
    return []
  }
}

// ¿Se parecen dos nombres? Uno contiene al otro o están a ≤ 2 ediciones.
function similar(a, b) {
  if (a.includes(b) || b.includes(a)) return true
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length] <= 2
}

// La primera línea de `file` que cumple `test` (1-based), o null.
function lineOf(root, file, test) {
  let text
  try {
    text = readFileSync(join(root, file), 'utf8')
  } catch {
    return null
  }
  const i = text.split('\n').findIndex(test)
  return i < 0 ? null : i + 1
}

/**
 * Señala el archivo y la línea de un problema a partir de su mensaje.
 * Devuelve `{ file, line, fix? }` (un id de nodo del grafo) o null si no lo sabe;
 * `fix`, cuando se sabe, es un arreglo más preciso que el genérico de la regla.
 */
export function pinpoint(message, graph, root) {
  const text = tidy(message, root)
  const ids = new Set(graph.nodes.filter((n) => n.kind === 'file').map((n) => n.id))
  const importers = (target) => graph.edges.filter((e) => e.kind === 'import' && e.to === target).map((e) => e.from)

  // «Export named 'x' not found in module 'lib/posts.js'»: la culpa es de quien lo importa.
  const missing = text.match(/Export named '([^']+)' not found in module '([^']+)'/)
  if (missing) {
    const [, name, module] = missing
    const word = new RegExp(`\\b${escapeRe(name)}\\b`)
    const exported = exportsOf(root, module)
    const close = exported.filter((e) => similar(e, name))
    const hint = close.length ? `: ¿quisiste decir «${close.join('», «')}»?` : exported.length ? ` (exporta: ${exported.join(', ')})` : ''
    const fix = `«${name}» no existe en ${module}${hint}`
    for (const file of importers(module)) {
      const line = lineOf(root, file, (l) => word.test(l) && /\bimport\b|\bfrom\b/.test(l))
      if (line) return { file, line, fix }
    }
    // Nadie lo importa ya así (p. ej. un informe viejo): el módulo no tiene la culpa.
  }

  // «Cannot find module './x' from 'apps/web/app/page.jsx'»
  const notFound = text.match(/Cannot find (?:module|package) '([^']+)' from '([^']+)'/)
  if (notFound && ids.has(notFound[2])) {
    const [, spec, file] = notFound
    const line = lineOf(root, file, (l) => l.includes(`'${spec}'`) || l.includes(`"${spec}"`))
    return { file, line, fix: `«${spec}» no existe: revisa la ruta del import` }
  }

  // Cualquier «ruta:línea» del repo (trazas «at apps/web/x.js:3:10», errores de compilación…).
  for (const [, file, line] of text.matchAll(/([\w@.\-/[\]()]+\.[a-z]{1,4}):(\d+)/g)) {
    if (ids.has(file)) return { file, line: Number(line) }
  }
  for (const [, file] of text.matchAll(/'([\w@.\-/[\]()]+\.[a-z]{1,4})'/g)) {
    if (ids.has(file)) return { file, line: null }
  }
  return null
}
