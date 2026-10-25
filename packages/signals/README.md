# @veloz/signals

Reactividad de grano fino, inspirada en Solid y Preact Signals. No depende de nada y funciona igual en el servidor que en el navegador.

```js
import { signal, computed, effect, batch } from '@veloz/signals'

const count = signal(0)              // count() lee · count.set(1) escribe
const double = computed(() => count() * 2)
effect(() => console.log(double()))  // se re-ejecuta solo cuando cambia double
batch(() => { count.set(1); count.set(2) }) // un solo re-render
```

También exporta `untrack`, `onCleanup`, `root`, `getOwner`, `runWithOwner` e `isSignal`.

Los efectos creados dentro de otro efecto le pertenecen: se destruyen cuando el padre se re-ejecuta. Así, re-renderizar una lista o un condicional no deja efectos huérfanos.
