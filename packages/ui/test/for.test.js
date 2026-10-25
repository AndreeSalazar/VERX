// <For> y las zonas reactivas del runtime del navegador, sobre un DOM mínimo.
// Sin JSX: en `bun test` el JSX resuelve al runtime del servidor.
import { test, expect } from 'bun:test'
import { container, ops, resetOps, html } from './dom.js'
import { jsx } from '../src/browser/jsx-runtime.js'
import { mount, onCleanup, signal } from '../src/browser/index.js'
import { For, stable } from '../src/browser/for.js'

const h = (type, props, ...children) =>
  jsx(type, children.length === 0 ? { ...props } : { ...props, children: children.length === 1 ? children[0] : children })

const make = (...ids) => ids.map((id) => ({ id, name: id }))

function setup(initial, extra = {}) {
  const items = signal(initial)
  const calls = { render: 0, cleanup: 0 }
  const target = container()
  const row = (t) => {
    calls.render++
    onCleanup(() => calls.cleanup++)
    return h('li', null, t.name)
  }
  const dispose = mount(() => h('ul', null, h(For, { each: items, key: (t) => t.id, children: row, ...extra })), null, target)
  const ul = target.firstChild
  const lis = () => ul.childNodes.filter((n) => n.nodeType === 1)
  const names = () => lis().map((n) => n.textContent).join(' ')
  resetOps()
  return { items, calls, lis, names, dispose, target }
}

test('pinta la lista inicial en orden', () => {
  const { names, calls } = setup(make('a', 'b', 'c'))
  expect(names()).toBe('a b c')
  expect(calls.render).toBe(3)
})

test('añadir al final crea una sola fila y no toca las demás', () => {
  const { items, lis, names, calls } = setup(make('a', 'b'))
  const before = lis()
  items.set([...items(), ...make('c')])
  expect(names()).toBe('a b c')
  expect(lis().slice(0, 2)).toEqual(before)
  expect(ops).toEqual({ created: 1, inserted: 1, removed: 0 })
  expect(calls.render).toBe(3)
})

test('quitar una fila del medio: un solo nodo fuera y su ámbito destruido', () => {
  const { items, names, calls } = setup(make('a', 'b', 'c'))
  items.set(items().filter((t) => t.id !== 'b'))
  expect(names()).toBe('a c')
  expect(ops).toEqual({ created: 0, inserted: 0, removed: 1 })
  expect(calls.cleanup).toBe(1)
})

test('mover el último al principio es UN movimiento; invertir, n − 1', () => {
  const ten = make(...'abcdefghij')
  const { items, names, calls } = setup(ten)
  items.set([ten[9], ...ten.slice(0, 9)])
  expect(names()).toBe('j a b c d e f g h i')
  expect(ops).toEqual({ created: 0, inserted: 1, removed: 0 })
  resetOps()
  items.set([...items()].reverse())
  expect(names()).toBe('i h g f e d c b a j')
  expect(ops.inserted).toBe(9)
  expect(calls.render).toBe(10) // ninguna fila se volvió a pintar
})

test('intercambiar dos filas: dos movimientos', () => {
  const ten = make(...'abcdefghij')
  const { items, names } = setup(ten)
  const next = [...ten]
  ;[next[1], next[8]] = [next[8], next[1]]
  items.set(next)
  expect(names()).toBe('a i c d e f g h b j')
  expect(ops).toEqual({ created: 0, inserted: 2, removed: 0 })
})

test('index es un signal: la fila se actualiza sin volver a pintarse', () => {
  const abc = make('a', 'b', 'c')
  let renders = 0
  const { items, names } = setup(abc, {
    children: (t, i) => {
      renders++
      return h('li', null, () => `${i()}:${t.name}`)
    },
  })
  expect(names()).toBe('0:a 1:b 2:c')
  items.set([abc[2], abc[0], abc[1]])
  expect(names()).toBe('0:c 1:a 2:b')
  expect(renders).toBe(3)
})

test('misma clave con otro dato: la fila se vuelve a crear', () => {
  const { items, names, calls } = setup(make('a', 'b'))
  items.set([items()[0], { id: 'b', name: 'B2' }])
  expect(names()).toBe('a B2')
  expect(ops.created).toBe(1)
  expect(calls).toEqual({ render: 3, cleanup: 1 })
})

