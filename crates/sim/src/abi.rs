//! Contrato con JavaScript (ABI versión [`ABI_VERSION`]). Es el ÚNICO archivo del
//! crate con `unsafe`: lo exige el guardián (`verx-guard check`).
//!
//! Memoria: buffers estáticos de tamaño fijo ([`MAX`] partículas); nunca crece,
//! así que las vistas `Float32Array` de JS siguen siendo válidas.
//!
//! | Función | Descripción |
//! |---|---|
//! | `verx_abi() -> u32` | versión del contrato |
//! | `verx_init(count, seed) -> u32` | siembra la galaxia; devuelve el número real de partículas |
//! | `verx_step(dt, x, y, z, active)` | avanza `dt` s; el puntero cuenta si `active != 0` |
//! | `verx_points() -> *const f32` | `x, y, z, brillo` por partícula |
//! | `verx_colors() -> *const f32` | `r, g, b` por partícula |
//! | `verx_count() -> u32` | partículas activas |

#![allow(unsafe_code)]

use crate::galaxy::{self, Particle};

/// Versión del contrato. Súbela si cambia cualquier firma o el formato de la memoria.
pub const ABI_VERSION: u32 = 1;
/// Máximo de partículas: la memoria es estática (sin allocator).
pub const MAX: usize = 65_536;

static mut PARTICLES: [Particle; MAX] = [Particle::ZERO; MAX];
static mut POINTS: [f32; MAX * 4] = [0.0; MAX * 4];
static mut COLORS: [f32; MAX * 3] = [0.0; MAX * 3];
static mut COUNT: usize = 0;

/// Referencias explícitas a la memoria estática.
///
/// # Safety
/// Sólo puede haber un llamador a la vez. En WebAssembly sin hilos se cumple
/// siempre: JS llama a las funciones `verx_*` de una en una.
unsafe fn buffers() -> (
    &'static mut [Particle; MAX],
    &'static mut [f32; MAX * 4],
    &'static mut [f32; MAX * 3],
) {
    // SAFETY: ver el contrato de la función.
    #[allow(
        clippy::deref_addrof,
        reason = "`&mut *(&raw mut X)` es la forma explícita que exige Rust 2024 para static mut"
    )]
    unsafe {
        (
            &mut *(&raw mut PARTICLES),
            &mut *(&raw mut POINTS),
            &mut *(&raw mut COLORS),
        )
    }
}

/// Versión del contrato con JS.
#[unsafe(no_mangle)]
pub extern "C" fn verx_abi() -> u32 {
    ABI_VERSION
}

/// Siembra la galaxia con `count` partículas (máximo [`MAX`]) y devuelve cuántas hay.
#[unsafe(no_mangle)]
pub extern "C" fn verx_init(count: u32, seed: u32) -> u32 {
    let n = (count as usize).min(MAX);
    // SAFETY: un solo llamador (ver `buffers`).
    let (particles, _, colors) = unsafe { buffers() };
    galaxy::seed(&mut particles[..n], &mut colors[..n * 3], seed);
    // SAFETY: escritura de un entero sin hilos concurrentes.
    unsafe { COUNT = n };
    n as u32
}

/// Avanza la simulación `dt` segundos. El puntero (x, y, z) sólo actúa si `active != 0`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_step(dt: f32, x: f32, y: f32, z: f32, active: u32) {
    // SAFETY: un solo llamador (ver `buffers`).
    let (particles, points, _) = unsafe { buffers() };
    let n = verx_count() as usize;
    galaxy::step(
        &mut particles[..n],
        &mut points[..n * 4],
        dt,
        (active != 0).then_some([x, y, z]),
    );
}

/// Puntero a `x, y, z, brillo` de cada partícula (4 × `f32`).
#[unsafe(no_mangle)]
pub extern "C" fn verx_points() -> *const f32 {
    (&raw const POINTS).cast()
}

/// Puntero a `r, g, b` de cada partícula (3 × `f32`).
#[unsafe(no_mangle)]
pub extern "C" fn verx_colors() -> *const f32 {
    (&raw const COLORS).cast()
}

/// Número de partículas activas.
#[unsafe(no_mangle)]
pub extern "C" fn verx_count() -> u32 {
    // SAFETY: lectura de un entero; sin hilos no hay carrera posible.
    unsafe { COUNT as u32 }
}
