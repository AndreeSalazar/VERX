// Hook PostToolUse (Edit/Write) de Claude Code: tras cada edición de código,
// el guardián rápido revisa el repo. Si algo se rompe, Claude recibe el informe
// y tiene que arreglarlo antes de seguir.

import { join } from 'node:path'

const event = JSON.parse(await Bun.stdin.text())
const file = String(event.tool_input?.file_path ?? event.tool_response?.filePath ?? '').replaceAll('\\', '/')
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const relevant = /\.(jsx?|tsx?|mjs|rs|toml|json)$/.test(file) && !/\/(node_modules|target|dist)\//.test(file)
if (relevant) {
  const run = Bun.spawnSync(['cargo', 'run', '-q', '--release', '-p', 'verx-guard', '--', 'check', '--quick'], {
    cwd: join(root, 'crates'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (run.exitCode !== 0) {
    const report = (run.stdout.toString() + run.stderr.toString())
      .split('\n')
      .filter((l) => !l.startsWith('  ✔'))
      .join('\n')
      .trim()
    console.log(JSON.stringify({ decision: 'block', reason: `[verx-guard] Esta edición rompe reglas del repo:\n${report}` }))
  }
}
