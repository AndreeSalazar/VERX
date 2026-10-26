// Puente JS ↔ Rust de las imágenes (crates/img). El contrato es la ABI
// documentada en crates/img/src/abi.rs; si cambia, sube ABI_VERSION en los dos
// lados y `createImages` lo detecta al cargar.
//
// img.wasm lo genera `bun run wasm` (verx-guard). Nunca se edita a mano.
// A diferencia de los otros puentes, su memoria crece: las vistas se crean de
// nuevo después de cada llamada.

import wasmUrl from '../img.wasm' with { type: 'file' }

export const ABI_VERSION = 2
export { wasmUrl }

async function instantiate(source) {
  // En el servidor, Bun resuelve `type: 'file'` a una ruta del disco, no a una URL.
  if (typeof source === 'string' && globalThis.Bun && !/^https?:/.test(source)) {
    source = await globalThis.Bun.file(source).arrayBuffer()
  }
  if (source instanceof WebAssembly.Module) return WebAssembly.instantiate(source)
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return (await WebAssembly.instantiate(source)).instance
  const response = source instanceof Response ? source : await fetch(source)
  if (!response.ok) throw new Error(`[verx/img] no se pudo descargar ${response.url} (${response.status})`)
  return (await WebAssembly.instantiate(await response.arrayBuffer())).instance
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0')

// Crea el procesador. `source`: URL, Response, bytes o WebAssembly.Module (por defecto, img.wasm).
export async function createImages({ source = wasmUrl } = {}) {
  const e = (await instantiate(source)).exports
  if (e.verx_abi() !== ABI_VERSION) {
    throw new Error(`[verx/img] ABI ${e.verx_abi()} en img.wasm, se esperaba ${ABI_VERSION}: ejecuta \`bun run wasm\``)
  }
  const write = (bytes) => {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    // Primero reservar: puede hacer crecer la memoria y dejar obsoleto e.memory.buffer.
    const ptr = e.verx_alloc(data.length)
    new Uint8Array(e.memory.buffer, ptr, data.length).set(data)
    return data.length
  }
  // Copia el último PNG fuera de la memoria del .wasm (que puede cambiar en la siguiente llamada).
  const output = (len, type = 'image/png') => {
    const ptr = e.verx_output()
    return {
      type,
      bytes: new Uint8Array(e.memory.buffer, ptr, len).slice(),
      width: e.verx_out_width(),
      height: e.verx_out_height(),
    }
  }
  const error = () => new TextDecoder().decode(new Uint8Array(e.memory.buffer, e.verx_error(), e.verx_error_len()))

  return {
    // PNG → { width, height, alpha, color, variants: [{ type, width, height, bytes }], placeholder }.
    // `widths`: anchos a generar (los mayores que el original se quedan en el original: nunca agranda).
    // `format`: 'auto' (JPEG si es opaca, PNG si tiene transparencia), 'jpeg' o 'png'.
    // `quality`: calidad del JPEG, de 1 a 100.
    // `placeholder`: lado mayor de la miniatura en píxeles (0 = ninguna).
    process(png, { widths = [], format = 'auto', quality = 82, placeholder = 24 } = {}) {
      const code = e.verx_decode(write(png))
      if (code !== 0) throw new Error(`[verx/img] PNG no válido: ${error()}`)
      const width = e.verx_width()
      const height = e.verx_height()
      const unique = [...new Set(widths.map((w) => Math.min(Math.round(w), width)))].sort((a, b) => a - b)
      const alpha = e.verx_alpha() === 1
      // El JPEG no guarda transparencia: con alfa, PNG siempre.
      const jpeg = !alpha && (format === 'jpeg' || format === 'auto')
      const variant = (w) => (jpeg ? output(e.verx_resize_jpeg(w, quality), 'image/jpeg') : output(e.verx_resize(w)))
      return {
        width,
        height,
        alpha,
        color: hex(e.verx_color()),
        variants: unique.map(variant),
        placeholder: placeholder > 0 ? output(e.verx_placeholder(placeholder)) : null,
      }
    },
    // RGBA en bruto (width × height × 4 bytes) → PNG.
    encode(rgba, width, height) {
      if (rgba.length < width * height * 4) throw new Error(`[verx/img] faltan píxeles para ${width}×${height}`)
      write(rgba)
      const len = e.verx_encode(width, height)
      if (len === 0) throw new Error(`[verx/img] no se pudo codificar: ${error()}`)
      return output(len).bytes
    },
  }
}
