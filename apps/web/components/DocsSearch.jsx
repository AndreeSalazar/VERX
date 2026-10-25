'use client'
import { signal } from '@verx/ui'
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

  const visible = () => {
    const q = query()
    const s = search()
    if (s && q.trim()) return s.query(q, 10)
    const n = normalize(q)
    return docs.filter((d) => normalize(d.title + ' ' + d.summary).includes(n))
  }

  return (
    <div class="search">
      <input type="search" placeholder="Buscar en la documentación…" aria-label="Buscar" onFocus={warm} onInput={(e) => query.set(e.target.value)} />
      <p class="search-engine" aria-live="polite">{() => (search() ? 'Búsqueda de texto completo con Rust → WebAssembly' : '')}</p>
      <ul class="list">
        {() =>
          visible().map((d) => (
            <li>
              <a href={d.href}>
                {d.parent && <small>{d.parent} › </small>}
                {d.title}
              </a>
              <span>{d.summary}</span>
            </li>
          ))
        }
      </ul>
      {() => visible().length === 0 && <p class="muted">Nada coincide con “{query}”.</p>}
    </div>
  )
}
