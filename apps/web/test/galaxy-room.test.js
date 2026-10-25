// La sala de la galaxia y su protocolo, con sockets falsos y un reloj controlado.
import { test, expect } from 'bun:test'
import { createRoom } from '../lib/galaxy-room.js'
import { encodePointer, decodePointer, decodeServer, encodeSnapshot, MAX_CURSORS, LIMIT } from '../lib/galaxy-protocol.js'

const fakeWs = () => {
  const ws = { data: {}, sent: [], topics: [], closed: null }
  ws.send = (m) => ws.sent.push(m)
  ws.subscribe = (t) => ws.topics.push(t)
  ws.close = (code, reason) => (ws.closed = { code, reason })
  return ws
}

const setup = (opts = {}) => {
  let t = 1000
  const room = createRoom({ tickMs: 0, now: () => t, ...opts })
  return { room, advance: (ms) => (t += ms) }
}

test('protocolo: ida y vuelta de puntero e instantánea', () => {
  expect(decodePointer(encodePointer([1.5, 0, -2]))).toEqual([1.5, -2])
  expect(decodePointer(encodePointer(null))).toBeNull()
  expect(decodePointer(new Float32Array([LIMIT + 1, 0]).buffer)).toBeUndefined() // fuera de la galaxia
  expect(decodePointer(new Float32Array([Number.NaN, 0]).buffer)).toBeUndefined()
  expect(decodePointer('hola')).toBeUndefined()
  expect(decodePointer(new Uint8Array(12))).toBeUndefined()

  const snap = decodeServer(encodeSnapshot(3, [[7, 1, 2], [9, -1, 0.5]]))
  expect(snap).toEqual({ type: 'snapshot', online: 3, cursors: [{ id: 7, x: 1, z: 2 }, { id: 9, x: -1, z: 0.5 }] })
  const many = Array.from({ length: 40 }, (_, i) => [i + 1, 0, 0])
  expect(decodeServer(encodeSnapshot(40, many)).cursors).toHaveLength(MAX_CURSORS)
  expect(decodeServer(new Uint8Array(5))).toBeNull()
})

test('al entrar: id propio, suscripción y bienvenida', () => {
  const { room } = setup()
  const a = fakeWs()
  room.join(a)
  expect(a.data.id).toBe(1)
  expect(a.topics).toEqual(['galaxia'])
  expect(decodeServer(a.sent[0])).toEqual({ type: 'welcome', id: 1 })
})

test('la instantánea junta los punteros activos y sólo sale si algo cambió', () => {
  const { room, advance } = setup()
  const [a, b] = [fakeWs(), fakeWs()]
  room.join(a)
  room.join(b)
  room.message(a, encodePointer([1, 0, 2]))
  const snap = decodeServer(room.tick())
  expect(snap.online).toBe(2)
  expect(snap.cursors).toEqual([{ id: 1, x: 1, z: 2 }])
  expect(room.tick()).toBeNull() // nada nuevo → nada que enviar
  advance(100)
  room.message(b, encodePointer([-3, 0, 0]))
  expect(decodeServer(room.tick()).cursors).toHaveLength(2)
})

test('límite de ritmo: mensajes a menos de 30 ms se ignoran', () => {
  const { room, advance } = setup()
  const a = fakeWs()
  room.join(a)
  room.message(a, encodePointer([1, 0, 1]))
  room.message(a, encodePointer([5, 0, 5])) // demasiado pronto
  expect(decodeServer(room.tick()).cursors[0]).toEqual({ id: 1, x: 1, z: 1 })
  advance(40)
  room.message(a, encodePointer([5, 0, 5]))
  expect(decodeServer(room.tick()).cursors[0]).toEqual({ id: 1, x: 5, z: 5 })
})

test('punteros quietos caducan, las salidas se publican y la sala tiene aforo', () => {
  const { room, advance } = setup({ maxConnections: 2 })
  const [a, b, c] = [fakeWs(), fakeWs(), fakeWs()]
  room.join(a)
  room.join(b)
  room.join(c)
  expect(c.closed).toEqual({ code: 1013, reason: 'sala llena' })
  room.message(a, encodePointer([1, 0, 1]))
  room.tick()
  advance(5000)
  room.message(b, encodePointer(null)) // cualquier cambio fuerza una instantánea
  expect(decodeServer(room.tick()).cursors).toEqual([]) // el de `a` caducó
  room.leave(a)
  expect(room.size).toBe(1)
  expect(decodeServer(room.tick()).online).toBe(1)
})
