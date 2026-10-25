// Generador de carga minimalista al estilo wrk/autocannon, sin dependencias:
// N hilos × M conexiones keep-alive, una petición en vuelo por conexión.
// Habla HTTP/1.1 directamente sobre TCP (node:net) y sólo entiende respuestas
// con content-length, para que el cliente cueste lo mínimo posible.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { connect } from 'node:net'

const BUCKET_US = 10 // resolución del histograma de latencias
const BUCKETS = 200_000 // hasta 2 s

export async function load({ port, host = '127.0.0.1', path = '/', headers = {}, connections = 100, threads = 4, duration = 10 }) {
  const per = Math.ceil(connections / threads)
  const parts = await Promise.all(
    Array.from({ length: threads }, () => new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { port, host, path, headers, connections: per, duration } })
      w.once('message', resolve)
      w.once('error', reject)
    })),
  )

  const hist = new Float64Array(BUCKETS)
  let count = 0, errors = 0, non2xx = 0, bytes = 0, latSum = 0
  for (const p of parts) {
    count += p.count
    errors += p.errors
    non2xx += p.non2xx
    bytes += p.bytes
    latSum += p.latSum
    const h = new Uint32Array(p.hist)
    for (let i = 0; i < BUCKETS; i++) hist[i] += h[i]
  }
  const percentile = (q) => {
    const target = count * q
    let acc = 0
    for (let i = 0; i < BUCKETS; i++) if ((acc += hist[i]) >= target) return ((i + 0.5) * BUCKET_US) / 1000
    return NaN
  }
  return {
    rps: count / duration,
    count,
    errors,
    non2xx,
    mbps: bytes / duration / 1024 / 1024,
    avg: count ? latSum / count : NaN,
    p50: percentile(0.5),
    p99: percentile(0.99),
  }
}

if (!isMainThread) {
  const { port, host, path, headers, connections, duration } = workerData
  let head = `GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\n`
  for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`
  const request = Buffer.from(head + '\r\n')
  const CRLF2 = Buffer.from('\r\n\r\n')
  const hist = new Uint32Array(BUCKETS)
  const deadline = performance.now() + duration * 1000
  let count = 0, errors = 0, non2xx = 0, bytes = 0, latSum = 0, open = connections

  const finish = () => {
    if (--open === 0) parentPort.postMessage({ count, errors, non2xx, bytes, latSum, hist: hist.buffer }, [hist.buffer])
  }

  for (let c = 0; c < connections; c++) {
    const socket = connect({ port, host, noDelay: true })
    let t0 = 0, remaining = -1, pending = null, closed = false
    const close = () => {
      if (closed) return
      closed = true
      socket.destroy()
      finish()
    }
    const send = () => {
      const now = performance.now()
      if (now >= deadline) return close()
      t0 = now
      socket.write(request)
    }
    socket.on('connect', send)
    socket.on('error', () => {
      errors++
      close()
    })
    socket.on('close', close)
    socket.on('data', (chunk) => {
      bytes += chunk.length
      const data = pending === null ? chunk : Buffer.concat([pending, chunk])
      pending = null
      let off = 0
      while (off < data.length) {
        if (remaining < 0) {
          const end = data.indexOf(CRLF2, off)
          if (end === -1) {
            pending = data.subarray(off)
            return
          }
          const status = (data[off + 9] - 48) * 100 + (data[off + 10] - 48) * 10 + (data[off + 11] - 48)
          if (status < 200 || status >= 400) non2xx++
          const headText = data.toString('latin1', off, end).toLowerCase()
          const at = headText.indexOf('content-length:')
          if (at === -1) {
            errors++ // chunked no soportado: el servidor debería mandar content-length
            return close()
          }
          remaining = parseInt(headText.slice(at + 15), 10)
          off = end + 4
        }
        const avail = data.length - off
        if (avail < remaining) {
          remaining -= avail
          return
        }
        off += remaining
        remaining = -1
        const now = performance.now()
        if (now <= deadline) {
          const ms = now - t0
          count++
          latSum += ms
          const b = ((ms * 1000) / BUCKET_US) | 0
          hist[b < BUCKETS ? b : BUCKETS - 1]++
        }
        send()
      }
    })
  }
}
