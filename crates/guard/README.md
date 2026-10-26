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

## La regla `navegadores`

Revisa el CSS, el HTML y el JS que llegan al navegador (`apps/` y `packages/`, sin tests) y busca las funciones de su tabla, `src/compat/table.rs`: animaciones con el scroll, transiciones entre páginas, Speculation Rules, `:has()`, `requestIdleCallback`…

- El objetivo sale de `browsers` en cada `apps/*/verx.config.js` (con varias apps, manda la más exigente).
- **Bloquea** una función `Proteger` que falta en algún objetivo y no va protegida: en CSS, dentro de un `@supports` que la nombre; en JS, con una comprobación como `'x' in window`.
- **Informa** de lo que solo se pierde (`Degrada`) en `check --json` (campo `compat`), que VERX Grafo pinta en ámbar en cada carpeta.
- Los comentarios y las propias comprobaciones (`@supports (…)`, `CSS.supports(…)`) no cuentan como uso.

Para usar algo nuevo, añádelo a la tabla con la primera versión de cada navegador que lo trae activado por defecto (Chrome vale también para Edge). La tabla se mantiene a mano, porque tampoco hay dependencias de datos.
