// La tabla de rutas de Bun.serve, resuelta en JS, para cuando no hay Bun.serve
// delante (funciones serverless como las de Vercel, ver App#handle). Misma
// precedencia que Bun: la ruta exacta, después las de parámetros (más
// segmentos fijos primero) y por último los comodines.

import { safeDecode } from './context.js'

// table: { '/x': { GET: fn }, '/blog/:slug': {…}, '/docs/*': {…} }
// → (path) => { methods, params } | null
export function createRouter(table) {
  const exact = new Map()
  const patterns = []
  for (const [path, methods] of Object.entries(table)) {
    const segs = path.split('/').slice(1)
    const wildcard = segs.at(-1) === '*'
    if (!wildcard && !segs.some((s) => s[0] === ':')) exact.set(path, methods)
    else patterns.push({ segs, wildcard, methods, fixed: segs.filter((s) => s[0] !== ':' && s !== '*').length })
  }
  patterns.sort((a, b) => a.wildcard - b.wildcard || b.fixed - a.fixed)

  return (path) => {
    const hit = exact.get(path)
    if (hit) return { methods: hit, params: null }
    const parts = path.split('/').slice(1)
    for (const p of patterns) {
      const params = match(p, parts)
      if (params) return { methods: p.methods, params }
    }
    return null
  }
}

function match({ segs, wildcard }, parts) {
  if (wildcard ? parts.length < segs.length : parts.length !== segs.length) return null
  const params = {}
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s === '*' && wildcard && i === segs.length - 1) break
    if (s[0] === ':') {
      if (parts[i] === '') return null
      params[s.slice(1)] = safeDecode(parts[i])
    } else if (s !== parts[i]) return null
  }
  return params
}
