// GET /api/buscar — el índice de la documentación, construido por Rust
// (crates/search → @verx/search) una sola vez al arrancar. `verx build` lo
// exporta como archivo, así que también funciona en un hosting estático.
import { createSearch } from '@verx/search'
import { corpus } from '../../../lib/search-corpus.js'

export const dynamic = 'force-static'

export async function GET() {
  const search = await createSearch()
  return new Response(search.build(corpus()), { headers: { 'content-type': 'application/x-verx-search' } })
}
