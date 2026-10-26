// Sistema triple de agujeros negros de Schwarzschild, trazando rayos de luz en
// la GPU (WebGL2): un gigante dominante y dos compañeros que lo orbitan, cada uno
// con su disco inclinado, sus chorros y un lazo de filamentos magnéticos que los
// une (blackhole-fx.js).
//
// Por cada píxel se lanza un rayo desde la cámara y se integra su órbita con la
// ecuación de los fotones en el espacio-tiempo curvo, en unidades del radio de
// Schwarzschild (rs) de cada agujero:   x'' = −(3/2) · h² · x / r⁵
// (h = |x × x'|, constante). Todo lo que se ve sale de esa curvatura:
//   · la sombra (radio aparente 3√3/2 rs) y el anillo de fotones;
//   · la lente: el lado de atrás del disco se ve por encima y por debajo, y las
//     estrellas del fondo se deforman en anillos de Einstein;
//   · el disco de acreción entre la última órbita estable (3 rs) y 14 rs, con
//     textura procedural que gira a velocidad kepleriana (más rápido dentro);
//   · Doppler relativista (un lado más brillante y azulado, el otro rojizo) y
//     corrimiento al rojo gravitacional.
//
// Con tres agujeros: cada rayo se integra sólo alrededor del que roza (el de
// menor parámetro de impacto, medido en sus rs); los otros dos lo desvían con la
// fórmula de campo débil. Lejos de todos (la mayor parte de la pantalla) no se
// integra nada: sólo esas desviaciones.
//
// Los comentarios van aquí, en JS, y no dentro del GLSL: el minificador quita
// los de JS, pero el texto de un shader viaja tal cual al navegador.

import { FX } from './blackhole-fx.js'

// Uniformes (los calcula blackhole-system.js una vez por frame): uCenter, centro
// del gigante en píxeles del lienzo (origen abajo); uFocal, píxeles por radián;
// uCam y uFw/uRt/uUp, la cámara y sus ejes; uHole[i], posición (en rs del
// gigante) y rs de cada agujero; uAxis[i], el eje de su disco (y de sus
// chorros); uSeen[i], dónde se ve en pantalla, en uv (desviado por los otros).
// NEAR: parámetro de impacto por debajo del cual se
// integra; SPHERE: radio desde el que se integra (fuera, la desviación se suma
// de forma analítica, sin costura con los rayos lejanos).
const HEADER = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform float uFocal;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uFw;
uniform vec3 uRt;
uniform vec3 uUp;
uniform vec4 uHole[3];
uniform vec3 uAxis[3];
uniform vec2 uSeen[3];
out vec4 frag;
const float RIN = 3.0;
const float ROUT = 14.0;
const float DIST = 70.0;
const float NEAR = 15.0;
const float SPHERE = 30.0;
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

