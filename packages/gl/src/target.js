// Objetivo de render (framebuffer + textura): se dibuja ahí en vez de en la
// pantalla y luego un shader usa el resultado como imagen (por ejemplo, para
// deformarlo con una lente gravitacional). Se ajusta solo al tamaño pedido.

export function createTarget(ctx) {
  const { gl } = ctx
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  let width = 0
  let height = 0
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  return {
    texture,
    // Ejecuta `draw()` con este objetivo activo, de `w × h` píxeles; al acabar
    // vuelve a dibujar en la pantalla.
    render(w, h, draw) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      if (w !== width || h !== height) {
        width = w
        height = h
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      }
      gl.viewport(0, 0, w, h)
      draw()
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, w, h)
    },
    destroy() {
      gl.deleteFramebuffer(framebuffer)
      gl.deleteTexture(texture)
    },
  }
}
