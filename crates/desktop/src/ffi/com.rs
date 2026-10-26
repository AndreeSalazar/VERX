//! COM a mano: lo justo para hablar con `WebView2`. Una interfaz COM es un
//! puntero a una tabla de métodos; aquí se leen sus entradas, se llaman con su
//! firma, y se crean nuestros propios objetos (`Handler`) para que `WebView2`
//! nos avise cuando algo termina u ocurre.

#![allow(
    unsafe_code,
    reason = "COM: llamar por punteros a tablas de métodos del sistema"
)]

use std::ffi::c_void;
use std::mem::transmute;

use super::win32::{Guid, Hresult};
use super::windows::App;

/// Un puntero a un objeto COM (su primer campo es su tabla de métodos).
pub(super) type Com = *mut c_void;

pub(super) const S_OK: Hresult = 0;

/// La entrada `index` de la tabla de métodos de `obj`.
///
/// # Safety
/// `obj` es un objeto COM vivo cuya interfaz tiene al menos `index + 1` métodos.
pub(super) unsafe fn method(obj: Com, index: usize) -> *const c_void {
    // SAFETY: un objeto COM empieza por un puntero a su tabla, que tiene
    // `index + 1` entradas como mínimo (contrato de arriba).
    unsafe { *(*obj.cast::<*const *const c_void>()).add(index) }
}

/// `obj->método(arg)` para los métodos `HRESULT f(this, puntero)`.
///
/// # Safety
/// El método `index` de `obj` tiene exactamente esa firma y `arg` es lo que espera.
pub(super) unsafe fn call1(obj: Com, index: usize, arg: *mut c_void) -> Hresult {
    // SAFETY: la firma corresponde (contrato de arriba); un puntero a función
    // y uno de datos miden lo mismo.
    let f = unsafe {
        transmute::<*const c_void, unsafe extern "system" fn(Com, *mut c_void) -> Hresult>(method(obj, index))
    };
    // SAFETY: `obj` vive y `arg` es lo que espera el método.
    unsafe { f(obj, arg) }
}

/// `obj->método(a, b)` para los métodos `HRESULT f(this, puntero, puntero)`.
///
/// # Safety
/// El método `index` de `obj` tiene exactamente esa firma.
pub(super) unsafe fn call2(obj: Com, index: usize, a: *mut c_void, b: *mut c_void) -> Hresult {
    // SAFETY: la firma corresponde (contrato de arriba).
    let f = unsafe {
        transmute::<*const c_void, unsafe extern "system" fn(Com, *mut c_void, *mut c_void) -> Hresult>(
            method(obj, index),
        )
    };
    // SAFETY: `obj` vive y los argumentos son los que espera.
    unsafe { f(obj, a, b) }
}

/// `obj->método(n)` para los métodos `HRESULT f(this, entero)`, y `f(this)` con `n` ignorado.
///
/// # Safety
/// El método `index` de `obj` recibe un entero de 32 bits (o nada).
pub(super) unsafe fn call_int(obj: Com, index: usize, n: i32) -> Hresult {
    // SAFETY: la firma corresponde (contrato de arriba); un argumento de más
    // en un registro no lo lee quien no lo espera (convención x64 de Windows).
    let f = unsafe {
        transmute::<*const c_void, unsafe extern "system" fn(Com, i32) -> Hresult>(method(obj, index))
    };
    // SAFETY: `obj` vive.
    unsafe { f(obj, n) }
}

/// `AddRef` o `Release` (devuelven la cuenta, no un `HRESULT`).
///
/// # Safety
/// `obj` es un objeto COM vivo.
pub(super) unsafe fn count(obj: Com, index: usize) -> u32 {
    // SAFETY: los métodos 1 y 2 de toda interfaz COM son `ULONG f(this)`.
    let f = unsafe { transmute::<*const c_void, unsafe extern "system" fn(Com) -> u32>(method(obj, index)) };
    // SAFETY: `obj` vive.
    unsafe { f(obj) }
}

// ── Nuestros objetos COM ─────────────────────────────────────────────────

/// Un objeto que `WebView2` llama. Vive toda la ejecución (se crea unas pocas
/// veces, al arrancar), así que `AddRef`/`Release` no necesitan liberar nada.
#[repr(C)]
pub(super) struct Handler {
    pub(super) vtbl: *const c_void,
    pub(super) app: *mut App,
}

#[repr(C)]
pub(super) struct CompletedVtbl {
    pub(super) query_interface:
        unsafe extern "system" fn(*mut Handler, *const Guid, *mut *mut c_void) -> Hresult,
    pub(super) add_ref: unsafe extern "system" fn(*mut Handler) -> u32,
    pub(super) release: unsafe extern "system" fn(*mut Handler) -> u32,
    pub(super) invoke: unsafe extern "system" fn(*mut Handler, Hresult, Com) -> Hresult,
}

#[repr(C)]
pub(super) struct EventVtbl {
    pub(super) query_interface:
        unsafe extern "system" fn(*mut Handler, *const Guid, *mut *mut c_void) -> Hresult,
    pub(super) add_ref: unsafe extern "system" fn(*mut Handler) -> u32,
    pub(super) release: unsafe extern "system" fn(*mut Handler) -> u32,
    pub(super) invoke: unsafe extern "system" fn(*mut Handler, Com, Com) -> Hresult,
}

/// # Safety
/// La llama `WebView2` con un puntero de salida válido.
pub(super) unsafe extern "system" fn query_interface(
    this: *mut Handler,
    _iid: *const Guid,
    out: *mut *mut c_void,
) -> Hresult {
    // SAFETY: `out` es el puntero de salida que nos da WebView2. Cada objeto
    // nuestro implementa una sola interfaz: la que nos piden.
    unsafe { *out = this.cast() };
    S_OK
}

/// # Safety
/// Sin requisitos: no toca memoria.
pub(super) unsafe extern "system" fn add_ref(_: *mut Handler) -> u32 {
    1
}

pub(super) fn handler(vtbl: *const c_void, app: *mut App) -> *mut Handler {
    Box::into_raw(Box::new(Handler { vtbl, app }))
}
