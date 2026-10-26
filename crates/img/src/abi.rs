//! Contrato con JavaScript (ABI versión [`ABI_VERSION`]). Es el ÚNICO archivo del
//! crate con `unsafe`: lo exige el guardián (`verx-guard check`).
//!
//! A diferencia de los otros puentes, éste usa `std` y memoria dinámica (las
//! imágenes pesan lo que pesan): la memoria del `.wasm` puede crecer en
//! cualquier llamada, así que JS vuelve a crear sus vistas después de cada una.
//!
//! | Función | Descripción |
//! |---|---|
//! | `verx_abi() -> u32` | versión del contrato (2) |
//! | `verx_alloc(len) -> *mut u8` | reserva la entrada y devuelve dónde escribirla |
//! | `verx_decode(len) -> u32` | decodifica el PNG de la entrada (0 = bien; si no, ver `verx_error`) |
//! | `verx_width()` · `verx_height()` · `verx_alpha()` | de la imagen decodificada |
//! | `verx_color() -> u32` | su color medio, `0xRRGGBB` |
//! | `verx_resize(width) -> u32` | la reduce a `width` (proporcional) y la codifica en PNG |
//! | `verx_resize_jpeg(width, quality) -> u32` | igual, pero en JPEG de calidad 1..100 (sin alfa) |
//! | `verx_placeholder(max) -> u32` | miniatura de `max` px de lado mayor, en PNG |
//! | `verx_encode(width, height) -> u32` | codifica la entrada (RGBA en bruto) como PNG |
//! | `verx_output() -> *const u8` · `verx_out_width()` · `verx_out_height()` | la última imagen codificada |
//! | `verx_error() -> *const u8` · `verx_error_len()` | el motivo del último error (UTF-8) |
//!
//! Historial: v1 sólo codificaba PNG; v2 añade `verx_resize_jpeg`.

#![allow(unsafe_code)]

use crate::Error;
use crate::encode::encode;
use crate::jpeg;
use crate::png::{Image, decode};
use crate::resize::{average, height_for, resize, thumbnail};

/// Versión del contrato. Súbela si cambia cualquier firma o el formato de la memoria.
pub const ABI_VERSION: u32 = 2;

struct State {
    input: Vec<u8>,
    image: Option<Image>,
    output: Vec<u8>,
    out_size: (u32, u32),
    error: &'static str,
}

static mut STATE: State = State {
    input: Vec::new(),
    image: None,
    output: Vec::new(),
    out_size: (0, 0),
    error: "",
};

/// El estado global del puente.
///
/// # Safety
/// Sólo puede haber un llamador a la vez. En WebAssembly sin hilos se cumple
/// siempre: JS llama a las funciones `verx_*` de una en una.
#[allow(
    clippy::deref_addrof,
    reason = "`&mut *(&raw mut X)` es la forma explícita que exige Rust 2024 para static mut"
)]
unsafe fn state() -> &'static mut State {
    // SAFETY: ver el contrato de la función.
    unsafe { &mut *(&raw mut STATE) }
}

fn fail(s: &mut State, e: Error) -> u32 {
    let (code, why) = match e {
        Error::Truncated => (1, "el archivo está cortado"),
        Error::Corrupt(why) => (2, why),
        Error::Unsupported(why) => (3, why),
        Error::TooLarge => (4, "la imagen es demasiado grande"),
    };
    s.error = why;
    code
}

fn emit(s: &mut State, img: &Image) -> u32 {
    s.output = encode(img);
    s.out_size = (img.width, img.height);
    s.output.len() as u32
}

/// Versión del contrato con JS.
#[unsafe(no_mangle)]
pub extern "C" fn verx_abi() -> u32 {
    ABI_VERSION
}

/// Reserva `len` bytes de entrada y devuelve dónde escribirlos.
#[unsafe(no_mangle)]
pub extern "C" fn verx_alloc(len: u32) -> *mut u8 {
    // SAFETY: un solo llamador (ver `state`).
    let s = unsafe { state() };
    s.input.clear();
    s.input.resize(len as usize, 0);
    s.input.as_mut_ptr()
}

/// Decodifica el PNG de la entrada. 0 si fue bien; si no, un código de error.
#[unsafe(no_mangle)]
pub extern "C" fn verx_decode(len: u32) -> u32 {
    // SAFETY: un solo llamador (ver `state`).
    let s = unsafe { state() };
    let n = (len as usize).min(s.input.len());
    match decode(&s.input[..n]) {
        Ok(img) => {
            s.image = Some(img);
            0
        }
        Err(e) => {
            s.image = None;
            fail(s, e)
        }
    }
}

