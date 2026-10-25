// DOM mínimo para probar el runtime del navegador en Bun, sin dependencias.
// Implementa sólo lo que usa @verx/ui y cuenta las operaciones, para poder
// comprobar que <For> toca exactamente lo necesario.

export const ops = { created: 0, inserted: 0, removed: 0 }
export const resetOps = () => Object.assign(ops, { created: 0, inserted: 0, removed: 0 })

class Node {
  constructor(nodeType) {
    this.nodeType = nodeType
    this.parentNode = null
    this.childNodes = []
  }
  get firstChild() {
    return this.childNodes[0] ?? null
  }
  get lastChild() {
    return this.childNodes.at(-1) ?? null
  }
  get nextSibling() {
    const siblings = this.parentNode?.childNodes
    return siblings?.[siblings.indexOf(this) + 1] ?? null
  }
  appendChild(node) {
    return this.insertBefore(node, null)
  }
  insertBefore(node, ref) {
    if (node.nodeType === 11) {
      for (const child of [...node.childNodes]) this.insertBefore(child, ref)
      return node
    }
    if (node.parentNode !== null) node.parentNode.detach(node)
    const at = ref === null ? this.childNodes.length : this.childNodes.indexOf(ref)
    if (at < 0) throw new Error('insertBefore: la referencia no es hija de este nodo')
    this.childNodes.splice(at, 0, node)
    node.parentNode = this
    // Sólo cuenta lo que toca el documento (construir una fila aparte es gratis).
    if (this.isConnected) ops.inserted++
    return node
  }
  detach(node) {
    this.childNodes.splice(this.childNodes.indexOf(node), 1)
    node.parentNode = null
  }
  removeChild(node) {
    if (node.parentNode !== this) throw new Error('removeChild: no es hijo de este nodo')
    this.detach(node)
    if (this.isConnected) ops.removed++
    return node
  }
  get isConnected() {
    let n = this
    while (n.parentNode !== null) n = n.parentNode
    return n.root === true
  }
  remove() {
    this.parentNode?.removeChild(this)
  }
  replaceChildren(...nodes) {
    for (const child of [...this.childNodes]) this.removeChild(child)
    for (const node of nodes) this.appendChild(node)
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('')
  }
}

class Text extends Node {
  constructor(data) {
    super(3)
    this.data = data
  }
  get textContent() {
    return this.data
  }
}

class Element extends Node {
  constructor(tag) {
    super(1)
    this.tagName = tag
    this.attributes = new Map()
    this.listeners = {}
    this.style = { cssText: '', setProperty() {} }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }
  removeAttribute(name) {
    this.attributes.delete(name)
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }
  addEventListener(type, fn) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) fn({ target: this, ...event })
  }
}

class Fragment extends Node {
  constructor() {
    super(11)
  }
}

// Raíz «conectada» (el documento): lo que cuelga de ella cuenta en `ops`.
export function container(tag = 'div') {
  const el = new Element(tag)
  el.root = true
  return el
}

// HTML legible para comparar en los tests (los nodos de texto vacíos no salen).
export function html(node) {
  if (node.nodeType === 3) return node.data
  const inner = node.childNodes.map(html).join('')
  if (node.nodeType !== 1) return inner
  const attrs = [...node.attributes].map(([k, v]) => ` ${k}="${v}"`).join('')
  return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`
}

globalThis.Node = Node
globalThis.document = {
  createElement: (tag) => {
    ops.created++
    return new Element(tag)
  },
  createElementNS: (_, tag) => new Element(tag),
  createTextNode: (data) => new Text(data),
  createDocumentFragment: () => new Fragment(),
}
