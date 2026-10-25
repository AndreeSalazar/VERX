// ISR (Incremental Static Regeneration, como en Next.js/Vercel):
// la página se sirve desde caché como si fuera estática; cuando caduca, la
// siguiente visita recibe la versión vieja al instante y se regenera en segundo
// plano (stale-while-revalidate). Nadie espera a un render salvo el primero.
//
// Cabeceras pensadas para una CDN delante: s-maxage + stale-while-revalidate.

import { encode, buildAsset } from '@veloz/server/assets'

const HTML = 'text/html; charset=utf-8'

export class IsrCache {
  constructor({ max = 1000, headers = [] } = {}) {
    this.max = max
    this.headers = headers
    this.entries = new Map()
    this.inflight = new Map()
  }

  async serve(req, key, seconds, render) {
    let entry = this.entries.get(key)
    let state = 'HIT'
    if (entry === undefined) {
      state = 'MISS'
      let p = this.inflight.get(key)
      if (p === undefined) {
        p = this.generate(key, seconds, render).finally(() => this.inflight.delete(key))
        this.inflight.set(key, p)
      }
      entry = await p
    } else if (Date.now() >= entry.expires) {
      state = 'STALE'
      if (!entry.refreshing) {
        entry.refreshing = true
        this.generate(key, seconds, render).catch((err) => {
          console.error('[veloz] ISR: falló la regeneración, se mantiene la versión anterior', err)
          entry.refreshing = false
        })
      }
    }
    return entry.asset.serve(req, [['x-veloz-cache', state]])
  }

  async generate(key, seconds, render) {
    const html = await render()
    const cache = `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=31536000`
    // Brotli 5: buena compresión sin bloquear el proceso como lo haría la 11.
    const asset = buildAsset(encode(Buffer.from(html), HTML, { quality: 5 }), HTML, cache, this.headers)
    const entry = { asset, expires: Date.now() + seconds * 1000, refreshing: false }
    this.entries.delete(key)
    this.entries.set(key, entry)
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value)
    return entry
  }
}