// Disco de acreción en el punto p (en rs de su agujero) con eje n, visto por un
// rayo de dirección dir; devuelve emisión (rgb) y opacidad (a).
//   · Rotación kepleriana: la textura gira con ω ∝ r^-3/2 alrededor de n.
//   · Turbulencia: ruido deformado por otro ruido (domain warping), estirado en
//     el sentido de la órbita, más anillos finos que siguen el radio.
//   · Temperatura: blanco-dorado dentro, naranja y rojo fuera; `heat` calienta
//     los discos de los agujeros pequeños (más blancos), como en los reales.
//   · Doppler relativista + corrimiento gravitacional:
//     g = √(1−β²) / (1 − β·cosθ) · √(1 − rs/r), con β la velocidad orbital;
//     el brillo va como g^3.5 y el color se enfría o se calienta con g.
const DISK = `
vec4 disk(vec3 p, vec3 dir, vec3 n, float heat) {
  vec3 pr = p - dot(p, n) * n;
  float r = length(pr);
  float edge = smoothstep(RIN, RIN + 0.8, r) * (1.0 - smoothstep(ROUT - 5.0, ROUT, r));
  if (edge <= 0.0) return vec4(0.0);
  vec3 t1 = normalize(cross(n, abs(n.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  float a = atan(dot(pr, cross(n, t1)), dot(pr, t1)) - uTime * 2.2 * pow(r, -1.5);
  vec3 q = vec3(cos(a) * 3.4, sin(a) * 3.4, r * 1.9 + heat * 11.0);
  float nz = fbm(q + noise(q * 0.55) * 2.6, 5);
  float rings = 1.0 - 0.28 * (1.0 - heat * 0.8) * (0.5 - 0.5 * sin(r * 9.0 + nz * 9.0));
  float dens = edge * smoothstep(0.22, 0.85, nz) * rings;
  float t = pow(RIN / r, 0.9);
  vec3 c = mix(vec3(0.7, 0.12, 0.02), vec3(1.0, 0.6, 0.24), smoothstep(0.12 - heat * 0.1, 0.55 - heat * 0.2, t));
  c = mix(c, vec3(1.0, 0.94, 0.86), smoothstep(0.55 - heat * 0.3, 1.0, t));
  vec3 v = normalize(cross(n, pr));
  float beta = min(sqrt(0.5 / (r - 1.0)), 0.62);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(v, -dir)) * sqrt(1.0 - 1.0 / r);
  c *= pow(g, 3.5);
  c = mix(c, vec3(0.8, 0.88, 1.0) * dot(c, vec3(0.33)), clamp((g - 1.0) * 0.9, 0.0, 0.55));
  c = mix(c, c * vec3(1.0, 0.55, 0.4), clamp((1.0 - g) * 1.4, 0.0, 1.0));
  return vec4(c * dens * (2.4 + heat * 1.6), clamp(dens * 1.15, 0.0, 0.97));
}
`

// Desviación de campo débil hacia un agujero, sólo para el tramo del rayo que
// lo cruza: φ es el ángulo de cada punto del rayo visto desde el agujero
// (sin φ = −1 en el −∞, 0 en el punto más cercano, +1 en el +∞), y
//     α = (sin φ₂ − sin φ₁) / b          (en total, 2/b de −∞ a +∞)
// más el término de segundo orden 15π/(16 b²), repartido igual. Así un
// compañero a la misma profundidad que el gigante sólo se desvía por la parte
// del camino que de verdad pasa junto a él (si no, su imagen se iría de sitio).
// `w` es cualquier punto del rayo relativo al agujero, en sus rs.
const BEND = `
float sinAt(vec3 q, vec4 h, vec3 d) {
  vec3 v = q - h.xyz;
  return dot(v, d) / length(v);
}
vec3 bend(vec3 w, vec3 d, float s1, float s2) {
  vec3 c = w - dot(w, d) * d;
  float b = max(length(c), 1.0);
  float a = (s2 - s1) * (1.0 / b + 1.4726 / (b * b));
  return normalize(d - c / b * a);
}
`

