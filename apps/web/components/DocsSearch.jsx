'use client'
import { computed, signal } from '@verx/ui'
import { For } from '@verx/ui/for'
import { createSearch } from '@verx/search'

// Mientras no haya motor, un filtro instantáneo por título y resumen. Al enfocar
// el campo se descargan el motor (search.wasm, Rust) y el índice de /api/buscar,
// y desde ahí busca en todo el texto: prefijos, sin acentos y por secciones.
const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

let engine = null
const loadEngine = () =>
  (engine ??= Promise.all([createSearch(), fetch('/api/buscar').then((r) => r.arrayBuffer())]).then(
    ([search, pack]) => {
      search.load(pack)
      return search
    },
  ))

export default function DocsSearch({ docs }) {
  const query = signal('')
  const search = signal(null)
  // Si el motor no carga (sin red, navegador antiguo), el filtro sigue funcionando.
  const warm = () => loadEngine().then((s) => search.set(s), () => {})

  // Un objeto por enlace: si un resultado sigue al escribir otra letra, <For>
  // reutiliza su fila tal cual (el motor devuelve objetos nuevos en cada consulta).
  const known = new Map()
  const stable = (d) => known.get(d.href) ?? (known.set(d.href, d), d)

  const visible = computed(() => {
    const q = query()
    const s = search()
    if (s && q.trim()) return s.query(q, 10).map(stable)
    const n = normalize(q)
    return docs.filter((d) => normalize(d.title + ' ' + d.summary).includes(n)).map(stable)
  })

  return (
    <div class="search">
      <input type="search" placeholder="Buscar en la documentación…" aria-label="Buscar" onFocus={warm} onInput={(e) => query.set(e.target.value)} />
      <p class="search-engine" aria-live="polite">{() => (search() ? 'Búsqueda de texto completo con Rust → WebAssembly' : '')}</p>
      <ul class="list">
        <For each={visible} key={(d) => d.href}>
          {(d) => (
            <li>
              <a href={d.href}>
                {d.parent && <small>{d.parent} › </small>}
                {d.title}
              </a>
              <span>{d.summary}</span>
            </li>
          )}
        </For>
      </ul>
      {() => visible().length === 0 && <p class="muted">Nada coincide con “{query}”.</p>}
    </div>
  )
}
