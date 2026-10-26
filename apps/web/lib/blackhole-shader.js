// Agujero negro de Schwarzschild trazando rayos de luz en la GPU (WebGL2).
//
// Por cada píxel se lanza un rayo desde la cámara y se integra su órbita con la
// ecuación de los fotones en el espacio-tiempo curvo, en unidades de radio de
// Schwarzschild (rs = 1):   x'' = −(3/2) · h² · x / r⁵   (h = |x × x'|, constante)
// Todo lo que se ve sale de esa curvatura, no de trucos:
//   · la sombra (radio aparente 3√3/2 rs) y el anillo de fotones;
//   · la lente: el lado de atrás del disco se ve por encima y por debajo, y las
//     estrellas del fondo se deforman en un anillo de Einstein;
//   · el disco de acreción entre la última órbita estable (3 rs) y 14 rs, con
//     textura procedural que gira a velocidad kepleriana (más rápido dentro);
//   · Doppler relativista (un lado más brillante y azulado, el otro rojizo) y
//     corrimiento al rojo gravitacional.
//
// Los comentarios van aquí, en JS, y no dentro del GLSL: el minificador quita
// los de JS, pero el texto de un shader viaja tal cual al navegador.

// Uniformes: uCenter, centro del agujero en píxeles del lienzo (origen abajo);
// uFocal, píxeles por radián; uLook, paralaje del puntero en [-1, 1].
// RIN es la última órbita estable; DIST, la distancia de la cámara.
const HEADER = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform float uFocal;
uniform float uTime;
uniform vec2 uLook;
out vec4 frag;
const float RIN = 3.0;
const float ROUT = 14.0;
const float DIST = 26.0;
const int STEPS = 120;
`

// Ruido: hashes sin senos (estables en cualquier GPU), ruido de valor 3D y fbm.
const NOISE = `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 e = vec2(1.0, 0.0);
  return mix(
    mix(mix(hash13(i), hash13(i + e.xyy), f.x), mix(hash13(i + e.yxy), hash13(i + e.xxy), f.x), f.y),
    mix(mix(hash13(i + e.yyx), hash13(i + e.xyx), f.x), mix(hash13(i + e.yxx), hash13(i + e.xxx), f.x), f.y),
    f.z);
}
float fbm(vec3 p, int octaves) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    s += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`

// Fondo: dos capas de estrellas que titilan (una estrella por celda en el 14 %
// de las celdas de una rejilla sobre la esfera) y una nebulosa tenue de 3 octavas.
const SKY = `
vec3 starLayer(vec3 d, float scale) {
  vec3 q = d * scale;
  vec3 id = floor(q);
  vec3 h = hash33(id);
  if (h.x < 0.86) return vec3(0.0);
  vec3 off = (hash33(id + 7.0) - 0.5) * 0.6;
  float dist = length(fract(q) - 0.5 - off);
  float b = smoothstep(0.07 + 0.07 * h.y, 0.0, dist) * (0.35 + 2.4 * pow(h.z, 6.0));
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.0 + 3.0 * h.z) + h.x * 40.0);
  return mix(vec3(1.0, 0.8, 0.62), vec3(0.72, 0.84, 1.0), h.y) * b * twinkle;
}
vec3 sky(vec3 d) {
  vec3 c = starLayer(d, 46.0) + 0.6 * starLayer(d.yzx, 92.0);
  float n = fbm(d * 1.7 + 3.0, 3);
  c += vec3(0.3, 0.13, 0.5) * pow(n, 4.0) * 0.14 + vec3(0.5, 0.18, 0.06) * pow(n * 1.1, 7.0) * 0.1;
  return c;
}
`

// Disco de acreción en el punto p (plano y = 0) visto por un rayo de dirección
// dir; devuelve emisión (rgb) y opacidad (a).
//   · Rotación kepleriana: la textura gira con ω ∝ r^-3/2.
//   · Turbulencia: ruido deformado por otro ruido (domain warping), estirado en
//     el sentido de la órbita, más filamentos finos que siguen el radio.
//   · Temperatura: blanco-dorado dentro, naranja y rojo fuera.
//   · Doppler relativista + corrimiento gravitacional:
//     g = √(1−β²) / (1 − β·cosθ) · √(1 − rs/r), con β la velocidad orbital;
//     el brillo va como g^3.5 y el color se enfría o se calienta con g.
const DISK = `
vec4 disk(vec3 p, vec3 dir) {
  float r = length(p.xz);
  float edge = smoothstep(RIN, RIN + 0.8, r) * (1.0 - smoothstep(ROUT - 5.0, ROUT, r));
  if (edge <= 0.0) return vec4(0.0);
  float a = atan(p.z, p.x) - uTime * 2.2 * pow(r, -1.5);
  vec3 q = vec3(cos(a) * 3.4, sin(a) * 3.4, r * 1.9);
  float n = fbm(q + noise(q * 0.55) * 2.6, 5);
  float rings = 0.72 + 0.28 * sin(r * 9.0 + n * 9.0);
  float dens = edge * smoothstep(0.22, 0.85, n) * rings;
  float t = pow(RIN / r, 0.9);
  vec3 c = mix(vec3(0.7, 0.12, 0.02), vec3(1.0, 0.6, 0.24), smoothstep(0.12, 0.55, t));
  c = mix(c, vec3(1.0, 0.94, 0.86), smoothstep(0.55, 1.0, t));
  vec3 v = normalize(vec3(-p.z, 0.0, p.x));
  float beta = min(sqrt(0.5 / (r - 1.0)), 0.62);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(v, -dir)) * sqrt(1.0 - 1.0 / r);
  c *= pow(g, 3.5);
  c = mix(c, vec3(0.8, 0.88, 1.0) * dot(c, vec3(0.33)), clamp((g - 1.0) * 0.9, 0.0, 0.55));
  c = mix(c, c * vec3(1.0, 0.55, 0.4), clamp((1.0 - g) * 1.4, 0.0, 1.0));
  return vec4(c * dens * 2.4, clamp(dens * 1.15, 0.0, 0.97));
}
`

// El trazado:
//   · T es la transmitancia: cuánta luz del fondo sigue pasando tras el disco.
//   · Si el parámetro de impacto b supera 15 rs, el rayo no puede tocar el disco
//     y la curvatura es débil: se aplica la desviación de Einstein
//     α = 2/b + 15π/(16 b²) hacia el agujero, sin integrar (la mayor parte de la
//     pantalla, y el motivo de que el shader vaya ~18 veces más rápido).
//   · Si no, se integra con pasos cortos cerca del horizonte y largos lejos.
//   · El halo de la esfera de fotones suma la luz que roza el agujero; sólo
//     cerca (sin costura con los rayos lejanos) y sólo si el rayo escapa.
//   · Al final, tono fílmico (ACES), gamma y un poco de grano contra las bandas.
const MAIN = `
void main() {
  vec2 uv = (gl_FragCoord.xy - uCenter) / uFocal;
  float yaw = 0.55 + uLook.x * 0.07;
  float pitch = 0.11 + uLook.y * 0.035;
  vec3 pos = DIST * vec3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw));
  vec3 fw = normalize(-pos);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 dir = normalize(fw + uv.x * rt + uv.y * up);
  vec3 hv = cross(pos, dir);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  vec3 halo = vec3(0.0);
  float T = 1.0;
  float b = sqrt(h2);
  if (b > 15.0) {
    vec3 c = pos - dot(pos, dir) * dir;
    dir = normalize(dir - normalize(c) * (2.0 / b + 2.945 / h2));
  } else {
    float r = length(pos);
    for (int i = 0; i < STEPS; i++) {
      float dt = clamp(0.11 * (r - 0.8), 0.03, 3.0);
      vec3 prev = pos;
      dir -= 1.5 * h2 * pos / (r * r * r * r * r) * dt;
      pos += dir * dt;
      if (prev.y * pos.y < 0.0) {
        vec4 d = disk(mix(prev, pos, prev.y / (prev.y - pos.y)), normalize(dir));
        col += T * d.rgb;
        T *= 1.0 - d.a;
        if (T < 0.02) break;
      }
      r = length(pos);
      halo += T * vec3(1.0, 0.5, 0.2) * 0.03 * dt / (r * r) * smoothstep(9.0, 3.0, r);
      if (r < 1.0) {
        T = 0.0;
        break;
      }
      if (r > DIST + 8.0 && dot(pos, dir) > 0.0) break;
    }
  }
  if (T > 0.0) col += halo + T * sky(normalize(dir));
  col *= 0.95;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (hash13(vec3(gl_FragCoord.xy, uTime * 60.0)) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`

export const FRAGMENT = HEADER + NOISE + SKY + DISK + MAIN
