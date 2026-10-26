#!/usr/bin/env bun
// bun run vscode → empaqueta la extensión (dist/*.vsix) y la instala en VS Code
// con su propia línea de comandos (`code --install-extension`).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildVsix } from '../src/vsix.js'

const dir = join(import.meta.dir, '..')
const { name, bytes } = buildVsix(dir)
mkdirSync(join(dir, 'dist'), { recursive: true })
const file = join(dir, 'dist', name)
writeFileSync(file, bytes)
console.log(`[verx] ${name} (${(bytes.length / 1024).toFixed(1)} KB)`)

if (process.argv.includes('--solo-empaquetar')) process.exit(0)
// En Windows `code` es un .cmd: hay que pasar por cmd.exe.
const cmd = process.platform === 'win32' ? ['cmd', '/c', 'code'] : ['code']
const proc = Bun.spawn([...cmd, '--install-extension', file, '--force'], { stdout: 'inherit', stderr: 'inherit' })
if ((await proc.exited) !== 0) {
  console.error('[verx] no pude instalarla: ¿está `code` en el PATH? (VS Code → «Shell Command: Install \'code\' command in PATH»)')
  console.error(`        También puedes instalarla a mano: Extensiones → … → «Install from VSIX» → ${file}`)
  process.exit(1)
}
console.log('[verx] instalada. Recarga VS Code (Ctrl+Shift+P → «Developer: Reload Window») y arranca `bun run dev`.')
