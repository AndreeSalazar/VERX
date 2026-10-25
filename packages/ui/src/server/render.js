// JSX de servidor: convierte el árbol directamente en string, sin DOM virtual
// ni objetos intermedios. Soporta componentes async (como los Server
// Components de Next): si algo devuelve una promesa, sólo esa rama espera.
//
// Reglas (iguales que en el navegador para que un componente sirva en ambos):
//   · Una función como valor se llama una vez (los signals pintan su valor actual).
//   · on* con función se omite (los eventos sólo existen en el navegador).
//   · Todo texto y atributo se escapa; raw() marca HTML de confianza.

import { ISLAND_TAG } from '../shared.js'

const MARK = Symbol.for('veloz.html')
export const Fragment = Symbol.for('veloz.fragment')

export class Html {
  constructor(value) {
    this.value = value
  }
  toString() {
    return this.value
  }
}
Html.prototype[MARK] = true

export const raw = (value) => new Html(String(value))

const NEEDS_ESCAPE = /[&<>"']/
const ESCAPE_ALL = /[&<>"']/g
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const toEntity = (c) => ENTITIES[c]

export function escape(value) {
  const s = String(value)
  return NEEDS_ESCAPE.test(s) ? s.replace(ESCAPE_ALL, toEntity) : s
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const ALIAS = { className: 'class', htmlFor: 'for' }
const SKIP = new Set(['children', 'key', 'ref', 'dangerouslySetInnerHTML'])

export function jsx(type, props) {
  if (typeof type === 'function') {
    if (islands.size !== 0) {
      const meta = islands.get(type)
      if (meta !== undefined) return island(type, props, meta)
    }
    return type(props)
  }
  if (type === Fragment) return wrap(renderChildren(props.children))
  return element(type, props)
}

function element(type, props) {
  let open = '<' + type
  for (const key in props) {
    if (SKIP.has(key)) continue
    let v = props[key]
    if (typeof v === 'function') {
      if (key.charCodeAt(0) === 111 /* o */ && key.charCodeAt(1) === 110 /* n */) continue
      v = v()
    }
    if (v == null || v === false) continue
    const name = ALIAS[key] ?? key
    if (v === true) {
      open += ' ' + name
      continue
    }
    if (name === 'style' && typeof v === 'object') v = styleToString(v)
    open += ' ' + name + '="' + escape(v) + '"'
  }
  open += '>'
  if (VOID.has(type)) return new Html(open)
  const close = '</' + type + '>'
  const inner = props.dangerouslySetInnerHTML != null ? props.dangerouslySetInnerHTML.__html : renderChildren(props.children)
  return typeof inner === 'string' ? new Html(open + inner + close) : inner.then((s) => new Html(open + s + close))
}

function styleToString(style) {
  let s = ''
  for (const k in style) {
    const v = style[k]
    if (v == null || v === false) continue
    s += (k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())) + ':' + v + ';'
  }
  return s
}

const wrap = (r) => (typeof r === 'string' ? new Html(r) : r.then((s) => new Html(s)))

// Devuelve string, o Promise<string> sólo si alguna rama es async.
function renderChildren(c) {
  if (c == null || typeof c === 'boolean') return ''
  if (typeof c === 'string') return escape(c)
  if (typeof c === 'number' || typeof c === 'bigint') return '' + c
  if (c instanceof Html) return c.value
  if (Array.isArray(c)) {
    let s = ''
    let parts = null
    for (let i = 0; i < c.length; i++) {
      const r = renderChildren(c[i])
      if (parts !== null) parts.push(r)
      else if (typeof r === 'string') s += r
      else parts = [s, r]
    }
    return parts === null ? s : Promise.all(parts).then((p) => p.join(''))
  }
  if (typeof c === 'function') return renderChildren(c())
  if (typeof c.then === 'function') return c.then(renderChildren)
  if (c[MARK] === true) return String(c)
  return escape(c)
}

export async function renderToString(node) {
  return renderChildren(await node)
}

// ── Islas ────────────────────────────────────────────────────────────────
// @veloz/kit registra aquí los componentes de archivos con 'use client'.
// Al renderizarlos se envuelven en <veloz-island> con lo necesario para que el
// navegador cargue su JS sólo cuando haga falta (visible, idle o al cargar).

const islands = new Map()
let listener = null

export function registerIsland(component, meta) {
  islands.set(component, meta)
}

export function clearIslands() {
  islands.clear()
}

export function onIsland(fn) {
  listener = fn
}

const LOADS = ['load', 'idle', 'visible', 'none']

function island(Component, props, meta) {
  let load = 'visible'
  const data = {}
  for (const key in props) {
    if (key.startsWith('client:')) {
      const l = key.slice(7)
      if (!LOADS.includes(l)) throw new Error(`Directiva desconocida ${key} (usa ${LOADS.map((x) => 'client:' + x).join(', ')})`)
      load = l
    } else if (key !== 'children') {
      data[key] = props[key]
    }
  }
  const inner = renderChildren(Component(data))
  if (load === 'none') return wrap(inner) // sólo HTML, cero JS
  listener?.(meta)
  const json = JSON.stringify(data, (k, v) => {
    if (typeof v === 'function') throw new Error(`<${Component.name}>: no se pueden pasar funciones a un componente cliente (prop "${k}")`)
    return v
  })
  const open = `<${ISLAND_TAG} data-src="${escape(meta.src)}" data-export="${escape(meta.exportName)}" data-load="${load}" data-props="${escape(json)}">`
  const close = `</${ISLAND_TAG}>`
  return typeof inner === 'string' ? new Html(open + inner + close) : inner.then((s) => new Html(open + s + close))
}
