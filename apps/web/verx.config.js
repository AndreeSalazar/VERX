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
  budget: {
    page: 12 * 1024,
    island: 8 * 1024,
  },
})
