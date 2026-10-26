// VERX Grafo · el modelo: todo el proyecto como nodos y aristas.
//
//   raíz → mundos (Rust, Bun, Apps) → espacios de trabajo → carpetas → archivos
//
// Aristas reales, no por el nombre:
//   · import  — los import de JS (con el AST de Bun) y los `mod` de Rust;
//   · dep     — dependencias declaradas entre paquetes (package.json);
//   · bridge  — el puente .wasm de un crate a su paquete ([package.metadata.verx]).
// Y los bloqueos del guardián, cada uno colgado del nodo más profundo al que apunta.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, posix, relative, resolve, sep } from 'node:path'

const SKIP = new Set(['node_modules', 'target', 'dist', 'out'])
const TEXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.rs', '.toml', '.json', '.md', '.css', '.html', '.sh'])
const JS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs'])
const MAX_BYTES = 1024 * 1024
const WORLDS = [
  ['@rust', 'Rust', 'rust'],
  ['@bun', 'Bun', 'bun'],
  ['@app', 'Apps', 'app'],
]

const toPosix = (p) => p.split(sep).join('/')
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// La raíz del monorepo: la carpeta con un package.json con "workspaces" (o la app misma).
export function findRepoRoot(from) {
  from = resolve(from)
  for (let dir = from; ; dir = dirname(dir)) {
    if (readJson(join(dir, 'package.json'))?.workspaces) return dir
    if (dirname(dir) === dir) return from
  }
}

// Espacios de trabajo: paquetes y apps (workspaces de Bun) y crates (workspace de Cargo).
function workspaces(root) {
  const out = []
  for (const pattern of readJson(join(root, 'package.json'))?.workspaces ?? []) {
    const base = pattern.replace(/\/\*$/, '')
    const dir = join(root, base)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).sort()) {
      const pkg = readJson(join(dir, name, 'package.json'))
      if (!pkg) continue
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      out.push({ id: `${base}/${name}`, name: pkg.name ?? name, world: base.startsWith('app') ? 'app' : 'bun', deps })
    }
  }
  const cargo = join(root, 'crates', 'Cargo.toml')
  if (existsSync(cargo)) {
    const members = /members\s*=\s*\[([^\]]*)\]/.exec(readFileSync(cargo, 'utf8'))?.[1] ?? ''
    for (const m of members.matchAll(/"([^"]+)"/g)) {
      const toml = join(root, 'crates', m[1], 'Cargo.toml')
      if (!existsSync(toml)) continue
      const text = readFileSync(toml, 'utf8')
      const name = /^name\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? m[1]
      const bridge = /^bridge\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? null
      out.push({ id: `crates/${m[1]}`, name, world: 'rust', deps: [], bridge })
    }
  }
  return out
}

function walk(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, root, out)
    else if (TEXT.has(extname(entry.name)) && statSync(full).size <= MAX_BYTES) out.push(toPosix(relative(root, full)))
  }
  return out
}

// Resuelve un import relativo a un archivo del grafo (prueba extensiones e index.*).
function resolveRelative(from, spec, ids) {
  const base = posix.normalize(posix.join(posix.dirname(from), spec))
  for (const ext of ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '/index.js', '/index.jsx']) {
    if (ids.has(base + ext)) return base + ext
  }
  return null
}

// Los `mod x;` de Rust (con `#[path = "…"]` si lo hay) → el archivo del módulo.
function rustModules(file, text, ids) {
  const dir = posix.dirname(file)
  const own = ['lib.rs', 'main.rs', 'mod.rs'].includes(posix.basename(file)) ? dir : posix.join(dir, posix.basename(file, '.rs'))
  const out = []
  const re = /(?:#\[path\s*=\s*"([^"]+)"\]\s*(?:#\[[^\]]*\]\s*)*)?(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/g
  for (const m of text.matchAll(re)) {
    const candidates = m[1] ? [posix.join(dir, m[1])] : [posix.join(own, `${m[2]}.rs`), posix.join(own, m[2], 'mod.rs')]
    const hit = candidates.find((c) => ids.has(c))
    if (hit) out.push(hit)
  }
  return out
}

export function buildGraph(root) {
  root = resolve(root)
  const nodes = new Map()
  const edges = []
  const add = (node) => (nodes.has(node.id) ? nodes.get(node.id) : (nodes.set(node.id, node), node))
  add({ id: '', kind: 'root', label: basename(root), parent: null })
  for (const [id, label, world] of WORLDS) add({ id, kind: 'world', label, world, parent: '' })

  const spaces = workspaces(root)
  const byName = new Map(spaces.map((w) => [w.name, w]))
  const texts = new Map()
  for (const ws of spaces) {
    add({ id: ws.id, kind: 'workspace', label: ws.name, world: ws.world, parent: `@${ws.world}` })
    for (const file of walk(join(root, ws.id), root, [])) {
      // Carpetas intermedias entre el espacio de trabajo y el archivo.
      let parent = ws.id
      for (const part of posix.dirname(file.slice(ws.id.length + 1)).split('/').filter((p) => p !== '.')) {
        const id = `${parent}/${part}`
        add({ id, kind: 'folder', label: part, world: ws.world, parent })
        parent = id
      }
      const text = readFileSync(join(root, file), 'utf8')
      texts.set(file, text)
      add({ id: file, kind: 'file', label: posix.basename(file), world: ws.world, parent, ext: extname(file).slice(1), lines: text.split('\n').length })
    }
    for (const dep of ws.deps) if (byName.has(dep)) edges.push({ from: ws.id, to: byName.get(dep).id, kind: 'dep' })
    if (ws.bridge && nodes.has(ws.bridge)) edges.push({ from: ws.id, to: ws.bridge, kind: 'bridge' })
  }

  // Aristas de import, archivo a archivo (o archivo → paquete, para @verx/*).
  const ids = new Set(nodes.keys())
  const seen = new Set()
  const link = (from, to) => {
    const key = `${from}→${to}`
    if (to && to !== from && !seen.has(key)) {
      seen.add(key)
      edges.push({ from, to, kind: 'import' })
    }
  }
  for (const [file, text] of texts) {
    const ext = extname(file)
    if (JS.has(ext)) {
      let imports = []
      try {
        imports = new Bun.Transpiler({ loader: ext.slice(1) === 'mjs' ? 'js' : ext.slice(1) }).scanImports(text.replace(/^#!.*/, '')) // sin la línea #! de los ejecutables
      } catch {
        nodes.get(file).broken = true // no se pudo leer: error de sintaxis
      }
      for (const { path } of imports) {
        if (path.startsWith('.')) link(file, resolveRelative(file, path, ids))
        else if (path.startsWith('@verx/')) link(file, byName.get(path.split('/').slice(0, 2).join('/'))?.id)
      }
    } else if (ext === '.rs') {
      for (const target of rustModules(file, text, ids)) link(file, target)
    }
  }
  return { root, nodes: [...nodes.values()], edges }
}

// Cuelga cada problema del informe del guardián (`check --json`) del nodo más
// profundo que lo contiene. «apps/web /blog» (presupuesto) → apps/web.
export function attachProblems(graph, report) {
  const ids = new Set(graph.nodes.map((n) => n.id))
  const out = []
  for (const rule of report?.rules ?? []) {
    for (const p of rule.problems) {
      let node = p.file.trim().split(' ')[0].replace(/\/$/, '')
      while (node && !ids.has(node)) node = node.includes('/') ? node.slice(0, node.lastIndexOf('/')) : ''
      out.push({ rule: rule.id, title: rule.title, fix: rule.fix, file: p.file, line: p.line, message: p.message, node })
    }
  }
  return out
}
