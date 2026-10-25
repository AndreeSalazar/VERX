# VERX — reglas del proyecto

Framework web sobre **Bun**, con una simulación 3D en **Rust → WebAssembly**. Monorepo de piezas aisladas: si algo choca, la regla manda.
Comentarios, mensajes y documentación en **español**.

## Mapa

```
crates/        MUNDO RUST (workspace propio, toolchain fijada en rust-toolchain.toml)
  sim/         verx-sim    galaxia 3D → .wasm   (unsafe SOLO en src/abi.rs)
  guard/       verx-guard  guardián de reglas (std, sin crates)
packages/      MUNDO JS (workspaces de Bun en modo aislado)
  signals/     reactividad                      → nada
  server/      HTTP sobre Bun.serve             → nada
  ui/          JSX propio servidor/navegador    → signals
  sim/         ÚNICO PUENTE con Rust (sim.wasm) → nada
  gl/          motor WebGL2                     → nada
  kit/         meta-framework estilo Next.js    → server, ui
apps/web/      el sitio                         → kit, ui, sim, gl
```

## Reglas (las hace cumplir `verx-guard`; `bun run rules` las lista)

1. **Solo Bun.** Nunca npm, npx, yarn ni pnpm. Usa `bun install`, `bun run`, `bunx`.
2. **Cero dependencias de terceros**, ni en JS ni en Rust. Si hace falta algo, se escribe como paquete en `packages/` o como crate en `crates/`.
3. **Fronteras:** un paquete solo importa lo que declara y solo la API de sus `exports`; nada de `../../otro/src`.
4. **Rust y JS no se tocan.** El único puente es `@verx/sim`. Si cambias `crates/sim`, ejecuta `bun run wasm`. La ABI está versionada: si cambia una firma, sube `ABI_VERSION` en los dos lados.
5. **`unsafe` solo en `crates/sim/src/abi.rs`**, y siempre con un comentario `// SAFETY:`.
6. **Los componentes `'use client'` no tocan código de servidor** (`@verx/kit`, `@verx/server`, `node:*`, `bun`), ni siquiera de forma indirecta.
7. **Ningún archivo de código pasa de 400 líneas**: divide por responsabilidades.
8. **Sin restos de depuración:** ni `test.only`, `debugger`, `dbg!`, `todo!` ni `unimplemented!`.
9. Cada paquete y crate tiene **README.md y tests**.
10. Los commits siguen el formato convencional `tipo(ámbito): descripción`. **Nunca `--no-verify`** ni `push --force`.
11. Rust compila con clippy pedantic en modo `-D warnings`. Una excepción a una lint necesita `#[allow(..., reason = "...")]`.
12. **Presupuesto de rendimiento:** ninguna página transfiere más JS + WASM (brotli) del límite de `apps/web/verx.config.js` (`budget`). Si una isla crece, adelgázala o cárgala con `client:visible`/`client:idle`. Subir el límite solo con un motivo escrito en el commit.

## Comandos

| Comando | Qué hace |
|---|---|
| `bun install` | enlaza los paquetes (y activa los hooks de git) |
| `bun run dev` | sitio en http://localhost:3000 con recarga en vivo |
| `bun run check` | el guardián: todas las reglas |
| `bun run verify` | check + tests JS + fmt/clippy/tests de Rust: **pásalo antes de dar algo por terminado** |
| `bun run wasm` | recompila `crates/sim` y lo publica en `packages/sim` |
| `bun run budget` | tabla de JS + WASM por página y por isla, contra el presupuesto |
| `bun run desktop` | la app como escritorio: ventana propia, servidor solo en 127.0.0.1 y candado por token |
| `bun test` · `bun run test:rust` | tests |
| `bun run build` · `bun run start` | exportación estática y servidor de producción |

## Cómo se bloquea

- **Hooks de Claude Code** (`.claude/settings.json`):
  - antes de un comando: deniega npm/yarn/pnpm, `bun add`, `cargo add` y `--no-verify`;
  - tras cada edición: guardián rápido;
  - al terminar: guardián completo y tests.
- **Hooks de git** (`.githooks/`): `pre-commit` (guardián, tests y Rust si cambió) y `commit-msg` (formato convencional).
- Si una regla molesta de verdad, se discute y se cambia **en el guardián**, con su test. Nunca se esquiva.
