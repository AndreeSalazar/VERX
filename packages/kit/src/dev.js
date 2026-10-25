// `verx dev`: un proceso vigilante que relanza el servidor cuando cambia
// cualquier archivo del proyecto (o del propio framework, para poder hackearlo).
// El navegador se recarga solo: la página escucha /_verx/dev y, cuando el
// servidor vuelve con otro id de arranque, recarga.

import { watch, readdirSync, realpathSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../bin/verx.js', import.meta.url))
const IGNORED = /(^|[\\/])(node_modules|dist|\.git)([\\/]|$)/

// Carpetas reales de los paquetes @verx/* enlazados (y sus dependencias).
function linkedPackages(dir, seen = new Set()) {
  const scope = join(dir, 'node_modules', '@verx')
  if (!existsSync(scope)) return seen
  for (const name of readdirSync(scope)) {
    const real = realpathSync(join(scope, name))
    if (!seen.has(real)) {
      seen.add(real)
      linkedPackages(real, seen)
    }
  }
  return seen
}

export function dev({ root, port }) {
  let child = null
  let timer = null
  let changed = ''

  const start = () => {
    child = Bun.spawn([process.execPath, BIN, 'serve', '--dev', '--port', String(port)], {
      cwd: root,
      stdio: ['inherit', 'inherit', 'inherit'],
      env: { ...process.env, VERX_PARENT: String(process.pid) },
    })
  }
  const restart = async () => {
    const t = performance.now()
    child.kill()
    await child.exited
    start()
    console.log(`[verx] ${changed} cambió → reiniciado en ${Math.round(performance.now() - t)} ms`)
  }

  start()
  for (const dir of [root, ...linkedPackages(root)]) {
    watch(dir, { recursive: true }, (_, file) => {
      if (!file || IGNORED.test(file)) return
      changed = file
      clearTimeout(timer)
      timer = setTimeout(restart, 60)
    })
  }
  process.on('SIGINT', () => {
    child?.kill()
    process.exit(0)
  })
}
