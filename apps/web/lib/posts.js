// Los artículos del blog: content/blog/*.md (frontmatter + Markdown), del más
// nuevo al más antiguo. `authorEmail` y `body` existen para demostrar que el
// esquema de la API (app/api/posts) no los deja salir.
import { loadContent } from './content.js'

export const posts = loadContent('blog')
  .map(({ html, ...post }) => ({ ...post, body: html }))
  .sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id)

export const findPost = (slug) => posts.find((p) => p.slug === slug)
