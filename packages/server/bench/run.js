// bun bench/run.js [--duration 8] [--connections 100] [--threads 4] [--only veloz]
// Cada servidor corre en su propio proceso; el generador de carga (load.js)
// usa varios hilos y habla HTTP/1.1 directamente sobre TCP.
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { load } from './load.js'

const { values: args } = parseArgs({
  options: {
    duration: { type: 'string', default: '8' },
    warmup: { type: 'string', default: '2' },
    connections: { type: 'string', default: '100' },
    threads: { type: 'string', default: '4' },
    only: { type: 'string' },
  },
})

const br = { 'accept-encoding': 'gzip, br' }
const target = (name) => fileURLToPath(new URL(`./targets/${name}`, import.meta.url))
const scenarios = [
  { name: 'node:http puro · texto', cmd: ['node', target('node-raw.js')], path: '/' },
  { name: 'Bun.serve puro · texto', cmd: [process.execPath, target('bun-raw.js')], path: '/' },
  { name: 'Veloz · texto', cmd: [process.execPath, target('veloz.js')], path: '/' },
  { name: 'node:http puro · JSON', cmd: ['node', target('node-raw.js')], path: '/user/42' },
  { name: 'Bun.serve puro · JSON', cmd: [process.execPath, target('bun-raw.js')], path: '/user/42' },
  { name: 'Veloz · /user/:id + esquema', cmd: [process.execPath, target('veloz.js')], path: '/user/42' },
  { name: 'Veloz · prerender (brotli)', cmd: [process.execPath, target('veloz.js')], path: '/page', headers: br },
  { name: 'Veloz · style.css (brotli)', cmd: [process.execPath, target('veloz.js')], path: '/style.css', headers: br },
].filter((s) => !args.only || s.name.toLowerCase().includes(args.only.toLowerCase()))

const opts = { connections: Number(args.connections), threads: Number(args.threads), duration: Number(args.duration) }
let port = 4100

async function waitForPort(p) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${p}/`)
      return
    } catch {
      await Bun.sleep(50)
    }
  }
  throw new Error(`el servidor no arrancó en el puerto ${p}`)
}

console.log(`Bun ${Bun.version} · ${navigator.hardwareConcurrency} núcleos · ${opts.connections} conexiones · ${opts.threads} hilos de carga · ${opts.duration}s por escenario\n`)
console.log('Escenario'.padEnd(32), 'req/s'.padStart(10), 'media'.padStart(9), 'p50'.padStart(9), 'p99'.padStart(9), 'MB/s'.padStart(8), ' errores')

for (const s of scenarios) {
  const p = port++
  const child = Bun.spawn(s.cmd, { env: { ...process.env, PORT: String(p) }, stdio: ['ignore', 'inherit', 'inherit'] })
  try {
    await waitForPort(p)
    const base = { port: p, path: s.path, headers: s.headers ?? {}, connections: opts.connections, threads: opts.threads }
    await load({ ...base, duration: Number(args.warmup) })
    const r = await load({ ...base, duration: opts.duration })
    const ms = (v) => `${v.toFixed(2)}ms`.padStart(9)
    console.log(
      s.name.padEnd(32),
      Math.round(r.rps).toLocaleString('es').padStart(10),
      ms(r.avg),
      ms(r.p50),
      ms(r.p99),
      r.mbps.toFixed(1).padStart(8),
      ` ${r.errors + r.non2xx}`,
    )
  } finally {
    child.kill()
    await child.exited
  }
}
