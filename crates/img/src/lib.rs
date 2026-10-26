//! # verx-img
//!
//! Imágenes para VERX, en Rust compilado a WebAssembly y sin dependencias.
//! Trabaja en el servidor (al arrancar y al exportar), así que usa `std`.
//!
//! - [`png`] y [`encode`]: decodificar y codificar PNG (con [`inflate`] y [`deflate`] propios).
//! - [`resize`]: redimensionado gamma-correcto y el placeholder.
//! - [`abi`]: el contrato con JavaScript.

pub mod abi;
pub mod checksum;
pub mod deflate;
pub mod encode;
pub mod huffman;
pub mod inflate;
pub mod png;
pub mod resize;

/// Por qué no se pudo procesar una imagen.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Error {
    /// Los datos se acaban antes de tiempo.
    Truncated,
    /// Datos inválidos (con el motivo).
    Corrupt(&'static str),
    /// Algo válido pero que no se admite (con el motivo).
    Unsupported(&'static str),
    /// La imagen descomprimida sería demasiado grande.
    TooLarge,
}
