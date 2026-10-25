// Matemática 3D mínima. Matrices 4×4 en column-major (lo que espera WebGL),
// sobre Float32Array y sin crear objetos en el bucle de render.

export const mat4 = () => new Float32Array(16)

export function perspective(out, fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2)
  const nf = 1 / (near - far)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  return out
}

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const normalize = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

// Base de la cámara: hacia dónde mira, su derecha y su arriba.
export function basis(eye, target, up = [0, 1, 0]) {
  const forward = normalize(sub(target, eye))
  const right = normalize(cross(forward, up))
  return { forward, right, up: cross(right, forward) }
}

export function lookAt(out, eye, target, up = [0, 1, 0]) {
  const { forward: f, right: r, up: u } = basis(eye, target, up)
  out[0] = r[0]; out[1] = u[0]; out[2] = -f[0]; out[3] = 0
  out[4] = r[1]; out[5] = u[1]; out[6] = -f[1]; out[7] = 0
  out[8] = r[2]; out[9] = u[2]; out[10] = -f[2]; out[11] = 0
  out[12] = -dot(r, eye); out[13] = -dot(u, eye); out[14] = dot(f, eye); out[15] = 1
  return out
}

export function multiply(out, a, b) {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = s
    }
  }
  return out
}

// Proyecta un punto del mundo a coordenadas normalizadas de pantalla [-1, 1].
export function project(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  return [x / w, y / w]
}

// Rayo desde la cámara por un punto de pantalla (ndc) que corta el plano y = h.
export function rayToPlaneY(eye, target, fovY, aspect, ndcX, ndcY, h = 0) {
  const { forward, right, up } = basis(eye, target)
  const t = Math.tan(fovY / 2)
  const dir = [0, 1, 2].map((i) => forward[i] + right[i] * ndcX * t * aspect + up[i] * ndcY * t)
  if (Math.abs(dir[1]) < 1e-6) return null
  const k = (h - eye[1]) / dir[1]
  return k > 0 ? [eye[0] + dir[0] * k, h, eye[2] + dir[2] * k] : null
}
