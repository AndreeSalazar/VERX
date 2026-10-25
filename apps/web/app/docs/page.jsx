import DocsSearch from '../../components/DocsSearch.jsx'
import { docs } from '../../lib/docs.js'

export const metadata = { title: 'Documentación', description: `Todo lo que hace VERX, en ${docs.length} páginas cortas.` }

export default function DocsIndex() {
  const items = docs.map(({ slug, title, summary }) => ({ href: `/docs/${slug}`, title, summary }))
  return (
    <>
      <h1>Documentación</h1>
      <p class="lead">
        {docs.length} páginas cortas. El buscador es una isla: al tocarlo descarga un motor de búsqueda escrito en Rust (unos 5 KB) y busca en todo el texto.
      </p>
      <DocsSearch docs={items} client:idle />
    </>
  )
}
