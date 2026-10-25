// <For> en el servidor: no hay nada que reconciliar, es un map. `index` es una
// función, como el signal que recibe la fila en el navegador (browser/for.js).
export function For({ each, children, fallback }) {
  const list = (typeof each === 'function' ? each() : each) ?? []
  if (list.length === 0) return fallback ?? null
  return list.map((item, i) => children(item, () => i))
}
