//! Galaxia espiral interactiva.
//!
//! Cada partícula orbita en su brazo con rotación diferencial (el centro gira
//! más rápido) y lleva un desplazamiento elástico: el puntero la empuja y la
//! arremolina, y un muelle amortiguado la devuelve a su órbita.

use crate::math::{Rng, TAU, sin_cos, sqrt};

/// Radio de la galaxia en unidades de mundo.
pub const RADIUS: f32 = 4.5;
const ARMS: usize = 3;
const TWIST: f32 = 1.35;
const SPRING: f32 = 7.0;
const DAMPING: f32 = 3.2;
const POINTER_RADIUS: f32 = 1.3;
const POINTER_PUSH: f32 = 16.0;
const POINTER_SWIRL: f32 = 6.0;
const MAX_DT: f32 = 0.05;

/// Estado de una partícula: su órbita y su desplazamiento elástico.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Particle {
    /// Distancia al centro.
    pub radius: f32,
    /// Ángulo actual en su órbita.
    pub angle: f32,
    /// Altura sobre el disco.
    pub height: f32,
    /// Velocidad angular (rad/s).
    pub omega: f32,
    /// Desplazamiento respecto a la órbita.
    pub offset: [f32; 3],
    /// Velocidad del desplazamiento.
    pub velocity: [f32; 3],
}

impl Particle {
    /// Partícula vacía (todo ceros), para inicializar memoria estática.
    pub const ZERO: Self = Self {
        radius: 0.0,
        angle: 0.0,
        height: 0.0,
        omega: 0.0,
        offset: [0.0; 3],
        velocity: [0.0; 3],
    };
}

// Paleta del centro al borde: oro → coral → violeta → cian.
const PALETTE: [(f32, [f32; 3]); 4] = [
    (0.0, [1.0, 0.86, 0.55]),
    (0.3, [1.0, 0.48, 0.36]),
    (0.62, [0.62, 0.38, 1.0]),
    (1.0, [0.26, 0.72, 1.0]),
];

fn palette(t: f32) -> [f32; 3] {
    let t = t.clamp(0.0, 1.0);
    for pair in PALETTE.windows(2) {
        let ((t0, a), (t1, b)) = (pair[0], pair[1]);
        if t <= t1 {
            let k = (t - t0) / (t1 - t0);
            return [
                a[0] + (b[0] - a[0]) * k,
                a[1] + (b[1] - a[1]) * k,
                a[2] + (b[2] - a[2]) * k,
            ];
        }
    }
    PALETTE[PALETTE.len() - 1].1
}

