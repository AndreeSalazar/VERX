// @verx/gl — motor WebGL2 mínimo. Sólo navegador; ningún módulo toca el DOM
// al importarse (se puede importar en el servidor durante el SSR sin romper).
export * as m4 from './math.js'
export { FULLSCREEN, createGL } from './context.js'
export { createLoop, prefersReducedMotion } from './loop.js'
export { createPointCloud } from './points.js'
export { createBackdrop } from './backdrop.js'
export { createTarget } from './target.js'

