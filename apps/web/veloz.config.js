import { defineConfig } from '@veloz/kit'

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
})
