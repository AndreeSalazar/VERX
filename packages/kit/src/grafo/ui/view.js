// VERX Grafo · la vista: colocar los nodos y dibujarlos en SVG.
//
// Cada espacio de trabajo es una pequeña galaxia: sus carpetas orbitan a su
// alrededor y los archivos de cada carpeta forman una espiral de girasol
// (ángulo áureo), que reparte puntos sin solaparlos. Los tres mundos (Rust,
// Bun, apps) van uno al lado del otro.

const NS = 'http://www.w3.org/2000/svg'
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const DOT = 7 // separación de la espiral
export const EXT_COLOR = {
  js: '#ffd56b', mjs: '#ffd56b', jsx: '#ff9f6e', ts: '#7fb3ff', tsx: '#7fb3ff', rs: '#ff7a45',
  toml: '#b892ff', json: '#7fdbca', md: '#82c8ff', css: '#ff8fc7', html: '#ffb27a', sh: '#9be37f',
}
export const WORLD_COLOR = { rust: '#ff7a45', bun: '#ffd56b', app: '#7fdbca' }

const el = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(NS, tag)
  for (const k in attrs) node.setAttribute(k, attrs[k])
  parent?.appendChild(node)
  return node
}

// ── Colocación ───────────────────────────────────────────────────────────
export function layout(graph) {
  const kids = new Map()
  for (const n of graph.nodes) {
    if (n.parent === null) continue
    if (!kids.has(n.parent)) kids.set(n.parent, [])
    kids.get(n.parent).push(n)
  }
  const files = (id) => (kids.get(id) ?? []).filter((n) => n.kind === 'file')
  const boxes = (id) => (kids.get(id) ?? []).filter((n) => n.kind !== 'file')
  const radius = new Map()

  // Radio que necesita un contenedor: su espiral de archivos y, alrededor, el anillo de hijos.
  const measure = (id) => {
    const core = 10 + DOT * Math.sqrt(files(id).length)
    const children = boxes(id).filter((c) => measure(c.id) > 0)
    if (children.length === 0) return radius.set(id, core + 8).get(id)
    // Un único hijo va en el centro, con los archivos en un anillo a su alrededor:
    // si no, cada carpeta con una sola subcarpeta duplicaría el radio.
    if (children.length === 1) return radius.set(id, radius.get(children[0].id) + (files(id).length ? 22 : 10)).get(id)
    const max = Math.max(...children.map((c) => radius.get(c.id)))
    const around = children.reduce((s, c) => s + 2 * radius.get(c.id) + 10, 0) / (2 * Math.PI)
    const ring = Math.max(core + max + 12, around)
    return radius.set(id, ring + max + 8).get(id)
  }

  const pos = new Map()
  const place = (id, x, y) => {
    pos.set(id, { x, y, r: radius.get(id) })
    const children = boxes(id)
    if (children.length === 1) {
      place(children[0].id, x, y)
      const ring = radius.get(children[0].id) + 11
      files(id).forEach((f, i, all) => {
        const a = -Math.PI / 2 + (i / all.length) * 2 * Math.PI
        pos.set(f.id, { x: x + Math.cos(a) * ring, y: y + Math.sin(a) * ring, r: 0 })
      })
      return
    }
    files(id).forEach((f, i) => {
      const a = i * GOLDEN
      const d = DOT * Math.sqrt(i + 0.6)
      pos.set(f.id, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: 0 })
    })
    if (children.length === 0) return
    const core = 10 + DOT * Math.sqrt(files(id).length)
    const max = Math.max(...children.map((c) => radius.get(c.id)))
    const total = children.reduce((s, c) => s + 2 * radius.get(c.id) + 10, 0)
    const ring = Math.max(core + max + 12, total / (2 * Math.PI))
    let angle = -Math.PI / 2
    for (const c of children) {
      const share = ((2 * radius.get(c.id) + 10) / total) * 2 * Math.PI
      angle += share / 2
      place(c.id, x + Math.cos(angle) * ring, y + Math.sin(angle) * ring)
      angle += share / 2
    }
  }

  // Los mundos, en fila; cada uno, con sus espacios de trabajo en anillo.
  const worlds = boxes('').filter((w) => measure(w.id) > 0 && (kids.get(w.id) ?? []).length > 0)
  let x = 0
  for (const w of worlds) {
    const r = radius.get(w.id)
    place(w.id, x + r, 0)
    x += 2 * r + 120
  }
  return { pos, kids, bounds: { x: -60, y: -Math.max(...worlds.map((w) => radius.get(w.id)), 100) - 60, w: x + 0, h: 2 * Math.max(...worlds.map((w) => radius.get(w.id)), 100) + 120 } }
}