// El trazado de un píxel:
//   · Cámara a DIST del dominante; gira con el puntero y con el scroll.
//   · `near`: el agujero que el rayo roza (impacto < NEAR en sus rs), o −1.
//   · Los demás desvían el rayo con bend() desde la cámara hasta el infinito.
//   · El cercano: el rayo avanza recto hasta la esfera SPHERE (con la desviación
//     de ese tramo), se integra dentro con pasos cortos cerca del horizonte y
//     largos lejos, y al salir suma la desviación del tramo hasta el infinito.
//   · T es la transmitancia: cuánta luz del fondo sigue pasando tras el disco.
//   · El halo de la esfera de fotones suma la luz que roza el agujero.
//   · Encima: chorros, filamentos y el resplandor de cada agujero, todos donde
//     se VE cada uno: su posición desviada por los otros (la misma bend() con
//     los extremos al revés, de él hacia la cámara), no donde está de verdad.
//   · Al final, tono fílmico (ACES), gamma y un poco de grano contra las bandas.
const MAIN = `
void main() {
  vec2 uv = (gl_FragCoord.xy - uCenter) / uFocal;
  vec3 cam = uCam;
  vec3 dir = normalize(uFw + uv.x * uRt + uv.y * uUp);
  int near = -1;
  float best = NEAR;
  float tNear = 0.0;
  vec3 ray = dir;
  vec3 rays[3];
  for (int k = 0; k < 3; k++) {
    vec3 X = uHole[k].xyz;
    float tk = dot(X - cam, dir);
    rays[k] = dir;
    if (tk <= 0.0 || length(cross((cam - X) / uHole[k].w, dir)) > NEAR + 24.0) continue;
    vec3 rk = dir;
    for (int j = 0; j < 3; j++) {
      if (j == k) continue;
      rk = bend((cam - uHole[j].xyz) / uHole[j].w, rk, sinAt(cam, uHole[j], rk), sinAt(cam + dir * tk, uHole[j], rk));
    }
    rays[k] = rk;
    float bk = length(cross((cam - X) / uHole[k].w, rk));
    if (bk < best) {
      best = bk;
      near = k;
      ray = rk;
      tNear = tk;
    }
  }
  if (near < 0) {
    for (int j = 0; j < 3; j++) ray = bend((cam - uHole[j].xyz) / uHole[j].w, ray, sinAt(cam, uHole[j], ray), 1.0);
  }
  vec3 col = vec3(0.0);
  vec3 halo = vec3(0.0);
  float T = 1.0;
  if (near >= 0) {
    vec4 h = uHole[near];
    vec3 n = uAxis[near];
    float heat = clamp(1.0 - h.w, 0.0, 1.0);
    vec3 pos = (cam - h.xyz) / h.w;
    float D = length(pos);
    float pd = dot(pos, ray);
    float bb = dot(pos, pos) - pd * pd;
    float sin1 = -sqrt(max(0.0, 1.0 - bb / (D * D)));
    float sin2 = -sqrt(max(0.0, 1.0 - bb / (SPHERE * SPHERE)));
    ray = bend(pos, ray, sin1, sin2);
    pd = dot(pos, ray);
    pos += ray * max(0.0, -pd - sqrt(max(0.0, pd * pd - dot(pos, pos) + SPHERE * SPHERE)));
    vec3 hv = cross(pos, ray);
    float h2 = dot(hv, hv);
    float r = length(pos);
    for (int i = 0; i < STEPS; i++) {
      float dt = clamp(0.11 * (r - 0.8), 0.03, 3.0);
      vec3 prev = pos;
      ray -= 1.5 * h2 * pos / (r * r * r * r * r) * dt;
      pos += ray * dt;
      float a0 = dot(prev, n);
      float a1 = dot(pos, n);
      if (a0 * a1 < 0.0) {
        vec4 dk = disk(mix(prev, pos, a0 / (a0 - a1)), normalize(ray), n, heat);
        col += T * dk.rgb;
        T *= 1.0 - dk.a;
        if (T < 0.02) break;
      }
      r = length(pos);
      halo += T * vec3(1.0, 0.5, 0.2) * 0.03 * dt / (r * r) * smoothstep(9.0, 3.0, r);
      if (r < 1.0) {
        T = 0.0;
        break;
      }
      if (r > SPHERE + 1.0 && dot(pos, ray) > 0.0) break;
    }
    ray = normalize(ray);
    if (T > 0.0) {
      float sb = length(cross(pos, ray)) / max(r, 1.0);
      ray = bend(pos, ray, sqrt(max(0.0, 1.0 - sb * sb)), 1.0);
      for (int j = 0; j < 3; j++) {
        if (j == near) continue;
        ray = bend((cam - uHole[j].xyz) / uHole[j].w, ray, sinAt(cam + dir * tNear, uHole[j], ray), 1.0);
      }
    }
  }
  if (T > 0.0) col += halo + T * sky(ray);
  for (int k = 0; k < 3; k++) {
    col += jet(cam, rays[k], uHole[k], uAxis[k], k == near ? T : 1.0);
    float g = length(uv - uSeen[k]) * DIST / uHole[k].w;
    col += vec3(1.0, 0.45, 0.16) * 0.09 * exp(-g / 14.0) * sqrt(uHole[k].w);
  }
  col += filaments(uv, uSeen[0], uSeen[1], uSeen[2]) * (near >= 0 ? 0.2 + 0.8 * T : 1.0);
  col *= 0.95;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (hash13(vec3(gl_FragCoord.xy, uTime * 60.0)) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`

export const FRAGMENT = HEADER + NOISE + SKY + DISK + BEND + FX + MAIN
