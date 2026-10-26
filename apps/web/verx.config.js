import { defineConfig } from '@verx/kit'

export default defineConfig({
  lang: 'es',
  siteUrl: 'http://localhost:3000',
  // Prerenderiza la página siguiente al pasar el ratón por un enlace (Chrome/Edge).
  speculation: 'prerender',
  // Se hornean en cada respuesta (en los estáticos, al arrancar).
  headers: {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
  },
  bodyLimit: 64 * 1024,
  // Presupuesto de rendimiento (bytes transferidos con brotli, JS + WASM).
  // Lo exige el guardián (regla `presupuesto`): un commit que lo supere no entra.
  // `page` subió de 12 a 14 KB (el valor por defecto del kit) por el agujero
  // negro trazado en la GPU, presente en todas las páginas (isla BlackHoleGL,
  // 3,5 KB, cargada en idle): el inicio y /docs lo suman a su propia isla.
  // `island` subió de 8 a 9 KB por la lente gravitacional del héroe (Galaxy:
  // galaxia en una textura + pase de lente, ~0,3 KB) y porque el núcleo de
  // @verx/gl ahora va en un chunk compartido con BlackHoleGL (comprime aparte).
  budget: {
    page: 14 * 1024,
    island: 9 * 1024,
  },
})
