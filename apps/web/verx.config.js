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
  // Navegadores objetivo (regla `navegadores` del guardián): lo que falte en
  // alguno debe ir protegido, y VERX Grafo enseña en cada carpeta qué se pierde
  // y dónde. Chrome vale también para Edge.
  browsers: { chrome: 120, safari: 17, firefox: 128 },
  // Presupuesto de rendimiento (bytes transferidos con brotli, JS + WASM).
  // Lo exige el guardián (regla `presupuesto`): un commit que lo supere no entra.
  // `page` subió de 12 a 14 KB (el valor por defecto del kit) por el agujero
  // negro trazado en la GPU, presente en todas las páginas (isla BlackHoleGL,
  // 3,5 KB, cargada en idle): el inicio y /docs lo suman a su propia isla.
  // `island` subió de 8 a 9 KB por la lente gravitacional del héroe (Galaxy:
  // galaxia en una textura + pase de lente, ~0,3 KB) y porque el núcleo de
  // @verx/gl ahora va en un chunk compartido con BlackHoleGL (comprime aparte).
  // `page` subió de 14 a 16 KB por el sistema triple del fondo (BlackHoleGL de
  // 3,5 a 5,6 KB): tres agujeros trazados con sus discos inclinados, chorros y
  // filamentos magnéticos, más blackhole-system.js (órbitas, cámara y lentes
  // calculadas una vez por frame, no por píxel). Compactar el GLSL sólo
  // ahorraría 0,25 KB; la isla sigue muy por debajo de sus 9 KB.
  // `page` subió de 16 a 18 KB por los respaldos de @verx/compat (1,4 KB:
  // transiciones con el scroll y precarga al pasar el ratón). El presupuesto
  // cuenta el peor caso, Firefox, que los descarga los dos; Chrome y Edge no
  // descargan ninguno y el inicio sigue en 15,7 KB para ellos.
  budget: {
    page: 18 * 1024,
    island: 9 * 1024,
  },
})
