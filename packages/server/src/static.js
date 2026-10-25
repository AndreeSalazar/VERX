// Archivos estáticos "precocinados":
//  · Se leen UNA vez al arrancar y viven en memoria (los enormes van con Bun.file → sendfile).
//  · Se comprimen al arrancar con brotli calidad máxima y gzip nivel 9,
//    algo demasiado lento para hacerlo por petición pero gratis aquí.
//  · Las cabeceras (ETag, cache-control, vary…) se construyen una sola vez.
//  · Cada archivo es una ruta exacta del router nativo de Bun: no hay fs.stat,
//    ni path.join, ni riesgo de path traversal por petición.
//  · Además se publica una URL con huella (style.3f9a2c1b4e.css) cacheable
//    para siempre (immutable): el navegador ni siquiera revalida.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync, constants as Z } from 'node:zlib'
import { createHash } from 'node:crypto'

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

// application/x-verx-*: formatos propios (p. ej. el índice de @verx/search).
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|wasm|manifest|x-verx-)|image\/svg)/
const MIN_COMPRESS = 1024
export const IMMUTABLE = 'public, max-age=31536000, immutable'

export function cacheControl(maxAge) {
  return maxAge > 0 ? `public, max-age=${maxAge}` : 'no-cache'
}

// Calcula huella y variantes comprimidas de un buffer.
// `quality` (brotli 0-11): máxima al arrancar; más baja si se genera en caliente (ISR).
export function encode(buf, type, { quality = buf.length <= 1 << 20 ? 11 : 9 } = {}) {
  const out = { hash: createHash('sha256').update(buf).digest('hex').slice(0, 10), identity: buf, br: null, gzip: null }
  if (buf.length >= MIN_COMPRESS && COMPRESSIBLE.test(type)) {
    const br = brotliCompressSync(buf, {
      params: {
        [Z.BROTLI_PARAM_QUALITY]: quality,
        [Z.BROTLI_PARAM_MODE]: Z.BROTLI_MODE_TEXT,
        [Z.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    })
    if (br.length < buf.length) out.br = br
    const gz = gzipSync(buf, { level: quality >= 9 ? 9 : 6 })
    if (gz.length < buf.length) out.gzip = gz
  }
  return out
}

// Devuelve { serve(req, extraHeaders?) → Response, hash, enc } con todo precalculado.
// `extra` son cabeceras fijas [[k, v], …] que se hornean en cada variante.
export function buildAsset(enc, type, cache, extra = []) {
  const compressed = enc.br !== null || enc.gzip !== null
  const variant = (body, coding) => {
    const etag = coding ? `"${enc.hash}-${coding}"` : `"${enc.hash}"`
    const common = { etag, 'cache-control': cache }
    if (compressed) common.vary = 'accept-encoding'
    for (const [k, v] of extra) common[k] = v
    const headers = { 'content-type': type, ...common }
    if (coding) headers['content-encoding'] = coding
    return { etag, body, headers, notModified: common }
  }
  const identity = variant(enc.identity, null)
  const br = enc.br !== null ? variant(enc.br, 'br') : null
  const gz = enc.gzip !== null ? variant(enc.gzip, 'gzip') : null

  function serve(req, more) {
    let v = identity
    if (compressed) {
      const ae = req.headers.get('accept-encoding')
      if (ae !== null) {
        if (br !== null && ae.includes('br')) v = br
        else if (gz !== null && ae.includes('gzip')) v = gz
      }
    }
    const inm = req.headers.get('if-none-match')
    if (inm !== null && (inm === '*' || inm.includes(v.etag))) {
      return new Response(null, { status: 304, headers: more ? merge(v.notModified, more) : v.notModified })
    }
    return new Response(v.body, { headers: more ? merge(v.headers, more) : v.headers })
  }

  return { serve, hash: enc.hash, enc, type }
}

function merge(base, more) {
  const h = new Headers(base)
  for (const [k, v] of more) h.append(k, v)
  return h
}

// Para archivos enormes: Bun.file usa sendfile, sin copiar a memoria ni comprimir.
function fileAsset(path, type, cache, extra) {
  const headers = { 'content-type': type, 'cache-control': cache }
  for (const [k, v] of extra) headers[k] = v
  return {
    hash: null,
    enc: null,
    type,
    serve: (req, more) => new Response(Bun.file(path), { headers: more ? merge(headers, more) : headers }),
  }
}

function walk(dir, rel = '', out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // ignora dotfiles (.env, .git…)
    const r = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(join(dir, entry.name), r, out)
    else if (entry.isFile()) out.push(r)
  }
  return out
}

export function loadStatic(dir, { prefix = '/', maxAge = 0, cleanUrls = false, fingerprint = true, maxFileSize = 10 << 20, headers = [] } = {}) {
  const root = resolve(dir instanceof URL ? fileURLToPath(dir) : dir)
  const base = prefix.endsWith('/') ? prefix : prefix + '/'
  const cache = cacheControl(maxAge)
  const files = []

  for (const rel of walk(root)) {
    const full = join(root, rel)
    const url = base + encodeURI(rel)
    const type = MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream'

    if (statSync(full).size > maxFileSize) {
      files.push({ path: url, paths: [url], asset: fileAsset(full, type, cache, headers), file: full })
      continue
    }

    const enc = encode(readFileSync(full), type)
    const paths = [url]
    if (rel === 'index.html' || rel.endsWith('/index.html')) paths.push(url.slice(0, -'/index.html'.length) || '/')
    else if (cleanUrls && rel.endsWith('.html')) paths.push(url.slice(0, -'.html'.length))

    const file = { path: url, paths, asset: buildAsset(enc, type, cache, headers), file: full }
    if (fingerprint && !type.startsWith('text/html')) {
      const dot = url.lastIndexOf('.')
      file.hashedPath = dot > url.lastIndexOf('/') ? `${url.slice(0, dot)}.${enc.hash}${url.slice(dot)}` : `${url}.${enc.hash}`
      file.immutable = buildAsset(enc, type, IMMUTABLE, headers)
    }
    files.push(file)
  }
  return files
}
