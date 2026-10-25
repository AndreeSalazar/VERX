// Corpus del buscador (@verx/search): cada página de la documentación y cada
// una de sus secciones (h2), con el texto de párrafos, listas y código. Un
// resultado de sección lleva directo a su ancla.
import { anchor, docs } from './docs.js'

const SNIPPET = 140

const text = (b) => b.p ?? b.list?.join(' ') ?? `${b.title ?? ''} ${b.code ?? ''}`
const prose = (b) => b.p ?? b.list?.[0]
const snippet = (s = '') => (s.length <= SNIPPET ? s : s.slice(0, s.lastIndexOf(' ', SNIPPET)) + '…')

export function corpus() {
  const out = []
  for (const doc of docs) {
    const sections = [{ title: doc.title, href: `/docs/${doc.slug}`, summary: doc.summary, blocks: [doc.summary] }]
    for (const b of doc.body) {
      if (b.h) sections.push({ title: b.h, href: `/docs/${doc.slug}#${anchor(b.h)}`, parent: doc.title, blocks: [] })
      else {
        const s = sections.at(-1)
        s.blocks.push(text(b))
        s.summary ??= prose(b) && snippet(prose(b))
      }
    }
    for (const { blocks, ...data } of sections) out.push({ title: data.title, body: blocks.join(' '), data })
  }
  return out
}
