// Nube de puntos luminosa: cada punto es un sprite redondo con mezcla aditiva.
// Se dibuja en dos pasadas: un halo grande y tenue (un "bloom" barato, sin
// framebuffers) y un núcleo nítido. Los datos llegan como Float32Array:
//   points: x, y, z, brillo (dinámico, se sube cada frame)
//   colors: r, g, b         (fijo, se sube una vez)

const VERTEX = `#version 300 es
layout(location = 0) in vec4 aPoint;
layout(location = 1) in vec3 aColor;
uniform mat4 uViewProj;
uniform float uSize;
uniform float uHalo;
out vec3 vColor;
out float vGlow;
void main() {
  vec4 p = uViewProj * vec4(aPoint.xyz, 1.0);
  gl_Position = p;
  float size = uSize * (1.0 + aPoint.w * 1.8) * mix(1.0, 3.4, uHalo);
  gl_PointSize = clamp(size / p.w, 1.0, 72.0);
  vColor = aColor;
  vGlow = aPoint.w;
}`

// highp: los uniforms compartidos (uHalo) deben tener la misma precisión en ambos shaders.
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in float vGlow;
uniform float uHalo;
uniform float uIntensity;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float core = 1.0 - d;
  core *= core;
  float a = mix(core, core * 0.1, uHalo);
  vec3 color = mix(vColor, vec3(1.0, 0.97, 0.9), vGlow * 0.55);
  frag = vec4(color * a * uIntensity * (0.5 + vGlow), 1.0);
}`

export function createPointCloud(ctx, { count, colors }) {
  const { gl } = ctx
  const { program, uniforms } = ctx.program(VERTEX, FRAGMENT)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)

  const pointBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, count * 16, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0)

  const colorBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, count * 3), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0)
  gl.bindVertexArray(null)

  return {
    // Sube las posiciones del frame (puede ser una vista sobre la memoria del .wasm: cero copias en JS).
    update(points) {
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, points, 0, count * 4)
    },
    // Cambia los colores (p. ej. marcadores cuyo dueño cambia de un frame a otro).
    setColors(colors) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors, 0, count * 3)
    },
    // `visible`: dibuja sólo los primeros N puntos (por defecto, todos).
    draw(viewProj, { size = 22, intensity = 1, visible = count } = {}) {
      if (visible <= 0) return
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.uniformMatrix4fv(uniforms.uViewProj, false, viewProj)
      gl.uniform1f(uniforms.uSize, size)
      gl.uniform1f(uniforms.uIntensity, intensity)
      for (const halo of [1, 0]) {
        gl.uniform1f(uniforms.uHalo, halo)
        gl.drawArrays(gl.POINTS, 0, Math.min(visible, count))
      }
      gl.bindVertexArray(null)
    },
  }
}
