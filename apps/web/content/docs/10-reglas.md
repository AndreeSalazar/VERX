---
title: "Reglas y guardián"
summary: "Las 13 reglas del repo y los tres sitios donde se hacen cumplir."
---

verx-guard es un binario en Rust, sin dependencias, que revisa todo el repositorio. Cada regla tiene un id estable y una indicación de cómo arreglarla.

- solo-bun · cero-deps-js · cero-deps-rust: Bun es el único gestor y no hay dependencias de terceros.
- nombres · paquete-completo: `packages/`x se llama `@verx/x` y todo tiene README y tests.
- frontera-rust-js · wasm-al-dia: Rust y JS sólo se hablan mediante `@verx/sim`, y el .wasm siempre corresponde al código.
- unsafe-acotado: unsafe sólo en `crates/sim/src/abi.rs`.
- sin-restos · tamano · lf: nada de test.only ni dbg!, archivos de 400 líneas como máximo, saltos de línea LF.
- imports-js: las fronteras de los imports, analizadas con el AST de Bun.
- presupuesto: ninguna página transfiere más JS + WASM del límite fijado en verx.`config.js` (14 KB en este sitio).

## Presupuesto de rendimiento

`verx budget` renderiza cada página, mira qué islas usa y suma lo que descargaría el navegador: el runtime, cada isla, sus chunks compartidos y el .wasm, todo comprimido con brotli. Si una página o una isla pasa del límite, el commit no entra.

```jsx title="verx.config.js"
budget: {
  page: 14 * 1024,   // por página
  island: 9 * 1024,  // por isla (sin contar el runtime)
}
```

## VERX Grafo

Con `bun run dev`, el guardián también se ve. VERX Grafo se abre solo en su ventana (`http://127.0.0.1:3001`) y dibuja el repo en nodos: mundos, paquetes, carpetas, archivos, imports y puentes .wasm. Cada vez que guardas, revisa las reglas. Lo que bloquea late en rojo y el panel dice qué regla falla, por qué, en qué línea y cómo arreglarlo. Si la regla solo sabe que «apps/web falla», el grafo busca el archivo y la línea que importan mal.

> [!TIP]
> Pulsa el círculo rojo: el archivo se abre en la línea culpable. Arréglalo, guarda con Ctrl+S y el rojo se apaga solo en cuanto el guardián deja de ver el problema.

También te avisa donde estás: el propio sitio enseña un aviso con el bloqueo, y si ni arranca, una página que explica por qué. Con `bun run vscode`, VS Code muestra el grafo en un panel y cada bloqueo en «Problemas».

## Dónde bloquea

- Hooks de git: pre-commit (guardián + tests) y commit-msg (mensajes convencionales).
- Hooks de Claude Code: deniegan npm, bun add, `cargo add` y `--no-verify`; revisan cada edición; no dejan terminar con reglas rotas.
- `bun run verify`: lo mismo a mano, más clippy pedantic y rustfmt.

```bash title="Comandos"
bun run check    # el guardián
bun run rules    # la lista con explicaciones
bun run budget   # tabla de JS + WASM por página
```
