import DocsSearch from '../../components/DocsSearch.jsx'
import { docs } from '../../lib/docs.js'

export const metadata = { title: 'Documentación', description: 'Todo lo que hace Veloz, en ocho páginas cortas.' }

export default function DocsIndex() {
  const items = docs.map(({ slug, title, summary }) => ({ slug, title, summary }))
  return (
    <>
      <h1>Documentación</h1>
      <p class="lead">Ocho páginas cortas. El buscador es una isla: su JavaScript se carga cuando el navegador queda libre.</p>
      <DocsSearch docs={items} client:idle />
    </>
  )
}
