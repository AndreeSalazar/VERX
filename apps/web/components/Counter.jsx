'use client'
import { signal, computed } from '@verx/ui'

// Se renderiza en el servidor con `start` y se hidrata en el navegador.
// Al pulsar, sólo cambian los dos nodos de texto que leen los signals.
export default function Counter({ start = 0 }) {
  const count = signal(start)
  const double = computed(() => count() * 2)
  return (
    <div class="counter">
      <button type="button" aria-label="Restar" onClick={() => count.set(count() - 1)}>
        −
      </button>
      <output>{count}</output>
      <button type="button" aria-label="Sumar" onClick={() => count.set(count() + 1)}>
        +
      </button>
      <small>
        el doble es <b>{double}</b>
      </small>
    </div>
  )
}
