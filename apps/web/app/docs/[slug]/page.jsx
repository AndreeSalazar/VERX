import { notFound } from '@verx/kit'
import { raw } from '@verx/ui'
import CodeCopy from '../../../components/CodeCopy.jsx'
import { docs, findDoc } from '../../../lib/docs.js'

// Todas las páginas de la documentación se prerenderizan al arrancar…
export const generateStaticParams = () => docs.map((d) => ({ slug: d.slug }))
// …y cualquier otro slug es 404 directo, sin render.
export const dynamicParams = false

export function generateMetadata({ params }) {
  const doc = findDoc(params.slug)
  return { title: doc.title, description: doc.summary }
}

// El cuerpo es el HTML que verx-md generó a partir de content/docs/*.md.
export default function DocPage({ params }) {
  const doc = findDoc(params.slug)
  if (!doc) notFound()
  const i = docs.indexOf(doc)
  const prev = docs[i - 1]
  const next = docs[i + 1]
  const sections = doc.headings.filter((h) => h.level === 2)
  return (
    <div class="docs">
      <aside>
        <nav class="toc" aria-label="Documentación">
          {docs.map((d) => (
            <a href={`/docs/${d.slug}`} aria-current={d === doc ? 'page' : undefined}>
              {d.title}
            </a>
          ))}
        </nav>
      </aside>
      <article class="prose">
        <p class="eyebrow">Documentación · {doc.minutes} min de lectura</p>
        <h1>{doc.title}</h1>
        <p class="lead">{doc.summary}</p>
        {sections.length > 1 && (
          <nav class="on-page" aria-label="En esta página">
            <strong>En esta página</strong>
            {sections.map((h) => (
              <a href={`#${h.id}`}>{h.text}</a>
            ))}
          </nav>
        )}
        {raw(doc.html)}
        <nav class="pager">
          {prev ? <a href={`/docs/${prev.slug}`}>← {prev.title}</a> : <span />}
          {next && <a href={`/docs/${next.slug}`}>{next.title} →</a>}
        </nav>
      </article>
      <CodeCopy client:idle />
    </div>
  )
}
