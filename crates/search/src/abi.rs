//! Contrato con JavaScript (ABI versión [`ABI_VERSION`]). Es el ÚNICO archivo del
//! crate con `unsafe`: lo exige el guardián (`verx-guard check`).
//!
//! Memoria estática de tamaño fijo, nunca crece: las vistas `Uint8Array` de JS
//! siguen siendo válidas. JS escribe en `input` (corpus o consulta) y en `index`
//! (un índice ya construido); Rust deja los resultados en `results`.
//!
//! | Función | Descripción |
//! |---|---|
//! | `verx_abi() -> u32` | versión del contrato (1) |
//! | `verx_input() -> *mut u8` · `verx_input_capacity() -> u32` | texto de entrada (UTF-8) |
//! | `verx_index() -> *mut u8` · `verx_index_capacity() -> u32` | índice `VXS1` |
//! | `verx_build(len) -> u32` | indexa `input[..len]` en `index`; devuelve su tamaño (0 = no cabe) |
//! | `verx_load(len) -> u32` | valida `index[..len]` escrito por JS; devuelve sus documentos (0 = inválido) |
//! | `verx_query(len, limit) -> u32` | busca `input[..len]`; devuelve cuántos resultados hay |
//! | `verx_results() -> *const u32` | pares `doc, puntuación` |

#![allow(unsafe_code)]

use crate::index::{self, Index, Occurrence};
use crate::query::{self, Hit, Scratch};

/// Versión del contrato. Súbela si cambia cualquier firma o el formato de la memoria.
pub const ABI_VERSION: u32 = 1;
/// Bytes de texto de entrada (corpus o consulta).
pub const INPUT_CAPACITY: usize = 512 * 1024;
/// Bytes del índice.
pub const INDEX_CAPACITY: usize = 512 * 1024;
/// Apariciones de términos al construir.
pub const MAX_OCCURRENCES: usize = 65_536;
/// Documentos que se pueden consultar.
pub const MAX_DOCS: usize = 4096;
/// Resultados por consulta.
pub const MAX_RESULTS: usize = 64;

static mut INPUT: [u8; INPUT_CAPACITY] = [0; INPUT_CAPACITY];
static mut INDEX: [u8; INDEX_CAPACITY] = [0; INDEX_CAPACITY];
static mut INDEX_LEN: usize = 0;
static mut OCCURRENCES: [Occurrence; MAX_OCCURRENCES] = [Occurrence::ZERO; MAX_OCCURRENCES];
static mut SCORES: [u32; MAX_DOCS] = [0; MAX_DOCS];
static mut MATCHED: [u8; MAX_DOCS] = [0; MAX_DOCS];
static mut RESULTS: [Hit; MAX_RESULTS] = [Hit { doc: 0, score: 0 }; MAX_RESULTS];

/// Referencias explícitas a la memoria estática.
///
/// # Safety
/// Sólo puede haber un llamador a la vez. En WebAssembly sin hilos se cumple
/// siempre: JS llama a las funciones `verx_*` de una en una.
#[allow(
    clippy::deref_addrof,
    reason = "`&mut *(&raw mut X)` es la forma explícita que exige Rust 2024 para static mut"
)]
unsafe fn memory() -> (
    &'static mut [u8; INPUT_CAPACITY],
    &'static mut [u8; INDEX_CAPACITY],
    &'static mut [Occurrence; MAX_OCCURRENCES],
) {
    // SAFETY: ver el contrato de la función.
    unsafe {
        (
            &mut *(&raw mut INPUT),
            &mut *(&raw mut INDEX),
            &mut *(&raw mut OCCURRENCES),
        )
    }
}

/// Versión del contrato con JS.
#[unsafe(no_mangle)]
pub extern "C" fn verx_abi() -> u32 {
    ABI_VERSION
}

/// Buffer donde JS escribe el texto (corpus o consulta).
#[unsafe(no_mangle)]
pub extern "C" fn verx_input() -> *mut u8 {
    (&raw mut INPUT).cast()
}

/// Capacidad de `verx_input`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_input_capacity() -> u32 {
    INPUT_CAPACITY as u32
}

/// Buffer del índice: lo llena `verx_build` o JS antes de `verx_load`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_index() -> *mut u8 {
    (&raw mut INDEX).cast()
}

/// Capacidad de `verx_index`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_index_capacity() -> u32 {
    INDEX_CAPACITY as u32
}

/// Indexa `input[..len]` y deja el índice cargado. Devuelve su tamaño, o 0 si no cabe.
#[unsafe(no_mangle)]
pub extern "C" fn verx_build(len: u32) -> u32 {
    // SAFETY: un solo llamador (ver `memory`).
    let (input, out, scratch) = unsafe { memory() };
    let n = (len as usize).min(INPUT_CAPACITY);
    let size = index::build(&mut input[..n], scratch, out).unwrap_or(0);
    // SAFETY: escritura de un entero sin hilos concurrentes.
    unsafe { INDEX_LEN = size };
    size as u32
}

/// Valida `index[..len]` y lo deja cargado. Devuelve sus documentos, o 0 si no es válido.
#[unsafe(no_mangle)]
pub extern "C" fn verx_load(len: u32) -> u32 {
    // SAFETY: un solo llamador (ver `memory`).
    let (_, bytes, _) = unsafe { memory() };
    let n = (len as usize).min(INDEX_CAPACITY);
    let docs = Index::parse(&bytes[..n]).map_or(0, |i| i.docs);
    // SAFETY: escritura de un entero sin hilos concurrentes.
    unsafe { INDEX_LEN = if docs > 0 { n } else { 0 } };
    docs as u32
}

/// Busca `input[..len]` en el índice cargado; como mucho `limit` resultados.
#[unsafe(no_mangle)]
pub extern "C" fn verx_query(len: u32, limit: u32) -> u32 {
    // SAFETY: un solo llamador (ver `memory`); INDEX_LEN se lee sin hilos concurrentes.
    let ((input, bytes, _), loaded) = unsafe { (memory(), INDEX_LEN) };
    let Some(index) = Index::parse(&bytes[..loaded]) else {
        return 0;
    };
    // SAFETY: un solo llamador; SCORES, MATCHED y RESULTS sólo se usan aquí.
    #[allow(
        clippy::deref_addrof,
        reason = "`&mut *(&raw mut X)` es la forma explícita que exige Rust 2024 para static mut"
    )]
    let (scores, matched, results) = unsafe {
        (
            &mut *(&raw mut SCORES),
            &mut *(&raw mut MATCHED),
            &mut *(&raw mut RESULTS),
        )
    };
    let mut scratch = Scratch { scores, matched };
    let n = (len as usize).min(INPUT_CAPACITY);
    let k = (limit as usize).min(MAX_RESULTS);
    query::search(&index, &mut input[..n], &mut scratch, &mut results[..k]) as u32
}

/// Puntero a los resultados: `doc, puntuación` (2 × `u32`) por resultado.
#[unsafe(no_mangle)]
pub extern "C" fn verx_results() -> *const u32 {
    (&raw const RESULTS).cast()
}
