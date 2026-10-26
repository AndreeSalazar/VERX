// `verx build --vercel`: el sitio en el formato de Vercel (Build Output API v3).
//
//   .vercel/output/
//     config.json          rutas, cabeceras y la 404 (vercel-routes.js)
//     static/              lo mismo que `verx build`, sin .br/.gz: Vercel comprime él
//     functions/_verx.func la app con el kit, en el runtime de Bun, para lo dinámico
//
// La función es el mismo kit en modo `prebuilt`: no vuelve a empaquetar el
// cliente ni a prerenderizar páginas (eso ya está en la CDN), así que arranca
// rápido y sus URLs con huella coinciden con las de static/.
// Los WebSockets no caben (las funciones de Vercel no los aceptan): se avisan.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportStatic } from './export.js'
import { FUNCTION, vercelConfig } from './vercel-routes.js'

export const RUNTIME = 'bun1.x'
const ENTRY = '_verx.js'
const MANIFEST = '_verx.json'
// Nada de esto hace falta para atender peticiones.
const SKIP = new Set(['node_modules', 'dist', 'test', 'tests', '.git', '.vercel', '.verx'])

export async function exportVercel(kit, outDir = '.vercel/output') {
  const out = resolve(kit.root, outDir)
  rmSync(out, { recursive: true, force: true })
  const r = await exportStatic(kit, join(out, 'static'), { precompress: false, headers: false })
  const { config, skipped, usesFunction } = vercelConfig({
    pages: kit.pages,
    statics: kit.statics,
    immutable: r.immutable,
    headers: kit.app.defaultHeaders,
    dynamic: kit.dynamic,
    apis: kit.apis,
  })
  let fn = null
  if (usesFunction) fn = writeFunction(kit, join(out, 'functions', FUNCTION.slice(1) + '.func'))
  writeFileSync(join(out, 'config.json'), JSON.stringify(config, null, 2) + '\n')
  return { out, files: r.files, bytes: r.bytes, isr: r.isr, fn, skipped }
}

// La función: la app (sin dist/ ni tests), sus paquetes @verx/* copiados de
// verdad en node_modules (sin enlaces), el cliente ya empaquetado y la entrada.
function writeFunction(kit, dir) {
  mkdirSync(dir, { recursive: true })
  const filter = (src) => !SKIP.has(basename(src))
  for (const e of readdirSync(kit.root)) {
    if (e.startsWith('.') || SKIP.has(e)) continue
    cpSync(join(kit.root, e), join(dir, e), { recursive: true, dereference: true, filter })
  }
  const packages = workspacePackages(kit.root)
  for (const [name, src] of packages) cpSync(src, join(dir, 'node_modules', ...name.split('/')), { recursive: true, dereference: true, filter })

  // El tsconfig sin `extends` (apunta fuera de la app). Bun sólo lee el de la
  // carpeta desde la que arranca, así que cada .jsx lleva además su pragma.
  const options = compilerOptions(join(kit.root, 'tsconfig.json'))
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: options }, null, 2) + '\n')
  if (options.jsxImportSource) addJsxPragma(dir, options.jsxImportSource)
  if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n')

  const { runtime, compat, sources } = kit.client
  const manifest = { client: { runtime, compat, sources }, assets: [...kit.app.assets] }
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest) + '\n')
  writeFileSync(join(dir, ENTRY), ENTRY_CODE)

  const vc = {
    runtime: RUNTIME,
    handler: ENTRY,
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    ...kit.config.vercel?.function, // memory, maxDuration, regions… (verx.config.js)
  }
  writeFileSync(join(dir, '.vc-config.json'), JSON.stringify(vc, null, 2) + '\n')
  return { dir, runtime: vc.runtime, packages: [...packages.keys()] }
}

const ENTRY_CODE = `// Generado por \`verx build --vercel\`: la función que atiende lo dinámico.
// Lo estático (páginas, islas, imágenes) ya lo sirve la CDN de Vercel.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createKit } from '@verx/kit'

const root = import.meta.dirname
const prebuilt = JSON.parse(readFileSync(join(root, '${MANIFEST}'), 'utf8'))
const kit = await createKit({ root, prebuilt })
await kit.app.compile()

export default { fetch: (req) => kit.app.handle(req) }
`

// Los paquetes del espacio de trabajo que usa la app, también los indirectos:
// nombre → su carpeta real (con el linker aislado, node_modules son enlaces).
// @verx/kit va siempre (la función arranca con él), lo declare la app o no.
export function workspacePackages(root) {
  const kitDir = fileURLToPath(new URL('..', import.meta.url))
  const found = new Map([['@verx/kit', kitDir]])
  const visit = (dir) => {
    if (!existsSync(join(dir, 'package.json'))) return
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      if (!String(version).startsWith('workspace:') || found.has(name)) continue
      const link = join(dir, 'node_modules', ...name.split('/'))
      if (!existsSync(link)) throw new Error(`${name} no está instalado en ${dir}: ejecuta bun install`)
      found.set(name, realpathSync(link))
      visit(found.get(name))
    }
  }
  visit(kitDir)
  visit(root)
  return found
}

// `/** @jsxImportSource x */` al principio de cada .jsx/.tsx, en la misma línea
// para no mover los números de línea de las trazas.
export function addJsxPragma(dir, source) {
  for (const rel of readdirSync(dir, { recursive: true })) {
    const file = join(dir, String(rel))
    if (!/\.[jt]sx$/.test(file)) continue
    const code = readFileSync(file, 'utf8')
    if (!code.includes('@jsxImportSource')) writeFileSync(file, `/** @jsxImportSource ${source} */ ` + code)
  }
}

// compilerOptions de un tsconfig, siguiendo sus `extends` relativos.
export function compilerOptions(file) {
  if (!existsSync(file)) return { jsx: 'react-jsx', jsxImportSource: '@verx/ui' }
  const json = JSON.parse(readFileSync(file, 'utf8'))
  const base = json.extends ? compilerOptions(resolve(dirname(file), json.extends)) : {}
  return { ...base, ...json.compilerOptions }
}
