// `verx dev`: un proceso vigilante que relanza el servidor cuando cambia
// cualquier archivo del proyecto (o del propio framework, para poder hackearlo).
// El navegador se recarga solo: la página escucha /_verx/dev y, cuando el
// servidor vuelve con otro id de arranque, recarga.
//
// Además arranca VERX Grafo (src/grafo/) en ESTE proceso, que no se reinicia:
// el proyecto entero como nodos, con lo que bloquea el guardián en rojo. Se
// abre solo en su ventana (salvo con --sin-ventana) y, si el sitio no arranca,
// este proceso ocupa su puerto con una página que explica por qué (caido.js).
// Cuando algo falla (no arranca, o una página da un 500), la ventana del grafo
// se abre sola, o se trae al frente, directamente en el archivo y la línea.

import { watch, readdirSync, realpathSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeBinary, openWindow, profileDir } from './desktop.js'
import { findRepoRoot } from './grafo/model.js'
import { startGraph } from './grafo/server.js'
import { serveDown } from './grafo/caido.js'

const BIN = fileURLToPath(new URL('../bin/verx.js', import.meta.url))
const IGNORED = /(^|[\\/])(node_modules|dist|\.git|\.verx|\.vercel)([\\/]|$)/
const READY = '[verx] desarrollo en'
const TAIL = 6000 // lo último de stderr: ahí está el error si no arranca

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

// El grafo en su puerto (el de la app + 1, o uno libre), con su ventana a mano.
async function graph({ root, port, openGraph }) {
  const appOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`]
  let g
  const open = () => {
    const profile = profileDir(root) + '-grafo'
    mkdirSync(profile, { recursive: true })
    // La ventana nativa si está compilada (bun run desktop la compila); si no, la de siempre.
    openWindow({ url: g.url, profile, title: 'VERX Grafo', native: nativeBinary(findRepoRoot(root)), width: 1280, height: 820 })
  }
  // Con --sin-ventana, nada se abre solo (sí al pulsar «Ver en el grafo»).
  const options = { root: findRepoRoot(root), appOrigins, onOpen: open, autoOpen: openGraph }
  try {
    g = await startGraph({ ...options, port: port + 1 })
  } catch {
    g = await startGraph({ ...options, port: 0 })
  }
  console.log(`[verx] grafo del proyecto: ${g.url}`)
  return { ...g, open }
}

// Copia un flujo del hijo a la consola y avisa de cada trozo.
async function tee(stream, out, onChunk) {
  const decoder = new TextDecoder()
  for await (const chunk of stream) {
    out.write(chunk)
    onChunk(decoder.decode(chunk, { stream: true }))
  }
}

export async function dev({ root, port, openGraph = true }) {
  let child = null
  let timer = null
  let changed = ''
  let stopping = false
  let down = null // la página de «el sitio no arranca», mientras haga falta

  const g = await graph({ root, port, openGraph }).catch((err) => {
    console.warn(`[verx] el grafo no arrancó: ${err.message}`)
    return null
  })
  if (g && openGraph) g.open()

  const start = () => {
    let errors = ''
    stopping = false
    const proc = (child = Bun.spawn([process.execPath, BIN, 'serve', '--dev', '--port', String(port)], {
      cwd: root,
      stdio: ['inherit', 'pipe', 'pipe'],
      // El sitio cuenta al grafo cada página que falla (kit.js → POST /fallo, con el token).
      env: { ...process.env, VERX_PARENT: String(process.pid), ...(g ? { VERX_GRAFO: g.base, VERX_GRAFO_TOKEN: g.token } : {}) },
    }))
    tee(proc.stdout, process.stdout, (text) => {
      if (text.includes(READY)) g?.setRuntime(null)
    })
    tee(proc.stderr, process.stderr, (text) => {
      errors = (errors + text).slice(-TAIL)
    })
    proc.exited.then((code) => {
      if (stopping || proc !== child || code === 0) return
      // No arrancó: el grafo lo marca en rojo y el puerto enseña por qué.
      g?.setRuntime(errors.trim() || `el servidor terminó con código ${code}`)
      try {
        down ??= serveDown({ port, grafo: g?.base })
      } catch {
        // el puerto sigue ocupado: sólo queda el aviso en el grafo
      }
    })
  }
  const restart = async () => {
    const t = performance.now()
    stopping = true
    child.kill()
    await child.exited
    if (down) {
      await down.stop(true)
      down = null
    }
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
