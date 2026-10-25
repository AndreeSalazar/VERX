import { posts } from '../../../lib/posts.js'

export const postSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    slug: { type: 'string' },
    title: { type: 'string' },
    date: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
}

// El esquema es una lista blanca: `authorEmail` y `body` nunca salen por la API.
export const GET = {
  response: { type: 'array', items: postSchema },
  handler: () => posts,
}