/// Siembra las partículas con una semilla y escribe su color RGB en `colors`
/// (3 valores por partícula). Misma semilla → misma galaxia.
pub fn seed(particles: &mut [Particle], colors: &mut [f32], seed: u32) {
    let mut rng = Rng::new(seed);
    let (colors, _) = colors.as_chunks_mut::<3>();
    for (i, (p, rgb)) in particles.iter_mut().zip(colors).enumerate() {
        let u = rng.unit();
        let in_core = rng.unit() < 0.16;
        let radius = if in_core {
            u * u * 0.9
        } else {
            0.35 + (RADIUS - 0.35) * u * (0.45 + 0.55 * u)
        };
        let arm = (i % ARMS) as f32 * TAU / ARMS as f32;
        let scatter = rng.gauss() * (0.2 + 0.5 / (1.0 + radius));
        *p = Particle {
            radius,
            angle: if in_core {
                rng.unit() * TAU
            } else {
                arm + radius * TWIST + scatter
            },
            height: rng.gauss() * 0.07 * (1.0 + 1.6 / (1.0 + radius * radius)),
            omega: 0.75 / (radius + 0.45),
            ..Particle::ZERO
        };
        let sparkle = rng.unit() < 0.025;
        let base = if sparkle {
            [1.0, 1.0, 1.0]
        } else {
            palette(radius / RADIUS + rng.gauss() * 0.06)
        };
        let shade = 0.75 + rng.unit() * 0.25;
        for (c, b) in rgb.iter_mut().zip(base) {
            *c = (b * shade).clamp(0.0, 1.0);
        }
    }
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Empuje y remolino de un puntero sobre una partícula en `pos`.
fn pointer_force(acc: &mut [f32; 3], pos: [f32; 3], q: [f32; 3]) {
    let d = sub(pos, q);
    let d2 = dot(d, d);
    if d2 >= POINTER_RADIUS * POINTER_RADIUS {
        return;
    }
    let dist = sqrt(d2).max(0.05);
    let falloff = 1.0 - dist / POINTER_RADIUS;
    let push = POINTER_PUSH * falloff * falloff / dist;
    let swirl = POINTER_SWIRL * falloff / dist;
    acc[0] += d[0] * push - d[2] * swirl;
    acc[1] += d[1] * push + falloff * 2.0;
    acc[2] += d[2] * push + d[0] * swirl;
}

/// Avanza `dt` segundos (se limita a 50 ms para que una pestaña dormida no
/// dispare la física). Cada puntero de `pointers` (el tuyo y los de otros
/// visitantes) empuja las partículas cercanas. Escribe `x, y, z, brillo` en
/// `out` (4 por partícula).
pub fn step(particles: &mut [Particle], out: &mut [f32], dt: f32, pointers: &[[f32; 3]]) {
    let dt = if dt.is_finite() {
        dt.clamp(0.0, MAX_DT)
    } else {
        0.0
    };
    let (out, _) = out.as_chunks_mut::<4>();
    for (p, o) in particles.iter_mut().zip(out) {
        p.angle += p.omega * dt;
        if p.angle > TAU * 64.0 {
            p.angle -= TAU * 64.0; // conserva precisión en sesiones largas
        }
        let (s, c) = sin_cos(p.angle);
        let home = [p.radius * c, p.height, p.radius * s];
        let pos = [
            home[0] + p.offset[0],
            home[1] + p.offset[1],
            home[2] + p.offset[2],
        ];

        // Muelle amortiguado hacia la órbita.
        let mut acc = [0.0_f32; 3];
        for ((a, off), vel) in acc.iter_mut().zip(p.offset).zip(p.velocity) {
            *a = -SPRING * off - DAMPING * vel;
        }
        for &q in pointers {
            pointer_force(&mut acc, pos, q);
        }
        // Euler semi-implícito: estable con el dt limitado.
        for ((vel, off), a) in p.velocity.iter_mut().zip(p.offset.iter_mut()).zip(acc) {
            *vel += a * dt;
            *off += *vel * dt;
        }
        *o = [
            home[0] + p.offset[0],
            home[1] + p.offset[1],
            home[2] + p.offset[2],
            (sqrt(dot(p.offset, p.offset)) * 0.9).min(1.0),
        ];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn galaxy(n: usize, s: u32) -> (Vec<Particle>, Vec<f32>, Vec<f32>) {
        let mut particles = vec![Particle::ZERO; n];
        let mut colors = vec![0.0; n * 3];
        seed(&mut particles, &mut colors, s);
        (particles, colors, vec![0.0; n * 4])
    }

    #[test]
    fn misma_semilla_misma_galaxia() {
        assert_eq!(galaxy(500, 42).0, galaxy(500, 42).0);
        assert_ne!(galaxy(500, 42).0, galaxy(500, 43).0);
    }

    #[test]
    fn radios_y_colores_en_rango() {
        let (particles, colors, _) = galaxy(5000, 1);
        assert!(particles.iter().all(|p| (0.0..=RADIUS).contains(&p.radius)));
        assert!(colors.iter().all(|c| (0.0..=1.0).contains(c)));
    }

    #[test]
    fn sin_puntero_sigue_su_orbita() {
        let (mut particles, _, mut out) = galaxy(1000, 3);
        for _ in 0..200 {
            step(&mut particles, &mut out, 1.0 / 60.0, &[]);
        }
        for (p, o) in particles.iter().zip(out.as_chunks::<4>().0) {
            let r = (o[0] * o[0] + o[2] * o[2]).sqrt();
            assert!((r - p.radius).abs() < 0.01);
            assert!(o[3].abs() < f32::EPSILON);
        }
    }

    #[test]
    fn el_puntero_empuja_y_el_muelle_devuelve() {
        let (mut particles, _, mut out) = galaxy(2000, 9);
        step(&mut particles, &mut out, 0.0, &[]);
        let target = [out[0], out[1], out[2]];
        let pointer = [[target[0] + 0.1, target[1], target[2]]];
        for _ in 0..30 {
            step(&mut particles, &mut out, 1.0 / 60.0, &pointer);
        }
        let pushed = particles[0].offset;
        assert!(dot(pushed, pushed) > 0.01, "la partícula debería apartarse");
        assert!(out[3] > 0.0, "y brillar al moverse");
        for _ in 0..900 {
            step(&mut particles, &mut out, 1.0 / 60.0, &[]);
        }
        assert!(
            particles.iter().all(|p| dot(p.offset, p.offset) < 1e-4),
            "el muelle la devuelve"
        );
    }

    #[test]
    fn varios_punteros_empujan_a_la_vez() {
        let (mut particles, _, mut out) = galaxy(4000, 11);
        step(&mut particles, &mut out, 0.0, &[]);
        // Un puntero junto a la partícula 0 y otro junto a la más alejada de ella.
        let pos = |i: usize| [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]];
        let a = pos(0);
        let far = (1..4000)
            .max_by(|&i, &j| {
                dot(sub(pos(i), a), sub(pos(i), a)).total_cmp(&dot(sub(pos(j), a), sub(pos(j), a)))
            })
            .unwrap_or(1);
        let b = pos(far);
        assert!(dot(sub(a, b), sub(a, b)) > 4.0 * POINTER_RADIUS * POINTER_RADIUS);
        let pointers = [[a[0] + 0.05, a[1], a[2]], [b[0] + 0.05, b[1], b[2]]];
        for _ in 0..20 {
            step(&mut particles, &mut out, 1.0 / 60.0, &pointers);
        }
        assert!(dot(particles[0].offset, particles[0].offset) > 0.001);
        assert!(dot(particles[far].offset, particles[far].offset) > 0.001);
    }

    #[test]
    fn dt_absurdo_no_rompe_nada() {
        let (mut particles, _, mut out) = galaxy(300, 5);
        for dt in [1000.0, f32::NAN, f32::INFINITY, -1.0] {
            step(&mut particles, &mut out, dt, &[[0.0, 0.0, 0.0]]);
        }
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
