// JSX de navegador: crea nodos reales del DOM, sin DOM virtual ni diffing
// (el enfoque de Solid). Los componentes se ejecutan UNA vez; lo reactivo son
// las funciones: {count} o {() => count() * 2} crean un efecto que actualiza
// exactamente ese trozo del DOM cuando cambian los signals que lee.

import { effect, untrack } from '@verx/signals'

const MARK = Symbol.for('verx.html')
export const Fragment = Symbol.for('verx.fragment')

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan', 'defs', 'use',
  'symbol', 'clipPath', 'mask', 'pattern', 'filter', 'linearGradient', 'radialGradient', 'stop', 'foreignObject',
])
const ALIAS = { className: 'class', htmlFor: 'for' }
const PROPS = new Set(['value', 'checked', 'selected', 'muted', 'indeterminate'])

export function jsx(type, props) {
  if (typeof type === 'function') return untrack(() => type(props))
  if (type === Fragment) {
    const f = document.createDocumentFragment()
    insert(f, props.children)
    return f
  }
  const el = SVG.has(type) ? document.createElementNS(SVG_NS, type) : document.createElement(type)
  for (const key in props) {
    if (key === 'children' || key === 'key') continue
    const v = props[key]
    if (key === 'ref') {
      if (typeof v?.set === 'function') v.set(el)
      else if (typeof v === 'function') v(el)
      continue
    }
    if (key.charCodeAt(0) === 111 /* o */ && key.charCodeAt(1) === 110 /* n */ && typeof v === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), v)
      continue
    }
    if (key === 'dangerouslySetInnerHTML') {
      el.innerHTML = v.__html
      continue
    }
    if (typeof v === 'function') effect(() => setProp(el, key, v()))
    else setProp(el, key, v)
  }
  if (props.children !== undefined) insert(el, props.children)
  return el
}

export { jsx as jsxs, jsx as jsxDEV }

function setProp(el, key, v) {
  if (key === 'style' && v !== null && typeof v === 'object') {
    el.style.cssText = ''
    for (const k in v) {
      if (k.startsWith('--')) el.style.setProperty(k, v[k])
      else el.style[k] = v[k] ?? ''
    }
    return
  }
  if (PROPS.has(key)) {
    el[key] = v
    return
  }
  const name = ALIAS[key] ?? key
  if (v == null || v === false) el.removeAttribute(name)
  else el.setAttribute(name, v === true ? '' : v)
}

export function insert(parent, v) {
  if (v == null || typeof v === 'boolean') return
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) insert(parent, v[i])
  } else if (v instanceof Node) {
    parent.appendChild(v)
  } else if (typeof v === 'function') {
    reactive(parent, v)
  } else if (v[MARK] === true) {
    const t = document.createElement('template')
    t.innerHTML = String(v)
    parent.appendChild(t.content)
  } else {
    parent.appendChild(document.createTextNode(String(v)))
  }
}

// Zona reactiva delimitada por un nodo de texto vacío que hace de ancla.
function reactive(parent, fn) {
  const end = document.createTextNode('')
  parent.appendChild(end)
  let nodes = []
  effect(() => {
    const v = fn()
    const p = end.parentNode
    if (p === null) return
    // Camino rápido: texto → texto, sólo se cambia .data (lo típico en un contador).
    if ((typeof v === 'string' || typeof v === 'number') && nodes.length === 1 && nodes[0].nodeType === 3) {
      nodes[0].data = String(v)
      return
    }
    for (let i = 0; i < nodes.length; i++) nodes[i].remove()
    const frag = document.createDocumentFragment()
    insert(frag, v)
    nodes = Array.from(frag.childNodes)
    p.insertBefore(frag, end)
  })
}
