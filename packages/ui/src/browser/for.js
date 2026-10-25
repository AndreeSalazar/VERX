// <For each={items} key={(t) => t.id}>{(item, index) => <li>…</li>}</For>
//
// Lista con claves: cuando `each` cambia sólo se crean las filas nuevas, se
// destruyen las que desaparecen y se mueven las mínimas (las que quedan fuera
// de la subsecuencia creciente más larga). Cada fila vive en su propio ámbito:
// lo que cambia en una no re-ejecuta las demás. `index` es un signal.
//
// Una fila se reutiliza si su clave sigue y su dato es el MISMO valor (===).
// Si el dato es otro objeto, la fila se vuelve a crear.

import { batch, effect, onCleanup, root, runWithOwner, signal, untrack } from '@verx/signals'
import { insert } from './jsx-runtime.js'

const same = (item) => item

export function For(props) {
  const { each, children, fallback } = props
  const keyOf = props.key ?? same
  const end = document.createTextNode('')
  const frag = document.createDocumentFragment()
  frag.appendChild(end)
  let rows = []
  let empty = null // el fallback, cuando la lista está vacía

  onCleanup(() => {
    for (const r of rows) r.dispose()
  })
  effect(() => {
    const list = (typeof each === 'function' ? each() : each) ?? []
    untrack(() => batch(() => update(list)))
  })
  return frag

  function update(list) {
    const parent = end.parentNode
    const old = new Map()
    for (let i = 0; i < rows.length; i++) old.set(rows[i].key, i)
    const reused = new Uint8Array(rows.length)
    const next = new Array(list.length)
    const from = new Int32Array(list.length) // posición anterior de cada fila (-1: nueva)
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      const key = keyOf(item)
      const j = old.get(key)
      if (j !== undefined && reused[j] === 0 && rows[j].item === item) {
        reused[j] = 1
        from[i] = j
        next[i] = rows[j]
        rows[j].index.set(i)
      } else {
        from[i] = -1
        next[i] = row(item, i, key, children)
      }
    }
    for (let j = 0; j < rows.length; j++) {
      if (reused[j] === 0) {
        detach(rows[j], null)
        rows[j].dispose()
      }
    }
    const keep = stable(from)
    let before = end
    for (let i = next.length - 1; i >= 0; i--) {
      if (keep[i] === 0) place(next[i], before, parent)
      before = next[i].first
    }
    rows = next

    if (list.length === 0 && fallback != null) {
      empty ??= span(fallback)
      if (empty.frag !== null) place(empty, end, parent)
    } else if (empty !== null && empty.frag === null) {
      empty.frag = document.createDocumentFragment()
      detach(empty, empty.frag)
    }
  }
}

// Renderiza una fila en un ámbito propio, fuera del efecto de la lista: así
// no se destruye cuando la lista se recalcula, sólo cuando la fila se va.
function row(item, i, key, render) {
  return runWithOwner(null, () =>
    root((dispose) => {
      const index = signal(i)
      const r = span(render(item, index))
      r.key = key
      r.item = item
      r.index = index
      r.dispose = dispose
      return r
    }),
  )
}

// Los nodos de una fila, listos en un fragmento. Un único elemento se mueve tal
// cual; si hay varios nodos (o zonas reactivas que pueden crecer), dos marcas
// vacías delimitan la fila.
function span(content) {
  const frag = document.createDocumentFragment()
  insert(frag, content)
  let first = frag.firstChild
  let last = frag.lastChild
  if (first === null || first !== last || first.nodeType !== 1) {
    first = document.createTextNode('')
    last = document.createTextNode('')
    frag.insertBefore(first, frag.firstChild)
    frag.appendChild(last)
  }
  return { first, last, frag }
}

// Coloca la fila antes de `before`: desde su fragmento si es nueva, o moviendo sus nodos.
function place(r, before, parent) {
  if (r.frag !== null) {
    parent.insertBefore(r.frag, before)
    r.frag = null
  } else detach(r, parent, before)
}

// Mueve los nodos de la fila a `target` (o los quita del documento si es null).
function detach(r, target, before = null) {
  let n = r.first
  for (;;) {
    const next = n.nextSibling
    if (target === null) n.parentNode?.removeChild(n)
    else target.insertBefore(n, before)
    if (n === r.last) return
    n = next
  }
}

// Subsecuencia creciente más larga de `from` (sin contar las filas nuevas):
// esas filas ya están en el orden relativo correcto y no se tocan.
export function stable(from) {
  const keep = new Uint8Array(from.length)
  const tails = []
  const prev = new Int32Array(from.length)
  for (let i = 0; i < from.length; i++) {
    const v = from[i]
    if (v < 0) continue
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (from[tails[mid]] < v) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1
    tails[lo] = i
  }
  for (let i = tails.length > 0 ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep[i] = 1
  return keep
}
