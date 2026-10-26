//! Contrato con JavaScript (ABI versión [`ABI_VERSION`]). Es el ÚNICO archivo del
//! crate con `unsafe`: lo exige el guardián (`verx-guard check`).
//!
//! Memoria estática de tamaño fijo, nunca crece: las vistas de JS siguen
//! siendo válidas. JS escribe el Markdown (UTF-8, saltos `\n`) en `input`.
//!
//! | Función | Descripción |
//! |---|---|
//! | `verx_abi() -> u32` | versión del contrato (1) |
//! | `verx_input() -> *mut u8` · `verx_input_capacity() -> u32` | Markdown de entrada |
//! | `verx_render(len) -> u32` | renderiza `input[..len]`; 1 si todo cupo, 0 si no |
//! | `verx_html() -> *const u8` · `verx_html_len() -> u32` | el HTML |
//! | `verx_meta() -> *const u8` · `verx_meta_len() -> u32` | `{"front":…,"words":N,"headings":[…]}` |

#![allow(unsafe_code)]

use crate::{Buffers, render};

/// Versión del contrato. Súbela si cambia cualquier firma o el formato de la memoria.
pub const ABI_VERSION: u32 = 1;
/// Bytes de Markdown de entrada.
pub const INPUT_CAPACITY: usize = 512 * 1024;
/// Bytes de HTML de salida.
pub const HTML_CAPACITY: usize = 2 * 1024 * 1024;

static mut INPUT: [u8; INPUT_CAPACITY] = [0; INPUT_CAPACITY];
static mut HTML: [u8; HTML_CAPACITY] = [0; HTML_CAPACITY];
static mut META: [u8; 64 * 1024] = [0; 64 * 1024];
static mut TOC: [u8; 32 * 1024] = [0; 32 * 1024];
static mut SCRATCH: [u8; 128 * 1024] = [0; 128 * 1024];
static mut PLAIN: [u8; 2048] = [0; 2048];
static mut SEEN: [(u64, u16); 512] = [(0, 0); 512];
static mut HTML_LEN: usize = 0;
static mut META_LEN: usize = 0;

/// Versión del contrato con JS.
#[unsafe(no_mangle)]
pub extern "C" fn verx_abi() -> u32 {
    ABI_VERSION
}

/// Buffer donde JS escribe el Markdown.
#[unsafe(no_mangle)]
pub extern "C" fn verx_input() -> *mut u8 {
    (&raw mut INPUT).cast()
}

/// Capacidad de `verx_input`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_input_capacity() -> u32 {
    INPUT_CAPACITY as u32
}

/// Renderiza `input[..len]`. Devuelve 1 si todo cupo y 0 si no.
#[unsafe(no_mangle)]
pub extern "C" fn verx_render(len: u32) -> u32 {
    // SAFETY: un solo llamador a la vez (WebAssembly sin hilos: JS llama a las
    // funciones verx_* de una en una), así que nadie más toca esta memoria.
    #[allow(
        clippy::deref_addrof,
        reason = "`&mut *(&raw mut X)` es la forma explícita que exige Rust 2024 para static mut"
    )]
    let (input, b) = unsafe {
        (
            &*(&raw const INPUT),
            Buffers {
                html: &mut *(&raw mut HTML),
                meta: &mut *(&raw mut META),
                toc: &mut *(&raw mut TOC),
                scratch: &mut *(&raw mut SCRATCH),
                plain: &mut *(&raw mut PLAIN),
                seen: &mut *(&raw mut SEEN),
            },
        )
    };
    let n = (len as usize).min(INPUT_CAPACITY);
    let result = render(&input[..n], b);
    let (html, meta) = result.unwrap_or((0, 0));
    // SAFETY: escrituras de enteros sin hilos concurrentes.
    unsafe {
        HTML_LEN = html;
        META_LEN = meta;
    }
    u32::from(result.is_some())
}

/// Puntero al HTML.
#[unsafe(no_mangle)]
pub extern "C" fn verx_html() -> *const u8 {
    (&raw const HTML).cast()
}

/// Longitud del HTML del último `verx_render`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_html_len() -> u32 {
    // SAFETY: lectura de un entero; sin hilos no hay carrera posible.
    unsafe { HTML_LEN as u32 }
}

/// Puntero al JSON de metadatos.
#[unsafe(no_mangle)]
pub extern "C" fn verx_meta() -> *const u8 {
    (&raw const META).cast()
}

/// Longitud del JSON del último `verx_render`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_meta_len() -> u32 {
    // SAFETY: lectura de un entero; sin hilos no hay carrera posible.
    unsafe { META_LEN as u32 }
}
