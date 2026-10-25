// Hook Stop de Claude Code: Claude no puede dar el trabajo por terminado si el
// guardián (todas las reglas) o los tests JS fallan. Respeta stop_hook_active
// para no entrar en bucle: si ya se le bloqueó una vez, deja parar.

import { join } from 'node:path'

const event = JSON.parse((await Bun.stdin.text()) || '{}')
if (event.stop_hook_active) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const run = (cmd, cwd) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' })
  return { ok: r.exitCode === 0, out: (r.stdout.toString() + r.stderr.toString()).trim() }
}

const guard = run(['cargo', 'run', '-q', '--release', '-p', 'verx-guard', '--', 'check'], join(root, 'crates'))
const tests = guard.ok ? run(['bun', 'test'], root) : { ok: true, out: '' }

if (!guard.ok || !tests.ok) {
  const detail = !guard.ok
    ? guard.out.split('\n').filter((l) => !l.startsWith('  ✔')).join('\n')
    : tests.out.split('\n').filter((l) => /fail|error|✗|\(fail\)/i.test(l)).slice(0, 30).join('\n')
  console.log(
    JSON.stringify({
      decision: 'block',
      reason: `[verx] No se puede terminar con ${!guard.ok ? 'reglas rotas' : 'tests fallando'}:\n${detail}`,
    }),
  )
}
