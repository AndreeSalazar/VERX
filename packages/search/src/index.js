// Puente JS ↔ Rust del buscador (crates/search). El contrato es la ABI
// documentada en crates/search/src/abi.rs; si cambia, sube ABI_VERSION en los
// dos lados y `createSearch` lo detecta al cargar.
//
// search.wasm lo genera `bun run wasm` (verx-guard). Nunca se edita a mano.
//
// Paquete de índice (lo que viaja por la red), formato "VXSP":
//   "VXSP" · u32 longitud de los datos · datos JSON (uno por documento) · índice VXS1

import wasmUrl from '../search.wasm' with { type: 'file' }

export const ABI_VERSION = 1
export { wasmUrl }

const PACK = [86, 88, 83, 80] // "VXSP"
const DOC_SEP = '\x1E'
const FIELD_SEP = '\x1F'
const clean = (s) => String(s ?? '').replace(/[\x1E\x1F]/g, ' ')

async function instantiate(source) {
  // En el servidor, Bun resuelve `type: 'file'` a una ruta del disco, no a una URL.
  if (typeof source === 'string' && globalThis.Bun && !/^https?:/.test(source)) {
    source = await globalThis.Bun.file(source).arrayBuffer()
  }
  if (source instanceof WebAssembly.Module) return WebAssembly.instantiate(source)
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return (await WebAssembly.instantiate(source)).instance
  const response = source instanceof Response ? source : await fetch(source)
  if (!response.ok) throw new Error(`[verx/search] no se pudo descargar ${response.url} (${response.status})`)
  if (WebAssembly.instantiateStreaming && response.headers.get('content-type')?.startsWith('application/wasm')) {
    return (await WebAssembly.instantiateStreaming(response)).instance
  }
  return (await WebAssembly.instantiate(await response.arrayBuffer())).instance
}

// Crea un buscador. `source`: URL, Response, bytes o WebAssembly.Module (por defecto, search.wasm).
export async function createSearch({ source = wasmUrl } = {}) {
  const e = (await instantiate(source)).exports
  if (e.verx_abi() !== ABI_VERSION) {
    throw new Error(`[verx/search] ABI ${e.verx_abi()} en search.wasm, se esperaba ${ABI_VERSION}: ejecuta \`bun run wasm\``)
  }
  // La memoria es estática (no crece): las vistas se crean una vez y valen siempre.
  const input = new Uint8Array(e.memory.buffer, e.verx_input(), e.verx_input_capacity())
  const index = new Uint8Array(e.memory.buffer, e.verx_index(), e.verx_index_capacity())
  const results = new Uint32Array(e.memory.buffer, e.verx_results(), 64 * 2)
  const encoder = new TextEncoder()
  let data = []

  const write = (text) => {
    const { read, written } = encoder.encodeInto(text, input)
    return { complete: read === text.length, written }
  }

  return {
    // Documentos del índice cargado.
    get size() {
      return data.length
    },

    // Indexa [{ title, body, data? }] y devuelve el paquete "VXSP" (queda cargado).
    // `data` es lo que devolverá cada resultado; por defecto, { title }.
    build(docs) {
      const text = docs.map((d) => clean(d.title) + FIELD_SEP + clean(d.body)).join(DOC_SEP)
      const { complete, written } = write(text)
      if (!complete) throw new Error(`[verx/search] el corpus no cabe en ${input.length} bytes`)
      const n = e.verx_build(written)
      if (n === 0) throw new Error('[verx/search] el índice no cabe en la memoria del .wasm')
      data = docs.map((d) => d.data ?? { title: d.title })
      const meta = encoder.encode(JSON.stringify(data))
      const pack = new Uint8Array(8 + meta.length + n)
      pack.set(PACK)
      new DataView(pack.buffer).setUint32(4, meta.length, true)
      pack.set(meta, 8)
      pack.set(index.subarray(0, n), 8 + meta.length)
      return pack
    },

    // Carga un paquete "VXSP" (de `build`, normalmente descargado). Devuelve sus documentos.
    load(pack) {
      const bytes = pack instanceof Uint8Array ? pack : new Uint8Array(pack)
      if (bytes.length < 8 || PACK.some((b, i) => bytes[i] !== b)) throw new Error('[verx/search] no es un paquete de índice VXSP')
      const metaLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(4, true)
      const body = bytes.subarray(8 + metaLength)
      if (8 + metaLength > bytes.length || body.length > index.length) throw new Error('[verx/search] paquete de índice truncado o demasiado grande')
      index.set(body)
      const docs = e.verx_load(body.length)
      if (docs === 0) throw new Error('[verx/search] índice corrupto o de otra versión: reconstrúyelo')
      data = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + metaLength)))
      return docs
    },

    // Busca mientras escribes: cada palabra es un prefijo y deben estar todas.
    // Devuelve [{ ...data, score }] de más a menos relevante.
    query(text, limit = 8) {
      const { written } = write(String(text ?? ''))
      const n = e.verx_query(written, Math.max(0, Math.min(limit, 64)))
      const out = []
      for (let i = 0; i < n; i++) out.push({ ...data[results[i * 2]], score: results[i * 2 + 1] })
      return out
    },
  }
}
