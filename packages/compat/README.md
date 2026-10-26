# @verx/compat

Respaldos propios, sin dependencias, para los navegadores a los que les falta algo que VERX usa. **El kit los carga solo donde hacen falta:** cada página lleva un cargador de una línea que comprueba si el navegador ya tiene la función y, solo si no, importa el respaldo. En Chrome y Edge no se descarga nada.

| Módulo | Para quién | Qué hace |
|---|---|---|
| `@verx/compat/reveal` | sin `animation-timeline` (Firefox; Safari < 26) | las mismas entradas y salidas con el scroll, con `IntersectionObserver` y la Web Animations API |
| `@verx/compat/prefetch` | sin Speculation Rules (Safari, Firefox) | precarga la página al pasar el ratón 65 ms por un enlace, al tocarlo o al llegar con el teclado |

## Una carpeta por función

```
features/
  animaciones-con-scroll/   feature.json · README.md · reveal.js   (respaldo)
  speculation-rules/        feature.json · README.md · prefetch.js (respaldo)
  backdrop-filter/          feature.json · README.md               (sin respaldo: se cubre con -webkit-)
  …                         una por cada función que usa VERX
```

Cada `feature.json` dice desde qué versión la trae cada navegador, cómo se detecta en el código, qué se pierde sin ella y si hay que protegerla. Esas fichas son la tabla que lee la regla `navegadores` del guardián, y `test/features.test.js` comprueba que estén bien formadas. **Añadir una función es crear su carpeta.**

Los dos respaldos se ponen en marcha solos al importarlos (`start()`), y exportan sus decisiones como funciones puras (`stateOf`, `keyframes`, `target`, `needs`), que son las que prueban los tests.

## reveal: el contrato con el CSS

El sitio decide qué se anima; el respaldo solo lo mueve.

```css
@property --verx-reveal { syntax: '<integer>'; inherits: false; initial-value: 0; }
main p, main .card { --verx-reveal: 1; }          /* esto se anima */
.grid > :nth-child(3n + 2) { --i: 1; }             /* retraso por columna */
@supports (animation-timeline: view()) { /* las animaciones de verdad */ }
```

- `inherits: false` hace falta para que los hijos de una tarjeta no hereden la marca: solo se anima el bloque más externo.
- Cada bloque está **debajo** (aún no ha entrado: oculto), **dentro** o **encima** (se fue por arriba: disuelto). Los 60 px de arriba, los de la cabecera, ya cuentan como fuera.
- Al entrar no deja ningún estilo puesto al terminar: las tarjetas conservan su `:hover` y no queda ningún `filter`.
- Lo que ya se ve al cargar no se mueve. Con «reducir movimiento», no arranca.

## prefetch: las mismas reglas que Chrome

Solo enlaces del propio sitio, nunca `/api/*` ni los `rel=nofollow`, ni descargas, ni la misma página. Cada página se precarga una vez. En Firefox usa `<link rel=prefetch>`. En Safari, que no lo tiene, usa un `fetch` de baja prioridad, que solo ahorra la descarga si la página se puede guardar en la caché HTTP. Con «ahorro de datos» activado, no hace nada.

## Probarlo en Chrome

Añade `?verx-compat` a la URL y el cargador importa los respaldos aunque el navegador no los necesite.
