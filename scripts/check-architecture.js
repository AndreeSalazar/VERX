// bun run check — vigila las fronteras entre paquetes para que el monorepo no
// se convierta en un monolito con otro nombre. Reglas:
//
//  1. Un import relativo no puede salir de su paquete (nada de ../../otro/src).
//  2. Un paquete sólo importa paquetes que declara en su package.json.
//  3. Sólo se importa lo que el otro paquete publica en "exports" (sin imports profundos).
//  4. Cero dependencias externas: sólo paquetes del workspace, node:* y bun
//     (y los módulos del anfitrión: `vscode` en una extensión, host-modules.js).
//  5. Los módulos de Node se importan con prefijo node: (node:fs, no fs).
//  6. Sin ciclos entre paquetes.
//  7. Un archivo 'use client' (y lo que importe) no puede tocar código de servidor.
//
// Lee los imports con Bun.Transpiler (el AST real, no expresiones regulares),
// así que el código de ejemplo dentro de strings no da falsos positivos.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname, extname } from 'node:path'
import { builtinModules } from 'node:module'
import { hostModules } from './host-modules.js'

const ROOT = resolve(import.meta.dir, '..')
const SOURCE = /\.(jsx?|tsx?|cjs|mjs)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/
const SERVER_ONLY = (spec) => spec.startsWith('node:') || spec === 'bun' || spec.startsWith('bun:') || spec.startsWith('@verx/kit') || spec.startsWith('@verx/server') || spec === '@verx/ui/server'

const transpilers = {}
const transpiler = (ext) =>
  (transpilers[ext] ??= new Bun.Transpiler({
    loader: ext === '.cjs' || ext === '.mjs' ? 'js' : ext.slice(1),
    tsconfig: { compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@verx/ui' } },
  }))

// ── Workspaces ─────────────────────────────────────────────────────────────
const workspaces = []
for (const group of ['packages', 'apps']) {
  const base = join(ROOT, group)
  if (!existsSync(base)) continue
  for (const name of readdirSync(base)) {
    const dir = join(base, name)
    const file = join(dir, 'package.json')
    if (existsSync(file)) workspaces.push({ dir, pkg: JSON.parse(readFileSync(file, 'utf8')) })
  }
}
const byName = new Map(workspaces.map((w) => [w.pkg.name, w]))
const depsOf = (w) => Object.keys({ ...w.pkg.dependencies, ...w.pkg.peerDependencies })

const problems = []
const report = (file, msg) => problems.push(`${relative(ROOT, file)}: ${msg}`)

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (SOURCE.test(e.name)) out.push(full)
  }
  return out
}

function resolveRelative(from, spec) {
  const base = resolve(dirname(from), spec)
  for (const candidate of [base, ...['.js', '.jsx', '.ts', '.tsx'].map((e) => base + e)]) {
    if (existsSync(candidate) && SOURCE.test(candidate)) return candidate
  }
  return base
}

// ── Reglas 1-5: imports de cada archivo ─────────────────────────────────────
const graph = new Map() // archivo → { imports: [specs], relatives: [archivos] }
let files = 0

for (const w of workspaces) {
  const declared = new Set(depsOf(w))
  const host = hostModules(w.pkg)
  for (const file of walk(w.dir)) {
    files++
    const code = readFileSync(file, 'utf8').replace(/^#!.*/, '')
    let imports
    try {
      imports = transpiler(extname(file))
        .scanImports(code)
        // El transpilador añade un require('react') implícito en archivos JSX;
        // el import real del runtime (@verx/ui/jsx-dev-runtime) sí se revisa.
        .filter((i) => !(i.kind === 'require-call' && i.path === 'react'))
        .map((i) => i.path)
    } catch (err) {
      report(file, `no se pudo analizar (${err.message})`)
      continue
    }
    const node = { imports, relatives: [], client: USE_CLIENT.test(code.slice(0, 512)) }
    graph.set(file, node)

    for (const spec of imports) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const target = resolveRelative(file, spec)
        if (relative(w.dir, target).startsWith('..')) report(file, `import relativo fuera del paquete: ${spec} (usa el paquete y su API pública)`)
        else node.relatives.push(target)
        continue
      }
      if (spec.startsWith('node:') || spec === 'bun' || spec.startsWith('bun:') || host.includes(spec)) continue
      if (builtinModules.includes(spec.split('/')[0])) {
        report(file, `usa "node:${spec}" en vez de "${spec}"`)
        continue
      }
      const parts = spec.split('/')
      const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      const sub = '.' + spec.slice(name.length)
      const target = byName.get(name)
      if (!target) {
        report(file, `dependencia externa "${name}": este repo no usa dependencias de terceros`)
        continue
      }
      if (name !== w.pkg.name && !declared.has(name)) report(file, `importa ${name} sin declararlo en ${relative(ROOT, join(w.dir, 'package.json'))}`)
      const exportsMap = target.pkg.exports
      const allowed = typeof exportsMap === 'string' ? ['.'] : Object.keys(exportsMap ?? { '.': true })
      if (!allowed.includes(sub)) report(file, `"${spec}" no es parte de la API pública de ${name} (exports: ${allowed.join(', ')})`)
    }
  }
}

// ── Regla 7: componentes cliente sin código de servidor (también transitivo) ─
for (const [file, node] of graph) {
  if (!node.client) continue
  const seen = new Set()
  const stack = [[file, [file]]]
  while (stack.length) {
    const [current, chain] = stack.pop()
    if (seen.has(current)) continue
    seen.add(current)
    const n = graph.get(current)
    if (!n) continue
    const bad = n.imports.find(SERVER_ONLY)
    if (bad) {
      report(file, `componente 'use client' llega a código de servidor "${bad}" vía ${chain.map((f) => relative(ROOT, f)).join(' → ')}`)
      break
    }
    for (const r of n.relatives) stack.push([r, [...chain, r]])
  }
}

// ── Regla 6: ciclos entre paquetes + orden por capas ───────────────────────
const order = []
const state = new Map()
const visit = (name, path) => {
  if (state.get(name) === 'done') return
  if (state.get(name) === 'visiting') {
    problems.push(`ciclo entre paquetes: ${[...path, name].join(' → ')}`)
    return
  }
  state.set(name, 'visiting')
  const w = byName.get(name)
  for (const d of depsOf(w)) if (byName.has(d)) visit(d, [...path, name])
  state.set(name, 'done')
  order.push(name)
}
for (const w of workspaces) visit(w.pkg.name, [])

console.log('Paquetes, de la base a la cima:')
for (const name of order) {
  const deps = depsOf(byName.get(name)).filter((d) => byName.has(d))
  console.log(`  ${name.padEnd(16)} → ${deps.length ? deps.join(', ') : '(nada)'}`)
}
console.log()
if (problems.length) {
  console.log(`✖ ${problems.length} problema(s) en ${files} archivos:\n`)
  for (const p of problems) console.log('  · ' + p)
  process.exit(1)
}
console.log(`✔ ${files} archivos revisados, fronteras limpias`)
