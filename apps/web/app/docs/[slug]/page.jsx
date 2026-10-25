import { notFound } from '@veloz/kit'
import Code from '../../../components/Code.jsx'
import { docs, findDoc } from '../../../lib/docs.js'

// Todas las páginas de la documentación se prerenderizan al arrancar…
export const generateStaticParams = () => docs.map((d) => ({ slug: d.slug }))
// …y cualquier otro slug es 404 directo, sin render.
export const dynamicParams = false

export function generateMetadata({ params }) {
  const doc = findDoc(params.slug)
  return { title: doc.title, description: doc.summary }
}

function Block({ block }) {
  if (block.h) return <h2>{block.h}</h2>
  if (block.code) return <Code title={block.title}>{block.code}</Code>
  if (block.list) return <ul class="bullets">{block.list.map((item) => <li>{item}</li>)}</ul>
  return <p>{block.p}</p>
}

export default function DocPage({ params }) {
  const doc = findDoc(params.slug)
  if (!doc) notFound()
  const i = docs.indexOf(doc)
  const prev = docs[i - 1]
  const next = docs[i + 1]
  return (
    <div class="docs">
      <aside>
        <nav class="toc">
          {docs.map((d) => (
            <a href={`/docs/${d.slug}`} aria-current={d === doc ? 'page' : undefined}>
              {d.title}
            </a>
          ))}
        </nav>
      </aside>
      <article class="prose">
        <h1>{doc.title}</h1>
        <p class="lead">{doc.summary}</p>
        {doc.body.map((block) => <Block block={block} />)}
        <nav class="pager">
          {prev ? <a href={`/docs/${prev.slug}`}>← {prev.title}</a> : <span />}
          {next && <a href={`/docs/${next.slug}`}>{next.title} →</a>}
        </nav>
      </article>
    </div>
  )
}