// ── Dibujo ───────────────────────────────────────────────────────────────
// Curva suave entre dos puntos (un poco arqueada, para que no se tapen).
function curve(a, b, bend = 0.18) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  return `M${a.x},${a.y} Q${mx - dy * bend},${my + dx * bend} ${b.x},${b.y}`
}

// Dibuja todo el grafo en `root` (un <g>). `bad`: id → nº de bloqueos (propios + de dentro).
export function draw(root, graph, lay, bad) {
  root.replaceChildren()
  const edges = el('g', { class: 'edges' }, root)
  const boxes = el('g', { class: 'boxes' }, root)
  const dots = el('g', { class: 'dots' }, root)
  el('g', { class: 'links' }, root) // aristas de import del nodo señalado (se rellena al pasar)
  const labels = el('g', { class: 'labels' }, root)

  for (const e of graph.edges) {
    if (e.kind === 'import') continue
    const a = lay.pos.get(e.from)
    const b = lay.pos.get(e.to)
    if (!a || !b) continue
    el('path', { d: curve(a, b), class: `edge ${e.kind}` }, edges)
  }
  for (const n of graph.nodes) {
    const p = lay.pos.get(n.id)
    if (!p) continue
    const count = bad.get(n.id) ?? 0
    if (n.kind === 'file') {
      const g = el('g', { class: `node file${count ? ' bad' : ''}${n.broken ? ' broken' : ''}`, 'data-id': n.id, transform: `translate(${p.x},${p.y})` }, dots)
      if (count) el('circle', { r: 11, class: 'pulse' }, g)
      el('circle', { r: count ? 4.6 : 3.4, fill: EXT_COLOR[n.ext] ?? '#c8c8d8' }, g)
      const t = el('text', { x: p.x + 7, y: p.y + 3, class: 'label file-label', 'data-for': n.id }, labels)
      t.textContent = n.label
      continue
    }
    if (n.kind === 'root') continue
    const g = el('g', { class: `node box ${n.kind}${count ? ' bad' : ''}`, 'data-id': n.id }, boxes)
    el('circle', { cx: p.x, cy: p.y, r: p.r, style: `--tone:${WORLD_COLOR[n.world] ?? '#fff'}` }, g)
    const t = el('text', { x: p.x, y: p.y - p.r - 8, class: `label ${n.kind}-label`, 'text-anchor': 'middle' }, labels)
    t.textContent = n.kind === 'world' ? n.label.toUpperCase() : n.label
    if (count) {
      const badge = el('text', { x: p.x, y: p.y - p.r + 14, class: 'badge', 'text-anchor': 'middle' }, labels)
      badge.textContent = `✖ ${count}`
    }
  }
}

// Las aristas de import de un nodo: lo que importa (cian) y quién lo importa (violeta).
export function showLinks(root, graph, lay, id) {
  const g = root.querySelector('.links')
  g.replaceChildren()
  if (!id) return
  const at = lay.pos.get(id)
  for (const e of graph.edges) {
    if (e.kind !== 'import' || (e.from !== id && e.to !== id)) continue
    const a = lay.pos.get(e.from)
    const b = lay.pos.get(e.to)
    if (!a || !b || !at) continue
    el('path', { d: curve(a, b, 0.22), class: e.from === id ? 'link out' : 'link in' }, g)
  }
}

// Zoom y desplazamiento con la rueda y arrastrando; `fit` encuadra todo o un nodo.
export function camera(svg, world, onZoom) {
  const view = { x: 0, y: 0, k: 1 }
  const apply = () => {
    // Transform de CSS (no el atributo de SVG): así se puede animar al encuadrar.
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`
    onZoom(view.k)
  }
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      const f = Math.exp(-e.deltaY * 0.0015)
      const k = Math.min(8, Math.max(0.15, view.k * f))
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      view.x = mx - ((mx - view.x) * k) / view.k
      view.y = my - ((my - view.y) * k) / view.k
      view.k = k
      apply()
    },
    { passive: false },
  )
  let drag = null
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
  })
  addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    view.x = drag.vx + dx
    view.y = drag.vy + dy
    apply()
  })
  addEventListener('pointerup', () => {
    svg.classList.toggle('dragged', Boolean(drag?.moved))
    drag = null
  })
  const fit = (box, padding = 40) => {
    const r = svg.getBoundingClientRect()
    const k = Math.min(8, (r.width - padding * 2) / box.w, (r.height - padding * 2) / box.h)
    view.k = k
    view.x = r.width / 2 - (box.x + box.w / 2) * k
    view.y = r.height / 2 - (box.y + box.h / 2) * k
    world.style.transition = 'transform .5s cubic-bezier(.2,.7,.2,1)'
    apply()
    setTimeout(() => (world.style.transition = ''), 520)
  }
  return { fit, view }
}
