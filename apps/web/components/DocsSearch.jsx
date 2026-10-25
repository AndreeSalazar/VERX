'use client'
import { signal } from '@verx/ui'

const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

export default function DocsSearch({ docs }) {
  const query = signal('')
  const visible = () => {
    const q = normalize(query())
    return docs.filter((d) => normalize(d.title + ' ' + d.summary).includes(q))
  }
  return (
    <div class="search">
      <input type="search" placeholder="Buscar en la documentación…" aria-label="Buscar" onInput={(e) => query.set(e.target.value)} />
      <ul class="list">
        {() =>
          visible().map((d) => (
            <li>
              <a href={`/docs/${d.slug}`}>{d.title}</a>
              <span>{d.summary}</span>
            </li>
          ))
        }
      </ul>
      {() => visible().length === 0 && <p class="muted">Nada coincide con “{query}”.</p>}
    </div>
  )
}
