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

export async function buildClient({ root, dev }) {
  clearIslands()
  const files = findClientFiles(root)
  for (const f of files) {
    if (/[\\/](page|layout|route)\.[jt]sx?$/.test(f)) throw new Error(`${relative(root, f)}: las páginas y layouts se renderizan en el servidor; mueve la parte interactiva a un componente 'use client'`)
  }
  if (files.length === 0) return { files: [], runtime: null, count: 0 }

  const result = await Bun.build({
    entrypoints: [RUNTIME, ...files],
    target: 'browser',
    format: 'esm',
    splitting: true,
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

  for (const file of files) {
    const mod = await import(pathToFileURL(file).href)
    const src = urlFor(file)
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value === 'function') registerIsland(value, { src, exportName, file })
    }
  }

  // Chunks que el runtime importa estáticamente: se precargan con modulepreload.
  const runtimeSrc = urlFor(RUNTIME)
  const runtimeCode = outputs.find((o) => o.path === runtimeSrc).bytes.toString()
  const chunkImport = new RegExp(String.raw`(?:from|import)\s*["'](?:\./|${CLIENT_PREFIX})([^"']+)["']`, 'g')
  const preload = [...runtimeCode.matchAll(chunkImport)].map((m) => CLIENT_PREFIX + m[1])

  return { files: outputs, runtime: { src: runtimeSrc, preload }, count: files.length }
}
