// Lente gravitacional sobre la galaxia del héroe. La galaxia se dibuja antes en
// una textura (createTarget de @verx/gl) y este pase la deforma en pantalla.
//
// Para cada píxel en la posición θ (respecto al agujero) se busca de dónde
// viene su luz con la ecuación de la lente de una masa puntual:
//     β = θ − θE² · θ / |θ|²          (θE = radio de Einstein)
// Así el núcleo brillante, que está justo detrás, se estira en un anillo de
// Einstein, y lo que hay al otro lado aparece como una imagen secundaria
// invertida dentro del anillo. Dentro de la sombra no escapa luz, y en su
// borde brilla el anillo de fotones. Un solo pase y una lectura de textura por
// píxel: casi gratis.
//
// Los comentarios van aquí y no en el GLSL: el texto del shader viaja tal cual.

import { FULLSCREEN } from '@verx/gl'

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uShadow;
uniform float uEinstein;
out vec4 frag;
void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float r2 = max(dot(p, p), 1.0);
  float r = sqrt(r2);
  vec2 uv = (uCenter + p * (1.0 - uEinstein * uEinstein / r2)) / uRes;
  vec2 edge = smoothstep(vec2(0.0), vec2(0.02), uv) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - uv);
  vec3 c = texture(uScene, uv).rgb * edge.x * edge.y;
  c *= smoothstep(uShadow * 0.96, uShadow * 1.04, r);
  float ring = (r - uShadow * 1.05) / (uShadow * 0.04);
  c += vec3(1.0, 0.74, 0.46) * exp(-ring * ring) * 0.85;
  frag = vec4(c, 1.0);
}`

// Einstein / sombra: cuánto más grande que la sombra es el anillo.
const EINSTEIN = 1.7

export function createLens(ctx) {
  const { gl } = ctx
  const { program, uniforms: u } = ctx.program(FULLSCREEN, FRAGMENT)
  const vao = gl.createVertexArray()
  return {
    // Dibuja `texture` en pantalla con la lente centrada en `center` (píxeles del
    // lienzo, origen abajo) y una sombra de `shadow` píxeles de radio.
    draw(texture, { width, height, center, shadow }) {
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(u.uScene, 0)
      gl.uniform2f(u.uRes, width, height)
      gl.uniform2f(u.uCenter, center[0], center[1])
      gl.uniform1f(u.uShadow, shadow)
      gl.uniform1f(u.uEinstein, shadow * EINSTEIN)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindVertexArray(null)
    },
  }
}
