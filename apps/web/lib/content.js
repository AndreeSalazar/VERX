// El contenido del sitio son archivos Markdown en content/. Se convierten UNA
// vez al arrancar con @verx/md (Rust → WASM): las páginas reciben HTML hecho,
// con el código ya resaltado, y el navegador no ejecuta nada para pintarlo.
//
//   content/docs/01-empezar.md  → slug «empezar» (el número sólo ordena)
//   content/blog/de-node-a-bun.md
//
// El frontmatter (title, summary…) pasa a ser propiedades de cada entrada.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMarkdown } from '@verx/md'

const root = fileURLToPath(new URL('../content', import.meta.url))
const md = await createMarkdown()

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }
const toText = (html) =>
  html
    .replace(/<a class="anchor"[^>]*>#<\/a>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()

// Texto de cada sección (lo que va antes del primer h2, y luego cada h2), para el buscador.
function sections(html) {
  const out = []
  const parts = html.split(/<h2 id="([^"]+)">(.*?)<\/h2>/)
  out.push({ id: null, title: null, text: toText(parts[0]) })
  for (let i = 1; i < parts.length; i += 3) {
    out.push({ id: parts[i], title: toText(parts[i + 1]), text: toText(parts[i + 2] ?? '') })
  }
  return out
}

export function loadContent(kind) {
  const dir = join(root, kind)
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const { html, front, headings, words } = md.render(readFileSync(join(dir, file), 'utf8'))
      const slug = file.replace(/\.md$/, '').replace(/^\d+-/, '')
      return { slug, ...front, html, headings, words, sections: sections(html), minutes: Math.max(1, Math.round(words / 200)) }
    })
}
