// Entrada de @verx/ui en el servidor. Los componentes importan de aquí lo mismo
// que en el navegador; lo que cambia es la implementación.
export { signal, computed, effect, batch, untrack, onCleanup, root } from '@verx/signals'
export { raw, Fragment } from './render.js'

// En el servidor no hay montaje: el código de onMount sólo corre en el navegador.
export function onMount() {}
