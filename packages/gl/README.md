# @verx/gl

Motor WebGL2 mínimo, sin dependencias (sin Three.js). Solo funciona en el navegador, pero se puede importar en el servidor sin problemas: ningún módulo toca el DOM al cargarse.

| Módulo | Qué da |
|---|---|
| `m4` | `perspective`, `lookAt`, `multiply`, `project` y `rayToPlaneY`, sobre `Float32Array` y sin crear objetos por frame |
| `createGL(canvas, { maxDpr })` | contexto WebGL2 con DPR limitado, programas con errores legibles y `resize()` |
| `createLoop(canvas, frame, { onSlow })` | `requestAnimationFrame` que se pausa fuera de pantalla o con la pestaña oculta, respeta `prefers-reduced-motion` y avisa si los frames van lentos |
| `createPointCloud(ctx, { count, colors })` | sprites aditivos en dos pasadas: halo tenue más núcleo nítido (un bloom barato, sin framebuffers) |
| `createBackdrop(ctx)` | fondo a pantalla completa con nebulosa, dibujado con un solo triángulo |
| `createTarget(ctx)` | objetivo de render (framebuffer + textura) para dibujar fuera de pantalla y posprocesar, p. ej. con una lente gravitacional |

`points.update(view)` acepta directamente una vista `Float32Array` sobre la memoria del `.wasm` de `@verx/sim`, así que los datos pasan de Rust a la GPU sin copias en JS.

## `@verx/gl/core`

Solo `createGL`, `createLoop`, `prefersReducedMotion` y `FULLSCREEN` (el vértice del triángulo a pantalla completa), para quien dibuja con un shader a pantalla completa (como el agujero negro del sitio). Bun reparte el código por módulos, así que importar de `@verx/gl` arrastraría también la matemática 3D, las nubes de puntos y el fondo, aunque no se usen.
