# @verx/ui

JSX propio, sin React. Depende solo de `@verx/signals`.

Un mismo componente sirve en los dos lados, porque `package.json` publica dos implementaciones con la condición `browser`:

| | Servidor (`default`) | Navegador (`browser`) |
|---|---|---|
| Resultado | string HTML, sin DOM virtual | nodos reales del DOM |
| `{signal}` | pinta su valor actual | se actualiza al cambiar |
| `onClick` | se omite | `addEventListener` |
| Componentes `async` | soportados (como los Server Components) | — |

Para activarlo en un paquete, pon en su `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@verx/ui" } }
```

**Para componentes (`@verx/ui`):** `signal`, `computed`, `effect`, `batch`, `untrack`, `onCleanup`, `onMount` (solo corre en el navegador), `raw` (HTML de confianza) y `Fragment`.

**Para el framework (`@verx/ui/server`):** `renderToString`, `escape`, `registerIsland` y `onIsland`.

**Reactividad:** los componentes se ejecutan una sola vez. Lo reactivo son las funciones: `{count}` o `{() => count() * 2}`.
