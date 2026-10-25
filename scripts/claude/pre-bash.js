// Hook PreToolUse (Bash) de Claude Code: bloquea comandos que rompen las reglas
// del repo ANTES de ejecutarlos. Lee el evento JSON por stdin.

const event = JSON.parse(await Bun.stdin.text())
const command = String(event.tool_input?.command ?? '')

// Posición de comando: inicio, o tras ; && || | ( $( `
const at = (word) => new RegExp(String.raw`(^|[;&|(\x60]\s*|\$\(\s*)${word}`)

const rules = [
  [at(String.raw`(npm|npx|yarn|pnpm|pnpx)\b`), 'solo-bun: aquí sólo se usa Bun (bun install, bun run, bunx).'],
  [at(String.raw`bun\s+(add|a)\b`), 'cero-deps-js: no se añaden dependencias de terceros; crea un paquete en packages/.'],
  [at(String.raw`bun\s+(install|i)\s+(?=[@a-zA-Z])`),'cero-deps-js: `bun install <paquete>` añade dependencias; usa `bun install` a secas.'],
  [at(String.raw`cargo\s+(add|install)\b`), 'cero-deps-rust: no se añaden crates de terceros; crea un crate en crates/.'],
  [/--no-verify\b/, 'Prohibido saltarse los hooks de git (--no-verify): arregla lo que el guardián señala.'],
  [/\bgit\s+push\b.*\s(--force\b|-f\b)/, 'Prohibido git push --force.'],
]

const hit = rules.find(([re]) => re.test(command))
if (hit) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `[verx] ${hit[1]}` },
    }),
  )
}