fn image() -> Option<&'static Image> {
    // SAFETY: un solo llamador (ver `state`); la referencia no sobrevive a la llamada de JS.
    unsafe { state() }.image.as_ref()
}

/// Ancho de la imagen decodificada.
#[unsafe(no_mangle)]
pub extern "C" fn verx_width() -> u32 {
    image().map_or(0, |i| i.width)
}

/// Alto de la imagen decodificada.
#[unsafe(no_mangle)]
pub extern "C" fn verx_height() -> u32 {
    image().map_or(0, |i| i.height)
}

/// 1 si la imagen tiene transparencia.
#[unsafe(no_mangle)]
pub extern "C" fn verx_alpha() -> u32 {
    image().map_or(0, |i| u32::from(i.has_alpha()))
}

/// Color medio, `0xRRGGBB`.
#[unsafe(no_mangle)]
pub extern "C" fn verx_color() -> u32 {
    image().map_or(0, average)
}

/// Reduce la imagen a `width` (manteniendo la proporción) y la codifica en PNG.
#[unsafe(no_mangle)]
pub extern "C" fn verx_resize(width: u32) -> u32 {
    let Some(img) = image() else { return 0 };
    let out = resize(img, width, height_for(img, width.min(img.width)));
    // SAFETY: un solo llamador (ver `state`).
    emit(unsafe { state() }, &out)
}

/// Como `verx_resize`, pero en JPEG de calidad `quality` (1..100). El alfa se descarta.
#[unsafe(no_mangle)]
pub extern "C" fn verx_resize_jpeg(width: u32, quality: u32) -> u32 {
    let Some(img) = image() else { return 0 };
    let out = resize(img, width, height_for(img, width.min(img.width)));
    // SAFETY: un solo llamador (ver `state`).
    let s = unsafe { state() };
    s.output = jpeg::encode(&out, quality.clamp(1, 100) as u8);
    s.out_size = (out.width, out.height);
    s.output.len() as u32
}

/// Miniatura de `max` píxeles de lado mayor, en PNG (para el placeholder).
#[unsafe(no_mangle)]
pub extern "C" fn verx_placeholder(max: u32) -> u32 {
    let Some(img) = image() else { return 0 };
    let out = thumbnail(img, max.max(1));
    // SAFETY: un solo llamador (ver `state`).
    emit(unsafe { state() }, &out)
}

/// Codifica la entrada, RGBA en bruto de `width × height`, como PNG.
#[unsafe(no_mangle)]
pub extern "C" fn verx_encode(width: u32, height: u32) -> u32 {
    // SAFETY: un solo llamador (ver `state`).
    let s = unsafe { state() };
    let need = width as usize * height as usize * 4;
    if width == 0 || height == 0 || s.input.len() < need {
        fail(s, Error::Corrupt("faltan píxeles para ese tamaño"));
        return 0;
    }
    let img = Image {
        width,
        height,
        rgba: s.input[..need].to_vec(),
    };
    emit(s, &img)
}

/// Puntero al último PNG.
#[unsafe(no_mangle)]
pub extern "C" fn verx_output() -> *const u8 {
    // SAFETY: un solo llamador (ver `state`).
    unsafe { state() }.output.as_ptr()
}

/// Ancho del último PNG.
#[unsafe(no_mangle)]
pub extern "C" fn verx_out_width() -> u32 {
    // SAFETY: un solo llamador (ver `state`).
    unsafe { state() }.out_size.0
}

/// Alto del último PNG.
#[unsafe(no_mangle)]
pub extern "C" fn verx_out_height() -> u32 {
    // SAFETY: un solo llamador (ver `state`).
    unsafe { state() }.out_size.1
}

/// Puntero al motivo del último error.
#[unsafe(no_mangle)]
pub extern "C" fn verx_error() -> *const u8 {
    // SAFETY: un solo llamador (ver `state`).
    unsafe { state() }.error.as_ptr()
}

/// Longitud del motivo del último error.
#[unsafe(no_mangle)]
pub extern "C" fn verx_error_len() -> u32 {
    // SAFETY: un solo llamador (ver `state`).
    unsafe { state() }.error.len() as u32
}
