// Protocolo binario de la galaxia multijugador. Lo comparten el servidor y el
// navegador (no importa nada de servidor). Todo son Float32 en little-endian.
//
// Cliente → servidor (cada ≤ 50 ms):
//   8 bytes  [x, z]   posición del puntero sobre el plano de la galaxia
//   0 bytes            el puntero salió de la galaxia
// Servidor → cliente:
//   [1, id]                              bienvenida: tu identificador
//   [2, online, n, id, x, z, id, x, z…]  instantánea (≤ 15 veces por segundo)

export const TOPIC = 'galaxia'
export const MAX_CURSORS = 15 // + el tuyo = 16 punteros (el máximo de la ABI v2)
export const LIMIT = 8 // |x|, |z| máximos: fuera de eso no hay galaxia
const WELCOME = 1
const SNAPSHOT = 2

export const encodeWelcome = (id) => new Float32Array([WELCOME, id]).buffer

// cursors: [[id, x, z], …]; online: personas conectadas (con o sin puntero).
export function encodeSnapshot(online, cursors) {
  const list = cursors.slice(0, MAX_CURSORS)
  const f = new Float32Array(3 + list.length * 3)
  f[0] = SNAPSHOT
  f[1] = online
  f[2] = list.length
  list.forEach((c, i) => f.set(c, 3 + i * 3))
  return f.buffer
}

const view = (data) => {
  if (data instanceof ArrayBuffer) return new DataView(data)
  if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength)
  return null
}

// Mensaje del servidor → { type: 'welcome', id } | { type: 'snapshot', online, cursors } | null
export function decodeServer(data) {
  const v = view(data)
  if (!v || v.byteLength < 8 || v.byteLength % 4) return null
  const at = (i) => v.getFloat32(i * 4, true)
  if (at(0) === WELCOME) return { type: 'welcome', id: at(1) }
  if (at(0) !== SNAPSHOT || v.byteLength < 12) return null
  const n = at(2)
  if (!Number.isInteger(n) || v.byteLength !== (3 + n * 3) * 4) return null
  const cursors = []
  for (let i = 0; i < n; i++) cursors.push({ id: at(3 + i * 3), x: at(4 + i * 3), z: at(5 + i * 3) })
  return { type: 'snapshot', online: at(1), cursors }
}

export const encodePointer = (p) => (p ? new Float32Array([p[0], p[2]]).buffer : new ArrayBuffer(0))

// Mensaje del cliente → [x, z] | null (salió) | undefined (inválido: se ignora)
export function decodePointer(data) {
  const v = view(data)
  if (!v) return undefined
  if (v.byteLength === 0) return null
  if (v.byteLength !== 8) return undefined
  const x = v.getFloat32(0, true)
  const z = v.getFloat32(4, true)
  const ok = Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT
  return ok ? [x, z] : undefined
}
