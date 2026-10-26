// Ejecuta el guardián (crates/guard) y devuelve su informe JSON
// (`verx-guard check --json`). Sin crates/ (una app suelta), no hay guardián: null.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export async function runGuard(root, { quick = true } = {}) {
  const crates = join(root, 'crates')
  if (!existsSync(join(crates, 'Cargo.toml'))) return null
  const args = ['cargo', 'run', '-q', '--release', '-p', 'verx-guard', '--', 'check', '--json']
  if (quick) args.push('--quick')
  const proc = Bun.spawn(args, { cwd: crates, stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  await proc.exited
  const last = out.trim().split('\n').at(-1) ?? ''
  try {
    return JSON.parse(last)
  } catch {
    // El guardián no pudo ni arrancar (p. ej. no compila): se muestra el error tal cual.
    return { ok: false, quick, rules: [], error: (err || out).trim().slice(-1200) }
  }
}
