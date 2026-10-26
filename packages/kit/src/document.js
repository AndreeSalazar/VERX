// <head> generado a partir de `metadata` (la API de Next.js), más lo que hace
// rápida la navegación sin mandar un router en JS:
//  · Speculation Rules: Chrome/Edge prerenderizan la página siguiente al pasar
//    el ratón por un enlace → navegación instantánea con 0 KB de JS.
//  · Islas: sólo si la página usa alguna se añade el runtime (y se precarga).
//  · Respaldos (@verx/compat): una línea que, sólo en los navegadores a los
//    que les falta algo (Firefox, Safari), importa lo que lo suple.

import { escape } from '@verx/ui/server'

const SPECULATION = (mode) =>
  JSON.stringify({
    [mode]: [{ where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/api/*' } }, { not: { selector_matches: '[rel~=nofollow]' } }] }, eagerness: 'moderate' }],
  })

// title puede ser string o { default, template: '%s · Sitio', absolute }.
export function mergeMetadata(list) {
  const out = {}
  let template = null
  for (const m of list) {
    if (!m) continue
    for (const [k, v] of Object.entries(m)) {
      if (k === 'title') {
        if (v && typeof v === 'object') {
          if (v.absolute) out.title = v.absolute
          else if (v.default) out.title = v.default
          if (v.template) template = v.template
        } else if (typeof v === 'string') {
          out.title = template ? template.replace('%s', v) : v
        }
      } else if (k === 'openGraph' || k === 'alternates') {
        out[k] = { ...out[k], ...v }
      } else {
        out[k] = v
      }
    }
  }
  return out
}

// Respaldos (@verx/compat): cada uno, sólo si al navegador le falta lo que
// suple. Con ?verx-compat en la URL se cargan siempre (para probarlos en Chrome).
function compatLoader(compat, speculation) {
  const parts = []
  if (compat?.reveal) parts.push(`(f||!CSS.supports("animation-timeline: view()"))&&import("${compat.reveal}")`)
  if (compat?.prefetch && speculation) parts.push(`(f||!HTMLScriptElement.supports?.("speculationrules"))&&import("${compat.prefetch}")`)
  return parts.length ? `<script type="module">const f=/[?&]verx-compat\\b/.test(location.search);${parts.join(';')}</script>` : ''
}

export function renderDocument({ body, meta, head = '', lang = 'es', siteUrl, islands, runtime, compat, speculation, dev }) {
  const tags = ['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">']
  const abs = (u) => (siteUrl && u && u.startsWith('/') ? siteUrl.replace(/\/$/, '') + u : u)
  if (meta.title) tags.push(`<title>${escape(meta.title)}</title>`)
  if (meta.description) tags.push(`<meta name="description" content="${escape(meta.description)}">`)
  if (meta.themeColor) tags.push(`<meta name="theme-color" content="${escape(meta.themeColor)}">`)
  if (meta.robots) tags.push(`<meta name="robots" content="${escape(meta.robots)}">`)
  if (meta.icons) tags.push(`<link rel="icon" href="${escape(meta.icons)}">`)
  if (meta.alternates?.canonical) tags.push(`<link rel="canonical" href="${escape(abs(meta.alternates.canonical))}">`)
  const og = { title: meta.title, description: meta.description, type: 'website', ...meta.openGraph }
  for (const [k, v] of Object.entries(og)) if (v) tags.push(`<meta property="og:${k}" content="${escape(k === 'image' || k === 'url' ? abs(v) : v)}">`)
  if (og.image) tags.push('<meta name="twitter:card" content="summary_large_image">')

  tags.push(head)
  if (speculation) tags.push(`<script type="speculationrules">${SPECULATION(speculation)}</script>`)
  tags.push(compatLoader(compat, speculation))
  if (islands && runtime) {
    tags.push('<style>verx-island{display:contents}</style>')
    for (const href of runtime.preload) tags.push(`<link rel="modulepreload" href="${href}">`)
    tags.push(`<script type="module" src="${runtime.src}"></script>`)
  }
  if (dev) {
    // Recarga en vivo: al reiniciar el servidor cambia el id de arranque.
    tags.push(`<script>(()=>{let b;const s=new EventSource('/_verx/dev');s.onmessage=e=>{if(b&&b!==e.data)location.reload();b=e.data}})()</script>`)
    // El aviso de VERX Grafo: qué bloquea el guardián, sin salir de la página.
    const grafo = process.env.VERX_GRAFO
    if (grafo && /^http:\/\/127\.0\.0\.1:\d+$/.test(grafo)) tags.push(`<script type="module" src="${grafo}/aviso.js"></script>`)
  }
  return `<!doctype html>\n<html lang="${escape(lang)}">\n<head>\n${tags.filter(Boolean).join('\n')}\n</head>\n<body>${body}</body>\n</html>\n`
}
