// Presupuesto de rendimiento: cuánto JavaScript + WebAssembly transfiere cada
// página, comprimido con brotli tal como lo recibe el navegador.
//
// Grafo de los archivos de Bun.build: cada módulo apunta a los chunks que
// importa y a los assets (.wasm) que referencia. Una página paga el runtime de
// islas más el cierre de cada isla que usa (lo compartido se cuenta una vez).
// El coste propio de una isla es su cierre menos lo que ya trae el runtime.

import { encode } from '@verx/server/assets'
import { CLIENT_PREFIX } from './client.js'

export const DEFAULT_BUDGET = { page: 14 * 1024, island: 8 * 1024 }

const REFERENCE = new RegExp(
  String.raw`(?:from|import)\s*\(?\s*["']((?:\./|${CLIENT_PREFIX})[^"']+)["']|["'](${CLIENT_PREFIX}[\w./-]+\.wasm)["']`,
  'g',
)

export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const label = (src) => src.slice(CLIENT_PREFIX.length).replace(/-\w+\.js$/, '')

function graph(files) {
  const known = new Set(files.map((f) => f.path))
  const sizes = new Map()
  const deps = new Map()
  for (const f of files) {
    const enc = encode(f.bytes, f.type)
    sizes.set(f.path, (enc.br ?? enc.identity).length)
    const refs = new Set()
    if (f.type.includes('javascript')) {
      for (const m of f.bytes.toString().matchAll(REFERENCE)) {
        const ref = m[1] ?? m[2]
        refs.add(ref.startsWith('./') ? CLIENT_PREFIX + ref.slice(2) : ref)
      }
    }
    deps.set(f.path, [...refs].filter((r) => known.has(r)))
  }
  const closure = (src, seen = new Set()) => {
    if (!seen.has(src)) {
      seen.add(src)
      for (const d of deps.get(src) ?? []) closure(d, seen)
    }
    return seen
  }
  const sum = (paths) => [...paths].reduce((total, p) => total + (sizes.get(p) ?? 0), 0)
  return { closure, sum }
}

// Renderiza cada página estática/ISR y devuelve lo que transfiere.
export async function measureBudget(kit) {
  const { closure, sum } = graph(kit.client.files)
  const runtime = kit.client.runtime ? closure(kit.client.runtime.src) : new Set()
  const pages = []
  for (const page of kit.pages) {
    const { islands } = await page.measure()
    const all = new Set(islands.length ? runtime : [])
    for (const src of islands) for (const p of closure(src)) all.add(p)
    pages.push({
      path: page.path,
      bytes: sum(all),
      islands: islands.map((src) => ({ name: label(src), bytes: sum([...closure(src)].filter((p) => !runtime.has(p))) })),
    })
  }
  return { pages, runtime: sum(runtime), unmeasured: kit.dynamic }
}

// Lo que se pasa del presupuesto. Cada isla se informa una sola vez.
export function checkBudget(report, budget = DEFAULT_BUDGET) {
  const problems = []
  const seen = new Set()
  for (const page of report.pages) {
    if (page.bytes > budget.page) {
      problems.push({ where: page.path, message: `la página manda ${kb(page.bytes)} de JS+WASM (máximo ${kb(budget.page)})` })
    }
    for (const island of page.islands) {
      if (island.bytes > budget.island && !seen.has(island.name)) {
        seen.add(island.name)
        problems.push({ where: island.name, message: `la isla pesa ${kb(island.bytes)} (máximo ${kb(budget.island)})` })
      }
    }
  }
  return problems
}
