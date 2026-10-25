// Entrada de @veloz/ui en el navegador (la elige Bun.build con la condición "browser").
import { root, untrack, onCleanup, getOwner, runWithOwner } from '@veloz/signals'
import { jsx, Fragment } from './jsx-runtime.js'

export { signal, computed, effect, batch, untrack, onCleanup, root } from '@veloz/signals'
export { Fragment }

const MARK = Symbol.for('veloz.html')

export function raw(value) {
  return { [MARK]: true, toString: () => String(value) }
}

// Se ejecuta cuando el componente ya está en el documento. Si devuelve una
// función, se usa como limpieza al desmontar.
export function onMount(fn) {
  const owner = getOwner()
  queueMicrotask(() =>
    runWithOwner(owner, () => {
      const cleanup = untrack(fn)
      if (typeof cleanup === 'function') onCleanup(cleanup)
    }),
  )
}

// Monta un componente dentro de `target`, sustituyendo lo que hubiera (p. ej.
// el HTML renderizado en el servidor). Devuelve una función para desmontarlo.
export function mount(Component, props, target) {
  return root((dispose) => {
    target.replaceChildren(jsx(Component, props ?? {}))
    return () => {
      dispose()
      target.replaceChildren()
    }
  })
}
