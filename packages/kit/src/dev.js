// `verx dev`: un proceso vigilante que relanza el servidor cuando cambia
// cualquier archivo del proyecto (o del propio framework, para poder hackearlo).
// El navegador se recarga solo: la página escucha /_verx/dev y, cuando el
// servidor vuelve con otro id de arranque, recarga.
//
// Además arranca VERX Grafo (src/grafo/) en ESTE proceso, que no se reinicia:
// el proyecto entero como nodos, con lo que bloquea el guardián en rojo.

import { watch, readdirSync, realpathSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { profileDir, windowCommand } from './desktop.js'
import { findRepoRoot } from './grafo/model.js'
import { startGraph } from './grafo/server.js'

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

// El grafo en su puerto (el de la app + 1, o uno libre). Con `open`, en su propia ventana.
async function graph({ root, port, open }) {
  let g
  try {
    g = await startGraph({ root: findRepoRoot(root), port: port + 1 })
  } catch {
    g = await startGraph({ root: findRepoRoot(root), port: 0 })
  }
  console.log(`[verx] grafo del proyecto: ${g.url}`)
  if (!open) return
  const profile = profileDir(root) + '-grafo'
  mkdirSync(profile, { recursive: true })
  Bun.spawn(windowCommand({ url: g.url, profile }).cmd, { stdio: ['ignore', 'ignore', 'ignore'] })
}

export function dev({ root, port, openGraph = false }) {
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
  graph({ root, port, open: openGraph }).catch((err) => console.warn(`[verx] el grafo no arrancó: ${err.message}`))
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
