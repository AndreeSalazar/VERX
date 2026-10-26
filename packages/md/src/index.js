// Puente JS ↔ Rust del Markdown (crates/md). El contrato es la ABI documentada
// en crates/md/src/abi.rs; si cambia, sube ABI_VERSION en los dos lados y
// `createMarkdown` lo detecta al cargar.
//
// md.wasm lo genera `bun run wasm` (verx-guard). Nunca se edita a mano.

import wasmUrl from '../md.wasm' with { type: 'file' }

export const ABI_VERSION = 1
export { wasmUrl }

async function instantiate(source) {
  // En el servidor, Bun resuelve `type: 'file'` a una ruta del disco, no a una URL.
  if (typeof source === 'string' && globalThis.Bun && !/^https?:/.test(source)) {
    source = await globalThis.Bun.file(source).arrayBuffer()
  }
  if (source instanceof WebAssembly.Module) return WebAssembly.instantiate(source)
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return (await WebAssembly.instantiate(source)).instance
  const response = source instanceof Response ? source : await fetch(source)
  if (!response.ok) throw new Error(`[verx/md] no se pudo descargar ${response.url} (${response.status})`)
  return (await WebAssembly.instantiate(await response.arrayBuffer())).instance
}

// Crea el conversor. `source`: URL, Response, bytes o WebAssembly.Module (por defecto, md.wasm).
export async function createMarkdown({ source = wasmUrl } = {}) {
  const e = (await instantiate(source)).exports
  if (e.verx_abi() !== ABI_VERSION) {
    throw new Error(`[verx/md] ABI ${e.verx_abi()} en md.wasm, se esperaba ${ABI_VERSION}: ejecuta \`bun run wasm\``)
  }
  // La memoria es estática (no crece): las vistas se crean una vez y valen siempre.
  const input = new Uint8Array(e.memory.buffer, e.verx_input(), e.verx_input_capacity())
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const read = (ptr, len) => decoder.decode(new Uint8Array(e.memory.buffer, ptr, len))

  return {
    // Markdown → { html, front, headings: [{ level, id, text }], words }.
    render(markdown) {
      const text = String(markdown).replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
      const { read: consumed, written } = encoder.encodeInto(text, input)
      if (consumed < text.length) throw new Error(`[verx/md] el documento no cabe en ${input.length} bytes`)
      if (e.verx_render(written) !== 1) throw new Error('[verx/md] el HTML del documento no cabe en la memoria del .wasm')
      const meta = JSON.parse(read(e.verx_meta(), e.verx_meta_len()))
      return { html: read(e.verx_html(), e.verx_html_len()), ...meta }
    },
  }
}
