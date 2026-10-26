// Componentes cliente ("islas"), con la convención de Next.js: un archivo que
// empieza por 'use client' se ejecuta también en el navegador. El resto del
// sitio NO manda JavaScript (como Astro): una página sin islas pesa 0 KB de JS.
//
// Al arrancar:
//  1. Buscamos los archivos 'use client' del proyecto.
//  2. Bun.build los empaqueta para el navegador (minificado, con code splitting:
//     el runtime de @verx/ui va en un chunk compartido) con nombres con hash.
//  3. Importamos esos mismos archivos en el servidor y registramos cada export
//     como isla, para que <Contador /> en una página se renderice en HTML y
//     se envuelva con lo necesario para hidratarlo en el navegador.

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerIsland, clearIslands } from '@verx/ui/server'

const IGNORE = new Set(['node_modules', 'dist', 'public', 'test', 'tests'])
const SOURCE = /\.(jsx|tsx|js|ts)$/
const DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/
const RUNTIME = fileURLToPath(new URL('../client/runtime.js', import.meta.url))
// Respaldos para los navegadores a los que les falta algo (@verx/compat). Se
// empaquetan aquí, con huella, y document.js sólo los importa donde hacen falta.
const COMPAT = {
  reveal: fileURLToPath(import.meta.resolve('@verx/compat/reveal')),
  prefetch: fileURLToPath(import.meta.resolve('@verx/compat/prefetch')),
}
export const CLIENT_PREFIX = '/_verx/'

export function findClientFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || IGNORE.has(e.name)) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (SOURCE.test(e.name) && DIRECTIVE.test(readFileSync(full, 'utf8').slice(0, 512))) out.push(full)
    }
  }
  walk(root)
  return out
}

const key = (p) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))

// `compat`: qué respaldos necesita el sitio ({ reveal, prefetch }, ver kit.js).
export async function buildClient({ root, dev, compat = {} }) {
  clearIslands()
  const files = findClientFiles(root)
  for (const f of files) {
    if (/[\\/](page|layout|route)\.[jt]sx?$/.test(f)) throw new Error(`${relative(root, f)}: las páginas y layouts se renderizan en el servidor; mueve la parte interactiva a un componente 'use client'`)
  }
  const fallbacks = Object.keys(COMPAT).filter((name) => compat[name])
  if (files.length === 0 && fallbacks.length === 0) return { files: [], runtime: null, compat: {}, count: 0 }

  // Dos builds: las islas comparten chunks entre ellas; los respaldos van
  // aparte y sin trocear, para no mover nada de lo que baja Chrome.
  const islands = files.length ? await bundle([RUNTIME, ...files], { dev, splitting: true }) : { outputs: [], urlFor: null }
  const fixes = fallbacks.length ? await bundle(fallbacks.map((name) => COMPAT[name]), { dev, splitting: false }) : { outputs: [] }
  const outputs = [...islands.outputs, ...fixes.outputs]
  const compatUrls = Object.fromEntries(fallbacks.map((name) => [name, fixes.urlFor(COMPAT[name])]))
  if (files.length === 0) return { files: outputs, runtime: null, compat: compatUrls, count: 0 }
  const { urlFor } = islands
  const sources = Object.fromEntries(files.map((file) => [relative(root, file).replaceAll('\\', '/'), urlFor(file)]))
  await register(root, sources)

  // Chunks que el runtime importa estáticamente: se precargan con modulepreload.
  const runtimeSrc = urlFor(RUNTIME)
  const runtimeCode = outputs.find((o) => o.path === runtimeSrc).bytes.toString()
  const chunkImport = new RegExp(String.raw`(?:from|import)\s*["'](?:\./|${CLIENT_PREFIX})([^"']+)["']`, 'g')
  const preload = [...runtimeCode.matchAll(chunkImport)].map((m) => CLIENT_PREFIX + m[1])

  return { files: outputs, runtime: { src: runtimeSrc, preload }, compat: compatUrls, sources, count: files.length }
}

// Importa cada isla en el servidor y la registra con la URL de su build.
async function register(root, sources) {
  for (const [rel, src] of Object.entries(sources)) {
    const file = join(root, rel)
    const mod = await import(pathToFileURL(file).href)
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value === 'function') registerIsland(value, { src, exportName, file })
    }
  }
}

// El cliente que ya empaquetó `verx build` (lo usa la función de Vercel): las
// mismas URLs que los archivos de la CDN, sin volver a llamar a Bun.build.
export async function loadClient({ root, manifest }) {
  clearIslands()
  const sources = manifest.sources ?? {}
  await register(root, sources)
  return { files: [], runtime: manifest.runtime, compat: manifest.compat ?? {}, sources, count: Object.keys(sources).length }
}

// Un Bun.build para el navegador: sus salidas y la URL de cada entrada.
async function bundle(entrypoints, { dev, splitting }) {
  const result = await Bun.build({
    entrypoints,
    target: 'browser',
    format: 'esm',
    splitting,
    minify: !dev,
    sourcemap: dev ? 'inline' : 'none',
    naming: { entry: '[name]-[hash].[ext]', chunk: 'chunk-[hash].[ext]', asset: '[name]-[hash].[ext]' },
    // URLs absolutas para chunks y assets (p. ej. sim.wasm importado con type: 'file').
    publicPath: CLIENT_PREFIX,
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    metafile: true,
  })
  if (!result.success) throw new AggregateError(result.logs, 'Bun.build no pudo empaquetar los componentes cliente')

  // Bun.build informa en el metafile qué salida corresponde a cada entrada.
  const bySource = new Map()
  for (const [out, info] of Object.entries(result.metafile.outputs)) {
    if (info.entryPoint) bySource.set(key(resolve(process.cwd(), info.entryPoint)), out.replace(/^\.\//, ''))
  }
  const urlFor = (source) => {
    const out = bySource.get(key(source))
    if (!out) throw new Error(`No encuentro la salida de ${source} en el build`)
    return CLIENT_PREFIX + out
  }
  const outputs = await Promise.all(result.outputs.map(async (o) => ({
    path: CLIENT_PREFIX + o.path.replace(/^\.\//, ''),
    bytes: Buffer.from(await o.arrayBuffer()),
    type: o.type.replace(';charset', '; charset'), // .wasm → application/wasm (instantiateStreaming lo exige)
  })))
  return { outputs, urlFor }
}
