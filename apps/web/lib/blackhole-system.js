// El sistema triple del fondo, en JS puro (sin DOM ni GPU, así se puede probar):
// dónde está cada agujero en cada instante, desde dónde mira la cámara y dónde
// se VE cada uno. blackhole-scene.js lo calcula una vez por frame y se lo pasa
// al shader, que así no repite por píxel lo que es igual para todos.
//
// Unidades: radios de Schwarzschild del gigante (rs = 1), como en el shader.

export const DIST = 70 // distancia de la cámara al gigante (la misma que en el shader)

const unit = ([x, y, z]) => {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

// El plano de las órbitas mira hacia donde suele estar la cámara: así los
// compañeros nunca pasan por delante del gigante (no se tapan).
const ORBIT_N = unit([0.8, 0.22, 0.56])
const ORBIT_U = unit(cross(ORBIT_N, [0, 1, 0]))
const ORBIT_V = cross(ORBIT_N, ORBIT_U)

// Los agujeros: radio de la órbita y periodo (s) de cada compañero, su rs
// (el del gigante es 1) y el eje de su disco, inclinado como en las fotos.
// Mismo periodo y 137° de desfase: el triángulo gira sin plegarse nunca (sus
// discos no se solapan en pantalla, que es donde el trazado elige a uno).
export const HOLES = [
  { orbit: 0, period: 1, phase: 0, rs: 1, axis: [0, 1, 0] },
  { orbit: 24, period: 120, phase: 0.6, rs: 0.42, axis: unit([0.35, 0.8, 0.5]) },
  { orbit: 27, period: 120, phase: 3.0, rs: 0.3, axis: unit([-0.55, 0.75, 0.25]) },
]

/** Posición de cada agujero en el instante `time` (s): [x, y, z, rs] × 3. */
export function positions(time, out = new Float32Array(12)) {
  HOLES.forEach((h, i) => {
    const a = (time / h.period) * Math.PI * 2 + h.phase
    const c = Math.cos(a) * h.orbit
    const s = Math.sin(a) * h.orbit
    out.set([ORBIT_U[0] * c + ORBIT_V[0] * s, ORBIT_U[1] * c + ORBIT_V[1] * s, ORBIT_U[2] * c + ORBIT_V[2] * s, h.rs], i * 4)
  })
  return out
}

/**
 * La cámara: gira un poco con el puntero (`look`, en [-1, 1]) y rodea el sistema
 * al bajar por la página (`scroll`, en [0, 1]). Mira siempre al gigante.
 */
export function camera(look, scroll) {
  const yaw = 0.55 + look.x * 0.07 + scroll * 0.85
  const pitch = 0.16 + look.y * 0.035 + scroll * 0.1
  const cam = [DIST * Math.cos(pitch) * Math.sin(yaw), DIST * Math.sin(pitch), DIST * Math.cos(pitch) * Math.cos(yaw)]
  const fw = unit([-cam[0], -cam[1], -cam[2]])
  const rt = unit(cross(fw, [0, 1, 0]))
  return { cam, fw, rt, up: cross(rt, fw) }
}

// La misma desviación de campo débil que el shader (bend en blackhole-shader.js).
const sinAt = (q, h, d) => {
  const v = sub(q, h)
  return dot(v, d) / Math.hypot(...v)
}
function bend(w, d, s1, s2) {
  const k = dot(w, d)
  const c = [w[0] - k * d[0], w[1] - k * d[1], w[2] - k * d[2]]
  const b = Math.max(Math.hypot(...c), 1)
  const a = (s2 - s1) * (1 / b + 1.4726 / (b * b))
  return unit([d[0] - (c[0] / b) * a, d[1] - (c[1] / b) * a, d[2] - (c[2] / b) * a])
}

/**
 * Dónde se ve cada agujero en pantalla (en las unidades uv del shader): su
 * dirección real, desviada por los otros dos en el tramo de él a la cámara.
 * Ahí nacen sus chorros, sus filamentos y su resplandor.
 */
export function apparent({ cam, fw, rt, up }, holes, out = new Float32Array(6)) {
  for (let k = 0; k < 3; k++) {
    const X = [holes[k * 4], holes[k * 4 + 1], holes[k * 4 + 2]]
    let seen = unit(sub(X, cam))
    for (let j = 0; j < 3; j++) {
      if (j === k) continue
      const H = [holes[j * 4], holes[j * 4 + 1], holes[j * 4 + 2]]
      const rs = holes[j * 4 + 3]
      const w = sub(cam, H).map((x) => x / rs)
      seen = bend(w, seen, sinAt(X, H, seen), sinAt(cam, H, seen))
    }
    const z = dot(seen, fw)
    out[k * 2] = dot(seen, rt) / z
    out[k * 2 + 1] = dot(seen, up) / z
  }
  return out
}
