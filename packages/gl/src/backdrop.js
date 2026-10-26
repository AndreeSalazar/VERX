// Fondo a pantalla completa con un solo triángulo: degradado oscuro y una
// nebulosa suave alrededor de un punto de la pantalla (p. ej. el centro de la galaxia).

import { FULLSCREEN } from './context.js'

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform vec2 uCenter;
uniform float uAspect;
uniform vec3 uBase;
uniform vec3 uWarm;
uniform vec3 uCool;
out vec4 frag;
void main() {
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float r = length(d);
  vec3 color = uBase;
  color += uWarm * exp(-r * r * 9.0) * 0.55;
  color += uCool * exp(-r * r * 1.6) * 0.22;
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  frag = vec4(color + (grain - 0.5) / 255.0, 1.0);
}`

export function createBackdrop(ctx, { base = [0.027, 0.027, 0.043], warm = [0.55, 0.32, 0.12], cool = [0.22, 0.14, 0.45] } = {}) {
  const { gl } = ctx
  const { program, uniforms } = ctx.program(FULLSCREEN, FRAGMENT)
  const vao = gl.createVertexArray()
  return {
    // center en [0, 1] (origen abajo a la izquierda, como gl_FragCoord).
    draw(center, aspect) {
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.uniform2f(uniforms.uCenter, center[0], center[1])
      gl.uniform1f(uniforms.uAspect, aspect)
      gl.uniform3fv(uniforms.uBase, base)
      gl.uniform3fv(uniforms.uWarm, warm)
      gl.uniform3fv(uniforms.uCool, cool)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindVertexArray(null)
    },
  }
}
