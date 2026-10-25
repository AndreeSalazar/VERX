//! Matemática sin `std` (el `.wasm` no la incluye): aproximaciones rápidas y
//! deterministas, con precisión de sobra para gráficos.

/// τ = 2π.
pub const TAU: f32 = core::f32::consts::TAU;
const PI: f32 = core::f32::consts::PI;

/// Valor absoluto sin depender de `std`.
#[must_use]
pub fn abs(x: f32) -> f32 {
    if x < 0.0 { -x } else { x }
}

/// Seno aproximado (error máximo ≈ 0.001) para cualquier ángulo.
#[must_use]
pub fn sin(x: f32) -> f32 {
    // Reducción a [-π, π] sin `floor` (no existe en `core`).
    let turns = x / TAU;
    let k = (turns + if turns >= 0.0 { 0.5 } else { -0.5 }) as i32;
    let x = x - k as f32 * TAU;
    // Parábola de Bhaskara refinada.
    let y = 4.0 / PI * x - 4.0 / (PI * PI) * x * abs(x);
    0.225 * (y * abs(y) - y) + y
}

/// Seno y coseno a la vez.
#[must_use]
pub fn sin_cos(x: f32) -> (f32, f32) {
    (sin(x), sin(x + PI / 2.0))
}

/// Raíz cuadrada: inversa rápida + dos iteraciones de Newton (error relativo < 1e-5).
#[must_use]
pub fn sqrt(x: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    let mut y = f32::from_bits(0x5f37_59df - (x.to_bits() >> 1));
    y *= 1.5 - 0.5 * x * y * y;
    y *= 1.5 - 0.5 * x * y * y;
    x * y
}

/// Generador xorshift32: rápido, determinista y reproducible por semilla.
pub struct Rng(u32);

impl Rng {
    /// Crea el generador; una semilla 0 se sustituye (xorshift no admite 0).
    #[must_use]
    pub const fn new(seed: u32) -> Self {
        Self(if seed == 0 { 0x9E37_79B9 } else { seed })
    }

    /// Siguiente número de 32 bits.
    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// Uniforme en [0, 1).
    pub fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / 16_777_216.0
    }

    /// Aproximadamente normal N(0, 1): suma de cuatro uniformes, reescalada.
    pub fn gauss(&mut self) -> f32 {
        (self.unit() + self.unit() + self.unit() + self.unit() - 2.0) * 1.732
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seno_y_coseno_precisos() {
        let mut worst: f32 = 0.0;
        let mut x = -50.0_f32;
        while x < 50.0 {
            let (s, c) = sin_cos(x);
            worst = worst.max((s - x.sin()).abs()).max((c - x.cos()).abs());
            x += 0.013;
        }
        assert!(worst < 0.002, "error máximo {worst}");
    }

    #[test]
    fn raiz_precisa() {
        for v in [1e-4_f32, 0.5, 2.0, 9.0, 1234.5] {
            assert!((sqrt(v) - v.sqrt()).abs() / v.sqrt() < 1e-4, "sqrt({v})");
        }
        assert!(sqrt(0.0).abs() < f32::EPSILON);
        assert!(sqrt(-1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn azar_reproducible_y_en_rango() {
        let (mut a, mut b) = (Rng::new(7), Rng::new(7));
        for _ in 0..1000 {
            let u = a.unit();
            assert!((0.0..1.0).contains(&u));
            assert!((u - b.unit()).abs() < f32::EPSILON);
        }
    }
}
