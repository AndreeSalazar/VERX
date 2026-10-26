// @verx/gl/core — lo mínimo para dibujar con un shader a pantalla completa:
// contexto y bucle de render. Bun reparte el código por módulos, así que quien
// importe de aquí no carga la matemática 3D ni las nubes de puntos.
export { FULLSCREEN, createGL } from './context.js'
export { createLoop, prefersReducedMotion } from './loop.js'

