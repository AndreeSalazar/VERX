//! # verx-search
//!
//! Buscador de texto completo para VERX: construye un índice invertido y lo
//! consulta, en Rust y compilado a WebAssembly sin `std`, sin allocator y sin
//! dependencias. El mismo `.wasm` indexa en el servidor (al exportar el sitio)
//! y busca en el navegador, así que el formato del índice vive en un solo sitio.
//!
//! Capas (sólo la última toca `unsafe`):
//! - [`text`]: normalización en español, términos, palabras vacías y plurales.
//! - [`index`]: el formato `VXS1` (construir y leer).
//! - [`query`]: prefijos, semántica AND y puntuación.
//! - [`abi`]: el contrato con JavaScript (funciones `verx_*` y memoria compartida).

#![cfg_attr(target_arch = "wasm32", no_std)]

pub mod abi;
pub mod index;
pub mod query;
pub mod text;

/// En WebAssembly un pánico es una trampa: sin mensajes ni formateo (binario mínimo).
#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    loop {}
}
