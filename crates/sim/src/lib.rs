//! # verx-sim
//!
//! Simulación de una galaxia espiral interactiva para el héroe 3D de VERX.
//! Se compila a WebAssembly sin `std`, sin allocator y sin dependencias: la
//! memoria es estática y el `.wasm` resultante ocupa unos pocos KB.
//!
//! Capas (sólo la última toca `unsafe`):
//! - [`math`]: aproximaciones rápidas y deterministas (seno, raíz, azar).
//! - [`galaxy`]: la física, sobre slices: se prueba con `cargo test` en nativo.
//! - [`abi`]: el contrato con JavaScript (funciones `verx_*` y memoria compartida).

#![cfg_attr(target_arch = "wasm32", no_std)]

pub mod abi;
pub mod galaxy;
pub mod math;

/// En WebAssembly un pánico es una trampa: sin mensajes ni formateo (binario mínimo).
#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    loop {}
}
