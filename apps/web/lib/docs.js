// La documentación del framework: content/docs/*.md, convertidos al arrancar
// con verx-md. Cada página de /docs/[slug] se prerenderiza gracias a
// generateStaticParams, y el buscador indexa sus secciones (ver search-corpus.js).
import { loadContent } from './content.js'

export const docs = loadContent('docs')

export const findDoc = (slug) => docs.find((d) => d.slug === slug)

// Ancla de un título de sección: «Estructura de una app» → «estructura-de-una-app».
// Es la misma regla que aplica verx-md a los títulos de los .md.
export const anchor = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
