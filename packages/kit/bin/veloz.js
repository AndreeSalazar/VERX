#!/usr/bin/env bun
// veloz dev    → servidor de desarrollo con recarga en vivo
// veloz build  → exporta lo estático a dist/
// veloz start  → servidor de producción
import { parseArgs } from 'node:util'

const [command = 'help', ...rest] = process.argv.slice(2)
const { values } = parseArgs({
  args: rest,
  options: {
    port: { type: 'string', short: 'p' },
    out: { type: 'string', short: 'o' },
    workers: { type: 'string', short: 'w' },
    dev: { type: 'boolean' },
  },
  allowPositionals: true,
})
const root = process.cwd()
const port = Number(values.port ?? process.env.PORT ?? 3000)

if (typeof Bun === 'undefined') {
  console.error('Veloz necesita Bun: https://bun.sh')
  process.exit(1)
}

switch (command) {
  case 'dev': {
    const { dev } = await import('../src/dev.js')
    dev({ root, port })
    break
  }
  case 'serve': // lo usa `dev` internamente
  case 'start': {
    const t = performance.now()
    // En Windows un hijo no muere con su padre: si `veloz dev` desaparece, nos vamos.
    const parent = Number(process.env.VELOZ_PARENT)
    if (parent) {
      setInterval(() => {
        try {
          process.kill(parent, 0)
        } catch {
          process.exit(0)
        }
      }, 1000).unref()
    }
    const { createKit } = await import('../src/kit.js')
    const kit = await createKit({ root, dev: Boolean(values.dev) })
    await kit.listen(port, { workers: values.workers ?? process.env.WORKERS ?? 1, log: false })
    if (process.env.VELOZ_WORKER !== '1') {
      const { pages, dynamic, apis, client } = kit
      console.log(`[veloz] ${values.dev ? 'desarrollo' : 'producción'} en http://localhost:${port} · listo en ${Math.round(performance.now() - t)} ms`)
      console.log(`        ${pages.length} páginas estáticas/ISR · ${dynamic.length} dinámicas · ${apis.length} endpoints API · ${client.count} componentes cliente`)
    }
    break
  }
  case 'build': {
    const t = performance.now()
    const { createKit } = await import('../src/kit.js')
    const { exportStatic } = await import('../src/export.js')
    const kit = await createKit({ root })
    const r = await exportStatic(kit, values.out)
    console.log(`[veloz] ${r.files} archivos en ${r.out} (${(r.bytes / 1024).toFixed(1)} KB con brotli) · ${Math.round(performance.now() - t)} ms`)
    if (r.isr.length) console.log(`        ISR exportado como estático: ${r.isr.join(', ')}`)
    if (r.needsServer.length) console.log(`        Necesitan servidor (veloz start): ${r.needsServer.join(', ')}`)
    break
  }
  default:
    console.log('Uso: veloz <dev|build|start> [--port 3000] [--out dist] [--workers auto]')
}
