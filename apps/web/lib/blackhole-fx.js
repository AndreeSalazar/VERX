// Lo que acompaña a los agujeros negros del fondo (ver blackhole-shader.js):
//
// · Chorros relativistas: el campo magnético del disco lanza plasma a casi la
//   velocidad de la luz a lo largo de su eje. Para cada píxel se busca el punto
//   del rayo (recto) más cercano al eje (distancia entre dos rectas) y se suma un
//   haz que se abre en cono, con nudos que viajan hacia fuera.
// · Filamentos magnéticos: líneas de campo que unen el sistema en un lazo. Se
//   dibujan en pantalla: un arco de circunferencia entre cada par de agujeros,
//   abombado hacia fuera, con varias hebras que ondulan y pulsos que fluyen.
//   Distancia a un arco = | |p − c| − R |: una raíz por hebra, casi gratis.
//
// Unidades: los chorros, en radios de Schwarzschild de su agujero; los
// filamentos, en las coordenadas de pantalla del trazador (uv, en radianes).

export const FX = `
vec3 jet(vec3 o, vec3 d, vec4 h, vec3 n, float occl) {
  vec3 w = (o - h.xyz) / h.w;
  float b = dot(d, n);
  float e = dot(w, n);
  float f = dot(w, d);
  float den = max(1.0 - b * b, 1e-4);
  float t = (b * e - f) / den;
  float s = (e - b * f) / den;
  if (t < 0.0) return vec3(0.0);
  float as = abs(s);
  float dist = length(w + t * d - s * n);
  float wd = 0.22 + 0.035 * as;
  float x = dist * dist / (wd * wd);
  if (x > 12.0 || as > 36.0) return vec3(0.0);
  float fade = smoothstep(2.0, 6.0, as) * exp(-as / 10.0) * smoothstep(36.0, 12.0, as);
  float knots = 0.45 + 0.55 * noise(vec3(as * 0.3 - uTime * 2.6, s > 0.0 ? 3.0 : 9.0, h.w * 17.0));
  float behind = step(-f, t);
  vec3 c = vec3(0.42, 0.55, 1.0) * exp(-x) * 0.22 + vec3(0.85, 0.92, 1.0) * exp(-x * 9.0) * 0.32;
  return c * fade * knots * mix(1.0, occl, behind);
}
vec2 strand(vec2 p, vec2 a, vec2 b, vec2 g, float sag, float k) {
  vec2 m = 0.5 * (a + b);
  vec2 e = b - a;
  float L = length(e);
  vec2 nrm = vec2(-e.y, e.x) / L;
  if (dot(m - g, nrm) < 0.0) nrm = -nrm;
  float s = sag * L;
  float R = (0.25 * L * L + s * s) / (2.0 * s);
  vec2 c = m + nrm * (s - R);
  vec2 q = p - c;
  float lq = length(q);
  if (abs(lq - R) > L * 0.04 + 90.0 / uFocal) return vec2(0.0);
  float lift = dot(c + q / lq * R - m, nrm) / s;
  if (lift <= 0.0) return vec2(0.0);
  float ang = atan(q.y, q.x);
  float wob = (sin(ang * 3.0 + uTime * 0.35 + k * 2.1) * 0.6 + sin(ang * 5.0 - uTime * 0.5 + k) * 0.4) * L * 0.035;
  float d = abs(lq - R - wob) * uFocal;
  float flow = 0.5 + 0.5 * sin(ang * 6.0 - uTime * 1.2 + k * 3.0);
  float fade = smoothstep(0.05, 0.55, lift);
  return vec2(exp(-d * d / 1.4), exp(-d / 16.0) * 0.07) * fade * (0.25 + 0.75 * flow);
}
vec3 filaments(vec2 p, vec2 s0, vec2 s1, vec2 s2) {
  vec2 g = (s0 + s1 + s2) / 3.0;
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    float sag = 0.14 + 0.07 * k;
    acc += strand(p, s0, s1, g, sag, k);
    acc += strand(p, s1, s2, g, sag + 0.03, k + 3.0);
    acc += strand(p, s2, s0, g, sag + 0.06, k + 6.0);
  }
  return vec3(0.62, 0.8, 1.0) * acc.x * 0.32 + vec3(0.45, 0.3, 1.0) * acc.y;
}
`
