// Puente entre el mundo JS y el crate de la galaxia (crates/sim). Sólo los
// paquetes puente (declarados en crates/*/Cargo.toml) pueden cargar un .wasm.
// El contrato es la ABI documentada en crates/sim/src/abi.rs; si cambia, sube
// ABI_VERSION en los dos lados y `createGalaxy` lo detecta al cargar.
//
// sim.wasm lo genera `bun run wasm` (verx-guard). Nunca se edita a mano.

import wasmUrl from '../sim.wasm' with { type: 'file' }

export const ABI_VERSION = 2
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
  const maxPointers = e.verx_max_pointers()
  const pointerBuffer = new Float32Array(e.memory.buffer, e.verx_pointers(), maxPointers * 3)

  return {
    count: n,
    colors,
    points,
    maxPointers,
    // Avanza dt segundos. pointers: lista de [x, y, z] en el mundo (el tuyo y los
    // de otros visitantes); se usan como mucho `maxPointers`. Devuelve `points`.
    step(dt, pointers = []) {
      const k = Math.min(pointers.length, maxPointers)
      for (let i = 0; i < k; i++) pointerBuffer.set(pointers[i], i * 3)
      e.verx_step(dt, k)
      return points
    },
  }
}
