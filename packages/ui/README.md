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

## Listas con `<For>`

```jsx
import { For } from '@verx/ui/for'

<ul>
  <For each={todos} key={(t) => t.id} fallback={<li>Nada pendiente</li>}>
    {(t, i) => <li>{() => i() + 1}. {t.text}</li>}
  </For>
</ul>
```

- **Solo toca lo que cambia.** Crea las filas nuevas y quita las que desaparecen. Para reordenar, deja quietas las de la subsecuencia creciente más larga y mueve el resto: pasar la última fila al principio es **un** movimiento, e intercambiar dos son **dos**.
- **Un ámbito por fila.** Sus efectos no se re-ejecutan cuando cambian otras filas, y se destruyen (con sus `onCleanup`) cuando la fila se va.
- **`index` es un signal** que sigue a la fila cuando se mueve.
- **Reutilización.** Una fila se reutiliza si su clave sigue y su dato es el **mismo** valor (`===`). Si el dato es otro objeto, la fila se vuelve a crear. Sin `key`, la clave es el propio dato.
- **En el servidor** es un `map`.
- **Va en su propio import** (`@verx/ui/for`). Bun reparte el código por módulos, así que si estuviera en `@verx/ui` lo pagarían todas las páginas con islas.

## Zonas reactivas

Cada `{() => …}` es una zona delimitada por dos nodos de texto vacíos. Al cambiar, se borra lo que haya entre ellos, de modo que las zonas anidadas y los `<For>` que crecieron después también se limpian. De texto a texto solo se cambia `.data`, sin crear nodos.

## Tests

`test/dom.js` es un DOM mínimo (sin dependencias) que cuenta las operaciones sobre el documento. Así los tests comprueban, por ejemplo, que mover una fila cuesta exactamente un `insertBefore`. Incluye una prueba al azar con 300 cambios que verifica el orden y que cada fila superviviente conserva su nodo.
