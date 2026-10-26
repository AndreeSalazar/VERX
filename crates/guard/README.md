# verx-guard

El guardián de las reglas del repositorio. Está escrito en Rust, solo con `std`, y revisa tanto la parte Rust como la parte JS.

```bash
bun run check         # todas las reglas (incluye el análisis de imports JS con el AST de Bun)
bun run check:quick   # las reglas rápidas (lo usan los hooks de Claude Code)
verx-guard check --json [--quick]   # el informe en una línea JSON (lo lee VERX Grafo)
bun run rules         # lista de reglas con su explicación
bun run wasm          # compila cada crate puente → su .wasm + manifiesto
```

Cada regla tiene un id estable (`solo-bun`, `cero-deps-js`, `unsafe-acotado`, …) para poder citarla en commits y en `CLAUDE.md`. Si una falla, sale con código 1 y dice cómo arreglarla.

La bloquean tres mecanismos: el hook `pre-commit` de git, los hooks de Claude Code (`.claude/settings.json`) y `bun run verify`.

Para añadir una regla, escribe la función en `src/rules/` y regístrala en `RULES` (`src/rules/mod.rs`).
