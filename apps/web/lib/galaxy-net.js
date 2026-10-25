// Cliente de la galaxia multijugador (navegador). Envía tu puntero como mucho
// cada 50 ms, recibe los de los demás e interpola su movimiento para que se
// vea fluido aunque lleguen 15 veces por segundo. Si la conexión cae, reintenta
// con espera creciente; mientras tanto la galaxia sigue en modo un jugador.

import { encodePointer, decodeServer } from './galaxy-protocol.js'

export function connectGalaxy(url, { onOnline } = {}) {
  const cursors = new Map() // id → { x, z, tx, tz }
  let ws = null
  let self = 0
  let closed = false
  let retry = 1000
  let lastSent = 0
  let lastWasNull = true

  const open = () => {
    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => (retry = 1000)
    ws.onmessage = (e) => {
      const msg = decodeServer(e.data)
      if (msg?.type === 'welcome') self = msg.id
      if (msg?.type !== 'snapshot') return
      const seen = new Set()
      for (const c of msg.cursors) {
        if (c.id === self) continue
        seen.add(c.id)
        const known = cursors.get(c.id)
        if (known) Object.assign(known, { tx: c.x, tz: c.z })
        else cursors.set(c.id, { x: c.x, z: c.z, tx: c.x, tz: c.z })
      }
      for (const id of cursors.keys()) if (!seen.has(id)) cursors.delete(id)
      onOnline?.(msg.online)
    }
    ws.onclose = () => {
      cursors.clear()
      onOnline?.(1)
      if (!closed) setTimeout(open, (retry = Math.min(retry * 2, 30_000)))
    }
  }
  open()

  return {
    cursors,
    // p: [x, y, z] o null. Sin repetir "null" ni pasar de 20 mensajes por segundo.
    send(p) {
      if (ws?.readyState !== WebSocket.OPEN) return
      const now = performance.now()
      if (p === null ? lastWasNull : now - lastSent < 50) return
      lastSent = now
      lastWasNull = p === null
      ws.send(encodePointer(p))
    },
    smooth(dt) {
      const k = 1 - Math.exp(-dt * 12)
      for (const c of cursors.values()) {
        c.x += (c.tx - c.x) * k
        c.z += (c.tz - c.z) * k
      }
    },
    close() {
      closed = true
      ws?.close()
    },
  }
}
