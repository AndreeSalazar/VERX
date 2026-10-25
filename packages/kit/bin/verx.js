#!/usr/bin/env bun
// verx dev    → servidor de desarrollo con recarga en vivo
// verx build  → exporta lo estático a dist/
// verx start  → servidor de producción
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
  console.error('VERX necesita Bun: https://bun.sh')
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
    // En Windows un hijo no muere con su padre: si `verx dev` desaparece, nos vamos.
    const parent = Number(process.env.VERX_PARENT)
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
    if (process.env.VERX_WORKER !== '1') {
      const { pages, dynamic, apis, client } = kit
      console.log(`[verx] ${values.dev ? 'desarrollo' : 'producción'} en http://localhost:${port} · listo en ${Math.round(performance.now() - t)} ms`)
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
    console.log(`[verx] ${r.files} archivos en ${r.out} (${(r.bytes / 1024).toFixed(1)} KB con brotli) · ${Math.round(performance.now() - t)} ms`)
    if (r.isr.length) console.log(`        ISR exportado como estático: ${r.isr.join(', ')}`)
    if (r.needsServer.length) console.log(`        Necesitan servidor (verx start): ${r.needsServer.join(', ')}`)
    break
  }
  case 'desktop': {
    const { runDesktop } = await import('../src/desktop.js')
    await runDesktop({ root })
    break
  }
  case 'budget': {
    const { createKit } = await import('../src/kit.js')
    const { measureBudget, checkBudget, DEFAULT_BUDGET, kb } = await import('../src/budget.js')
    const kit = await createKit({ root })
    const budget = { ...DEFAULT_BUDGET, ...kit.config.budget }
    const report = await measureBudget(kit)
    console.log(`[verx] JS + WASM por página (brotli) · página ≤ ${kb(budget.page)} · isla ≤ ${kb(budget.island)}`)
    const width = Math.max(...report.pages.map((p) => p.path.length))
    for (const p of report.pages) {
      const detail = p.islands.length ? `runtime ${kb(report.runtime)} + ${p.islands.map((i) => `${i.name} ${kb(i.bytes)}`).join(' + ')}` : 'cero JS'
      console.log(`  ${p.bytes > budget.page ? '✖' : '✔'} ${p.path.padEnd(width)}  ${kb(p.bytes).padStart(8)}   ${detail}`)
    }
    if (report.unmeasured.length) console.log(`  (sin medir, se renderizan bajo demanda: ${report.unmeasured.join(', ')})`)
    const problems = checkBudget(report, budget)
    for (const p of problems) console.log(`  · ${p.where}: ${p.message}`)
    console.log(problems.length ? `✖ ${problems.length} fuera de presupuesto` : '✔ dentro del presupuesto')
    process.exit(problems.length ? 1 : 0)
  }
  default:
    console.log('Uso: verx <dev|build|start|desktop|budget> [--port 3000] [--out dist] [--workers auto]')
}
