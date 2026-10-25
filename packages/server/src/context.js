import { HttpError } from './errors.js'

// Protocolo para reconocer HTML de confianza sin depender de ningún paquete de
// plantillas: cualquier objeto con esta marca se envía como text/html usando
// su toString(). @veloz/ui lo implementa en el resultado de su JSX de servidor.
export const HTML_MARK = Symbol.for('veloz.html')

const isHtml = (v) => v !== null && typeof v === 'object' && v[HTML_MARK] === true

const TEXT = 'text/plain; charset=utf-8'
const HTML = 'text/html; charset=utf-8'
const JSON_TYPE = 'application/json; charset=utf-8'
const BINARY = 'application/octet-stream'
export const EMPTY = Object.freeze(Object.create(null))

// Un objeto ligero por petición sobre la Request estándar de Bun. Todo lo caro
// (URL, query, cookies, body) se calcula sólo si alguien lo lee.
export class Context {
  constructor(app, req, server, route, params) {
    this.app = app
    this.req = req
    this.server = server
    this.route = route
    this.params = params
    this.statusCode = 200
    this.headers = null // [[k, v], …] añadidas con ctx.set()
    this.response = null // la Response creada con ctx.text()/json()/…
    this._typed = false
    this._failed = false
    this._url = null
    this._query = null
    this._cookies = null
    this._body = null
  }

  get method() {
    return this.req.method
  }

  get url() {
    return (this._url ??= new URL(this.req.url))
  }

  get path() {
    return this.url.pathname
  }

  get query() {
    if (this._query === null) {
      this._query = this.req.url.indexOf('?') === -1 ? EMPTY : Object.fromEntries(this.url.searchParams)
    }
    return this._query
  }

  get cookies() {
    return (this._cookies ??= parseCookies(this.req.headers.get('cookie')))
  }

  get ip() {
    return this.server?.requestIP(this.req)?.address
  }

  header(name) {
    return this.req.headers.get(name)
  }

  // Lee y parsea el cuerpo según content-type (JSON, formulario, texto o bytes).
  // El límite de tamaño lo aplica Bun antes de llegar aquí (413 automático).
  body() {
    return (this._body ??= parseBody(this.req))
  }

  status(code) {
    this.statusCode = code
    return this
  }

  // Añade una cabecera (no reemplaza: así funcionan varios set-cookie).
  set(name, value) {
    ;(this.headers ??= []).push([name, String(value)])
    if (name.length === 12 && name.toLowerCase() === 'content-type') this._typed = true
    return this
  }

  cookie(name, value, { maxAge, expires, domain, path = '/', httpOnly = true, secure = false, sameSite = 'Lax' } = {}) {
    let c = name + '=' + encodeURIComponent(value)
    if (maxAge !== undefined) c += '; Max-Age=' + Math.floor(maxAge)
    if (expires) c += '; Expires=' + expires.toUTCString()
    if (domain) c += '; Domain=' + domain
    if (path) c += '; Path=' + path
    if (httpOnly) c += '; HttpOnly'
    if (secure) c += '; Secure'
    if (sameSite) c += '; SameSite=' + sameSite
    return this.set('set-cookie', c)
  }

  // Lo que devuelve un handler pasa por aquí:
  //   Response → tal cual · string → text/plain · JSX/HTML → text/html
  //   bytes → binario · stream/Blob → streaming · resto → JSON
  send(value) {
    if (value instanceof Response) return (this.response = value)
    if (typeof value === 'string') return this._end(value, TEXT)
    if (isHtml(value)) return this._end(String(value), HTML)
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) return this._end(value, BINARY)
    if (value instanceof ReadableStream || value instanceof Blob) return this._end(value, value.type || BINARY)
    return this.json(value)
  }

  text(value) {
    return this._end(String(value), TEXT)
  }

  html(value) {
    return this._end(String(value), HTML)
  }

  // Si la ruta declaró `response` (un esquema), usa la proyección compilada
  // para respuestas 2xx; los errores siempre van con JSON.stringify.
  json(value) {
    const r = this.route
    const fast = r !== null && r.serialize !== null && this.statusCode < 300
    const body = fast ? r.serialize(value) : JSON.stringify(value)
    return this._end(body === undefined ? 'null' : body, JSON_TYPE)
  }

  redirect(location, status = 302) {
    this.statusCode = status
    this.set('location', location)
    return this._end(null, TEXT)
  }

  stream(body, type = BINARY) {
    return this._end(body, type)
  }

  _end(body, type) {
    const d = this.app.defaultHeaders
    let headers
    if (this.headers === null && d.length === 0) {
      headers = { 'content-type': type } // camino rápido: sin arrays intermedios
    } else {
      headers = this._typed ? [] : [['content-type', type]]
      for (let i = 0; i < d.length; i++) headers.push(d[i])
      if (this.headers !== null) for (let i = 0; i < this.headers.length; i++) headers.push(this.headers[i])
    }
    return (this.response = new Response(body, { status: this.statusCode, headers }))
  }
}

async function parseBody(req) {
  const type = req.headers.get('content-type') ?? ''
  if (type.startsWith('application/json')) {
    const text = await req.text()
    if (text === '') return undefined
    try {
      return JSON.parse(text)
    } catch {
      throw new HttpError(400, 'Invalid JSON')
    }
  }
  if (type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data')) {
    const out = Object.create(null)
    for (const [k, v] of await req.formData()) out[k] = v
    return out
  }
  if (type.startsWith('text/')) return req.text()
  const buf = await req.arrayBuffer()
  return buf.byteLength === 0 ? undefined : new Uint8Array(buf)
}

function parseCookies(header) {
  const out = Object.create(null)
  if (!header) return out
  let i = 0
  while (i < header.length) {
    let end = header.indexOf(';', i)
    if (end === -1) end = header.length
    const eq = header.indexOf('=', i)
    if (eq !== -1 && eq < end) {
      const key = header.slice(i, eq).trim()
      let val = header.slice(eq + 1, end).trim()
      if (val.charCodeAt(0) === 34 /* " */) val = val.slice(1, -1)
      if (!(key in out)) out[key] = val.includes('%') ? safeDecode(val) : val
    }
    i = end + 1
  }
  return out
}

export function safeDecode(s) {
  if (s.indexOf('%') === -1) return s
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
