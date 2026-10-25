// La sala de la galaxia (servidor). Guarda dónde está el puntero de cada
// visitante y, como mucho 15 veces por segundo y sólo si algo cambió, publica
// una instantánea a todos. Así el tráfico crece con N, no con N² (no se
// reenvía cada mensaje a cada persona).
//
// Defensas: máximo de conexiones, ≤ 1 mensaje cada 30 ms por persona, mensajes
// inválidos ignorados, punteros quietos más de 4 s se retiran.

import { TOPIC, encodeWelcome, encodeSnapshot, decodePointer } from './galaxy-protocol.js'

export function createRoom({ tickMs = 66, staleMs = 4000, minGapMs = 30, maxConnections = 256, now = () => performance.now() } = {}) {
  const members = new Map() // id → { pos: [x, z] | null, at, last }
  let nextId = 1
  let dirty = false
  let timer = null
  let server = null

  const snapshot = () => {
    const t = now()
    const cursors = []
    for (const [id, m] of members) {
      if (m.pos && t - m.at > staleMs) m.pos = null
      if (m.pos) cursors.push([id, m.pos[0], m.pos[1]])
    }
    return encodeSnapshot(members.size, cursors)
  }

  const room = {
    get size() {
      return members.size
    },

    join(ws) {
      if (members.size >= maxConnections) return ws.close(1013, 'sala llena')
      const id = nextId
      nextId = (nextId % 65_535) + 1
      ws.data.id = id
      members.set(id, { pos: null, at: now(), last: 0 })
      ws.subscribe(TOPIC)
      ws.send(encodeWelcome(id))
      server = ws.data.server ?? server
      dirty = true
      if (tickMs > 0 && timer === null) timer = setInterval(() => room.tick(), tickMs)
    },

    message(ws, data) {
      const m = members.get(ws.data.id)
      const t = now()
      if (!m || t - m.last < minGapMs) return
      const pos = decodePointer(data)
      if (pos === undefined) return
      m.last = t
      m.at = t
      m.pos = pos
      dirty = true
    },

    leave(ws) {
      if (!members.delete(ws.data.id)) return
      dirty = true
      if (members.size === 0 && timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },

    // Publica la instantánea si algo cambió. Devuelve los bytes (o null).
    tick() {
      if (!dirty || members.size === 0) return null
      dirty = false
      const bytes = snapshot()
      server?.publish(TOPIC, bytes)
      return bytes
    },
  }
  return room
}