test('fallback cuando la lista está vacía, y se retira al volver a tener filas', () => {
  const { items, target } = setup([], { fallback: h('p', null, 'vacío') })
  expect(html(target)).toBe('<div><ul><p>vacío</p></ul></div>')
  items.set(make('a'))
  expect(html(target)).toBe('<div><ul><li>a</li></ul></div>')
  items.set([])
  expect(html(target)).toBe('<div><ul><p>vacío</p></ul></div>')
})

test('sin `key`, el propio dato es la clave', () => {
  const words = signal(['x', 'y', 'z'])
  const target = container()
  mount(() => h('ul', null, h(For, { each: words, children: (w) => h('li', null, w) })), null, target)
  const [x] = target.firstChild.childNodes
  words.set(['z', 'x'])
  expect(html(target)).toBe('<div><ul><li>z</li><li>x</li></ul></div>')
  expect(target.firstChild.childNodes[1]).toBe(x)
})

test('filas de varios nodos se mueven enteras', () => {
  const abc = make('a', 'b', 'c')
  const items = signal(abc)
  const target = container('dl')
  mount(() => h(For, { each: items, key: (t) => t.id, children: (t) => [h('dt', null, t.name), h('dd', null, t.name.toUpperCase())] }), null, target)
  items.set([abc[2], abc[0], abc[1]])
  expect(html(target)).toBe('<dl><dt>c</dt><dd>C</dd><dt>a</dt><dd>A</dd><dt>b</dt><dd>B</dd></dl>')
})

test('una zona reactiva que contiene un <For> que creció no deja nodos al ocultarse', () => {
  const show = signal(true)
  const items = signal(make('a'))
  let cleanups = 0
  const row = (t) => {
    onCleanup(() => cleanups++)
    return h('li', null, t.name)
  }
  const target = container()
  mount(() => h('div', null, () => show() && h(For, { each: items, key: (t) => t.id, children: row })), null, target)
  items.set([...items(), ...make('b', 'c')])
  expect(html(target)).toBe('<div><div><li>a</li><li>b</li><li>c</li></div></div>')
  show.set(false)
  expect(html(target)).toBe('<div><div></div></div>')
  expect(cleanups).toBe(3)
})

test('desmontar destruye todas las filas', () => {
  const { dispose, calls } = setup(make('a', 'b', 'c'))
  dispose()
  expect(calls.cleanup).toBe(3)
})

test('zona reactiva de texto: cambia .data sin crear nodos', () => {
  const count = signal(1)
  const target = container('p')
  mount(() => h('b', null, count), null, target)
  const text = target.firstChild.childNodes.find((n) => n.data === '1')
  resetOps()
  count.set(2)
  expect(text.data).toBe('2')
  expect(ops).toEqual({ created: 0, inserted: 0, removed: 0 })
})

test('stable(): las filas de la subsecuencia creciente más larga no se mueven', () => {
  expect([...stable(Int32Array.from([2, 0, 1, -1, 3]))]).toEqual([0, 1, 1, 0, 1])
  expect([...stable(Int32Array.from([0, 1, 2]))]).toEqual([1, 1, 1])
  expect([...stable(new Int32Array(0))]).toEqual([])
})

test('al azar: 300 cambios mantienen el orden y reutilizan cada fila superviviente', () => {
  let seed = 7
  const rand = (n) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
    return seed % n
  }
  let next = 0
  const fresh = () => ({ id: `k${next}`, name: `k${next++}` })
  const { items, lis, names } = setup(Array.from({ length: 12 }, fresh))
  for (let step = 0; step < 300; step++) {
    const node = new Map(lis().map((li) => [li.textContent, li]))
    const list = [...items()]
    for (let k = rand(4); k >= 0; k--) {
      const op = rand(3)
      if (op === 0 && list.length > 0) list.splice(rand(list.length), 1)
      else if (op === 1) list.splice(rand(list.length + 1), 0, fresh())
      else if (list.length > 1) list.splice(rand(list.length), 0, ...list.splice(rand(list.length), 1))
    }
    items.set(list)
    expect(names()).toBe(list.map((t) => t.name).join(' '))
    for (const li of lis()) if (node.has(li.textContent)) expect(li).toBe(node.get(li.textContent))
  }
})
