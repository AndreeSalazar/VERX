// Contexto WebGL2 con lo justo: tamaño en píxeles reales (con DPR limitado
// para no quemar la GPU en pantallas 3x), compilación de programas con
// errores legibles y buffers.

export function createGL(canvas, { maxDpr = 2, alpha = false } = {}) {
  const gl = canvas.getContext('webgl2', { alpha, antialias: false, depth: false, powerPreference: 'high-performance' })
  if (!gl) return null
  let dpr = Math.min(globalThis.devicePixelRatio || 1, maxDpr)

  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    return { width: w, height: h, aspect: w / h, dpr }
  }

  const shader = (type, source) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`[verx/gl] shader: ${gl.getShaderInfoLog(s)}`)
    return s
  }

  const program = (vertex, fragment) => {
    const p = gl.createProgram()
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex))
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[verx/gl] programa: ${gl.getProgramInfoLog(p)}`)
    const uniforms = {}
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i).name
      uniforms[name] = gl.getUniformLocation(p, name)
    }
    return { program: p, uniforms }
  }

  return {
    gl,
    canvas,
    resize,
    program,
    // Baja la resolución si el equipo no llega (lo decide quien mide los frames).
    setMaxDpr(value) {
      dpr = Math.min(globalThis.devicePixelRatio || 1, value)
    },
  }
}
