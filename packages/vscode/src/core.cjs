// VERX Grafo para VS Code · la parte que no depende de VS Code (y por eso se
// prueba con bun test): encontrar el grafo, leer su SSE y convertir los
// bloqueos en diagnósticos y en el texto de la barra de estado.

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const RUNTIME = join('.verx', 'grafo.json')
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/

/** El grafo de `verx dev` en este repo, o null si no está corriendo. */
function readRuntime(root) {
  let info
  try {
    info = JSON.parse(readFileSync(join(root, RUNTIME), 'utf8'))
  } catch {
    return null
  }
  // Sólo 127.0.0.1: el token nunca se manda a otra parte.
  if (!LOCAL.test(info?.base ?? '') || typeof info.token !== 'string') return null
  try {
    process.kill(info.pid, 0) // ¿sigue vivo verx dev?
  } catch {
    return null
  }
  return info
}

/** Un lector de Server-Sent Events por trozos: llama a `onEvent(evento, datos)`. */
function createSSE(onEvent) {
  let buffer = ''
  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, '\n')
    let end
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      let event = 'message'
      const data = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length) onEvent(event, data.join('\n'))
    }
  }
}

/**
 * Los bloqueos del grafo como diagnósticos, agrupados por archivo:
 * `Map<ruta relativa, [{ line (desde 0), code, message }]>`. Lo que no es un
 * archivo (una carpeta, el proyecto) no tiene dónde subrayarse: va a la barra.
 */
function diagnosticsOf(problems) {
  const out = new Map()
  for (const p of problems ?? []) {
    if (!p.file || !/\.[a-z0-9]+$/i.test(p.file)) continue
    const list = out.get(p.file) ?? []
    list.push({ line: Math.max(0, (p.line ?? 1) - 1), code: p.rule, message: `${p.title}\n${p.message}\n→ ${p.fix}` })
    out.set(p.file, list)
  }
  return out
}

/** Lo que dice la barra de estado. */
function summary(snapshot) {
  if (!snapshot) return { text: '$(debug-disconnect) VERX', bad: false, tooltip: 'verx dev no está corriendo: pulsa para arrancarlo' }
  const n = snapshot.problems?.length ?? 0
  const busy = snapshot.status?.checking ? ' $(sync~spin)' : ''
  if (n === 0) return { text: `$(pass) VERX${busy}`, bad: false, tooltip: 'El guardián no bloquea nada · pulsa para ver el grafo' }
  const lines = snapshot.problems.slice(0, 6).map((p) => `${p.rule} · ${p.file || 'proyecto'}${p.line ? `:${p.line}` : ''}`)
  return { text: `$(error) VERX ${n}${busy}`, bad: true, tooltip: `${n} bloqueo${n === 1 ? '' : 's'}:\n${lines.join('\n')}` }
}

module.exports = { RUNTIME, readRuntime, createSSE, diagnosticsOf, summary }
