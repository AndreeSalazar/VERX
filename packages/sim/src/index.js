// El ÚNICO puente entre el mundo JS y el mundo Rust (crates/sim).
// El contrato es la ABI documentada en crates/sim/src/abi.rs; si cambia, sube
// ABI_VERSION en los dos lados y `createGalaxy` lo detecta al cargar.
//
// sim.wasm lo genera `bun run wasm` (verx-guard). Nunca se edita a mano.

import wasmUrl from '../sim.wasm' with { type: 'file' }

export const ABI_VERSION = 1
export { wasmUrl }

async function instantiate(source) {
  if (source instanceof WebAssembly.Module) return WebAssembly.instantiate(source)
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return (await WebAssembly.instantiate(source)).instance
  const response = source instanceof Response ? source : await fetch(source)
  if (!response.ok) throw new Error(`[verx/sim] no se pudo descargar ${response.url} (${response.status})`)
  // instantiateStreaming compila mientras descarga; necesita content-type application/wasm.
  if (WebAssembly.instantiateStreaming && response.headers.get('content-type')?.startsWith('application/wasm')) {
    return (await WebAssembly.instantiateStreaming(response)).instance
  }
  return (await WebAssembly.instantiate(await response.arrayBuffer())).instance
}

// Crea la galaxia. `source`: URL, Response, bytes o WebAssembly.Module (por defecto, sim.wasm).
export async function createGalaxy({ count = 30_000, seed = 1, source = wasmUrl } = {}) {
  const instance = await instantiate(source)
  const e = instance.exports
  if (e.verx_abi() !== ABI_VERSION) {
    throw new Error(`[verx/sim] ABI ${e.verx_abi()} en sim.wasm, se esperaba ${ABI_VERSION}: ejecuta \`bun run wasm\``)
  }
  const n = e.verx_init(count, seed)
  // La memoria es estática (no crece): las vistas se crean una vez y valen siempre.
  const points = new Float32Array(e.memory.buffer, e.verx_points(), n * 4)
  const colors = new Float32Array(e.memory.buffer, e.verx_colors(), n * 3)

  return {
    count: n,
    colors,
    points,
    // Avanza dt segundos. pointer: [x, y, z] en el mundo, o null. Devuelve `points`.
    step(dt, pointer = null) {
      if (pointer) e.verx_step(dt, pointer[0], pointer[1], pointer[2], 1)
      else e.verx_step(dt, 0, 0, 0, 0)
      return points
    },
  }
}
