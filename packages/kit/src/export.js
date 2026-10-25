// `verx build`: exporta todo lo estático a dist/ para subirlo a cualquier
// hosting estático o CDN (Cloudflare Pages, Netlify, Vercel, GitHub Pages, nginx…).
//  · Páginas como carpeta/index.html, con hermanos .br y .gz precomprimidos
//    (nginx brotli_static/gzip_static, Caddy `precompressed`, etc.).
//  · Archivos con huella y _headers (formato Netlify/Cloudflare) para cachearlos un año.
//  · Lo que necesita servidor (SSR, API, acciones) se lista: eso va con `verx start`.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { encode, MIME } from '@verx/server/assets'
import { CLIENT_PREFIX } from './client.js'

const HTML = 'text/html; charset=utf-8'

export async function exportStatic(kit, outDir = 'dist') {
  await kit.app.compile() // rellena el mapa de URLs con huella
  const out = resolve(kit.root, outDir)
  rmSync(out, { recursive: true, force: true })
  const immutable = [CLIENT_PREFIX + '*']
  let files = 0
  let bytes = 0

  const write = (urlPath, buf, type) => {
    const file = join(out, ...urlPath.split('/').filter(Boolean).map(decodeURIComponent))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buf)
    const enc = encode(buf, type)
    if (enc.br) writeFileSync(file + '.br', enc.br)
    if (enc.gzip) writeFileSync(file + '.gz', enc.gzip)
    files++
    bytes += enc.br?.length ?? buf.length
  }

  for (const page of kit.pages) {
    write(page.path === '/' ? '/index.html' : page.path + '/index.html', Buffer.from(await page.render()), HTML)
  }
  write('/404.html', Buffer.from(await kit.renderNotFound()), HTML)
  // GET estáticos (force-static): su respuesta se guarda tal cual en la URL.
  for (const s of kit.statics) write(s.path, Buffer.from(s.bytes), s.type)
  for (const f of kit.client.files) write(f.path, f.bytes, f.type || MIME['.js'])

  if (kit.publicDir) {
    const walk = (dir, rel) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        const r = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) {
          walk(join(dir, e.name), r)
          continue
        }
        const buf = readFileSync(join(dir, e.name))
        const type = MIME[extname(e.name).toLowerCase()] ?? 'application/octet-stream'
        const url = '/' + encodeURI(r)
        write(url, buf, type)
        const hashed = kit.app.asset(url)
        if (hashed !== url) {
          write(hashed, buf, type)
          immutable.push(hashed)
        }
      }
    }
    walk(kit.publicDir, '')
  }

  let headers = immutable.map((p) => `${p}\n  Cache-Control: public, max-age=31536000, immutable`).join('\n')
  for (const s of kit.statics) headers += `\n${s.path}\n  Content-Type: ${s.type}`
  if (kit.app.defaultHeaders.length) headers += '\n/*\n' + kit.app.defaultHeaders.map(([k, v]) => `  ${k}: ${v}`).join('\n')
  writeFileSync(join(out, '_headers'), headers + '\n')

  return { out, files, bytes, needsServer: [...kit.dynamic, ...kit.apis], isr: kit.pages.filter((p) => p.mode === 'isr').map((p) => p.path) }
}
