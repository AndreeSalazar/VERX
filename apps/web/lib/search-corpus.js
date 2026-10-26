// Corpus del buscador (@verx/search): cada página de la documentación y cada
// una de sus secciones (h2), con su texto. Las secciones y sus anclas salen de
// verx-md, así que un resultado de sección lleva directo a su apartado.
import { docs } from './docs.js'

const SNIPPET = 140
const snippet = (s = '') => (s.length <= SNIPPET ? s : s.slice(0, s.lastIndexOf(' ', SNIPPET)) + '…')

export function corpus() {
  const out = []
  for (const doc of docs) {
    for (const s of doc.sections) {
      const page = s.id === null
      const data = page
        ? { title: doc.title, href: `/docs/${doc.slug}`, summary: doc.summary }
        : { title: s.title, href: `/docs/${doc.slug}#${s.id}`, parent: doc.title, summary: snippet(s.text) }
      out.push({ title: data.title, body: page ? `${doc.summary} ${s.text}` : s.text, data })
    }
  }
  return out
}
