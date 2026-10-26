---
title: "Componentes cliente (islas)"
summary: "Sólo los archivos con 'use client' mandan JavaScript, y sólo cuando hace falta."
---

Una página sin islas pesa 0 KB de JavaScript. Si un archivo empieza por `'use client'`, sus componentes se renderizan en el servidor y además se hidratan en el navegador. `Bun.build` los empaqueta minificados y con code splitting.

```jsx title="components/Counter.jsx"
'use client'
import { signal, computed } from '@verx/ui'

export default function Counter({ start }) {
  const count = signal(start)
  const double = computed(() => count() * 2)
  return <button onClick={() => count.set(count() + 1)}>{count} · {double}</button>
}
```

La reactividad es de grano fino, como en Solid: el componente se ejecuta una vez y cada signal actualiza sólo el nodo que lo lee. Para que una expresión sea reactiva, envuélvela en una función: `{() => count() * 2}`.

```jsx title="Cuándo se carga (como Astro)"
<Counter start={5} client:visible />  // por defecto: al entrar en pantalla
<Counter start={5} client:idle />     // cuando el navegador esté libre
<Counter start={5} client:load />     // en cuanto cargue
<Counter start={5} client:none />     // sólo HTML, cero JS
```

Las props viajan como JSON, así que no se pueden pasar funciones. Para código que sólo debe correr en el navegador (timers, window…) usa `onMount`.

## Listas con <For>

```jsx title="Lista con claves (como Solid)"
import { For } from '@verx/ui/for'

<ul>
  <For each={todos} key={(t) => t.id} fallback={<li>Nada pendiente</li>}>
    {(t, i) => <li>{() => i() + 1}. {t.text}</li>}
  </For>
</ul>
```

Cuando la lista cambia, For sólo crea las filas nuevas, quita las que desaparecen y mueve las mínimas: calcula la subsecuencia creciente más larga, así que pasar la última fila al principio es un único movimiento. Cada fila tiene su propio ámbito, e i es un signal que sigue a la fila. Va en su propio import (`@verx/ui/for`) para que sólo lo paguen las islas que lo usan.
