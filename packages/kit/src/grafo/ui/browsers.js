// VERX Grafo · los navegadores. La regla `navegadores` del guardián cuenta qué
// funciones del navegador usa cada archivo (report.compat); aquí se suma por
// carpeta, para ver de un vistazo qué exige cada parte del proyecto, en qué
// navegadores se pierde algo y si está protegido o tiene respaldo.

export const NAMES = { chrome: 'Chrome/Edge', safari: 'Safari', firefox: 'Firefox' }
const SHORT = { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox' }

/**
 * id de nodo → Map(id de función → { files: Map(archivo → línea), guarded }).
 * Cada archivo cuenta también para todas sus carpetas (`ancestors`).
 */
export function browserMap(compat, ancestors) {
  const out = new Map()
  for (const [file, uses] of Object.entries(compat?.files ?? {})) {
    for (const [feature, line, guarded] of uses) {
      for (const id of ancestors(file)) {
        let byFeature = out.get(id)
        if (!byFeature) out.set(id, (byFeature = new Map()))
        const entry = byFeature.get(feature) ?? { files: new Map(), guarded: true }
        entry.files.set(file, line)
        entry.guarded &&= guarded
        byFeature.set(feature, entry)
      }
    }
  }
  return out
}

/**
 * Los navegadores del objetivo en los que este nodo pierde algo. Lo que va
 * protegido (con su respaldo o su alternativa, como el prefijo -webkit-) no
 * cuenta: ahí no se pierde nada.
 */
export function lacking(byFeature, compat) {
  const features = new Map((compat?.features ?? []).map((f) => [f.id, f]))
  const out = new Set()
  for (const [id, entry] of byFeature ?? []) {
    if (!entry.guarded) for (const b of features.get(id)?.missing ?? []) out.add(b)
  }
  return ['chrome', 'safari', 'firefox'].filter((b) => out.has(b))
}

/** «Safari · Firefox», para la insignia del grafo. */
export const badge = (browsers) => browsers.map((b) => SHORT[b]).join(' · ')

/** La sección «Navegadores» del panel de un nodo. */
export function section(byFeature, compat, esc) {
  if (!byFeature?.size || !compat) return ''
  const features = new Map(compat.features.map((f) => [f.id, f]))
  const target = Object.entries(compat.target).map(([b, v]) => `${NAMES[b]} ${v}`).join(', ')
  const rows = [...byFeature].map(([id, entry]) => {
    const f = features.get(id)
    if (!f) return ''
    const files = entry.files.size === 1 ? [...entry.files].map(([file, line]) => `${file}:${line}`)[0] : `${entry.files.size} archivos`
    let verdict
    if (f.missing.length === 0) verdict = '<span class="ok-line">✔ en todos</span>'
    else {
      const where = f.missing.map((b) => `${NAMES[b]} ${compat.target[b]}`).join(', ')
      if (entry.guarded) {
        const how = f.policy === 'proteger' ? 'protegido' : 'cubierto con su alternativa'
        verdict = `<span class="ok-line">✔ falta en ${esc(where)} · ${how}</span>`
      } else {
        const how = f.policy === 'proteger' ? 'sin proteger' : 'se pierde, sin romper nada'
        verdict = `<span class="${f.policy === 'proteger' ? 'bad-line' : 'warn-line'}">falta en ${esc(where)} · ${how}</span>`
      }
    }
    const respaldo = f.missing.length && f.respaldo ? `<p class="hint">↳ ${esc(f.respaldo)}</p>` : ''
    return `<li><b>${esc(f.title)}</b> <small>${esc(files)}</small><br>${verdict}${respaldo}</li>`
  })
  return `<h4>Navegadores <small>objetivo: ${esc(target)}</small></h4><ul class="browsers">${rows.join('')}</ul>`
}
