import { test, expect } from 'bun:test'
import { signal, computed, effect, batch, untrack, root, onCleanup } from '../src/index.js'

test('effect se re-ejecuta sólo cuando cambia lo que leyó', () => {
  const a = signal(1)
  const b = signal(10)
  const seen = []
  effect(() => seen.push(a()))
  b.set(11)
  a.set(2)
  a.set(2) // mismo valor: no notifica
  expect(seen).toEqual([1, 2])
})

test('computed deriva y batch agrupa escrituras', () => {
  const first = signal('Ana')
  const last = signal('López')
  const full = computed(() => `${first()} ${last()}`)
  const seen = []
  effect(() => seen.push(full()))
  batch(() => {
    first.set('Luis')
    last.set('Pérez')
  })
  expect(seen).toEqual(['Ana López', 'Luis Pérez'])
})

test('untrack lee sin suscribirse', () => {
  const a = signal(1)
  let runs = 0
  effect(() => {
    runs++
    untrack(a)
  })
  a.set(2)
  expect(runs).toBe(1)
})

test('los efectos hijos se destruyen al re-ejecutar el padre (sin fugas)', () => {
  const show = signal(true)
  const count = signal(0)
  let childRuns = 0
  let cleaned = 0
  effect(() => {
    if (!show()) return
    effect(() => {
      count()
      childRuns++
      onCleanup(() => cleaned++)
    })
  })
  count.set(1)
  expect(childRuns).toBe(2)
  show.set(false)
  count.set(2) // el hijo ya no existe
  expect(childRuns).toBe(2)
  expect(cleaned).toBe(2)
})

test('root agrupa y destruye todo lo creado dentro', () => {
  const a = signal(0)
  let runs = 0
  const dispose = root((dispose) => {
    effect(() => {
      a()
      runs++
    })
    return dispose
  })
  a.set(1)
  dispose()
  a.set(2)
  expect(runs).toBe(2)
})
