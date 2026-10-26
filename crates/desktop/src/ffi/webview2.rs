//! `WebView2` a mano, sin su SDK ni su cargador (cero dependencias):
//!
//! 1. El registro dice dónde está el runtime que Windows ya trae instalado
//!    (`EdgeUpdate\ClientState\{F3017226-…}` → `EBWebView`).
//! 2. Su `EmbeddedBrowserWebView.dll` exporta
//!    `CreateWebViewEnvironmentWithOptionsInternal`: lo mismo que hace por
//!    dentro el `WebView2Loader.dll` del SDK.
//! 3. Lo demás es COM: interfaces que son una tabla de métodos, y objetos
//!    nuestros (`Handler`) que `WebView2` llama cuando algo termina u ocurre.
//!
//! Los números de método son su posición en la tabla de cada interfaz, en el
//! orden de `WebView2.idl` (0–2 son `QueryInterface`, `AddRef` y `Release`).

#![allow(unsafe_code, reason = "COM y WebView2: hablar con el sistema por FFI")]

use std::ffi::c_void;
use std::mem::transmute;

use super::com::{
    Com, CompletedVtbl, EventVtbl, Handler, S_OK, add_ref, call_int, call1, call2, count, handler, method,
    query_interface,
};
use std::ptr::{null, null_mut};

use super::loader::Runtime;
use super::win32::{
    CoTaskMemFree, GetClientRect, Guid, Hresult, PostQuitMessage, Rect, SetWindowTextW, wide,
};
use super::windows::App;
use crate::guide;

/// `COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED`: navegar a otra parte
/// antes de terminar no es un fallo.
const CANCELED: i32 = 14;
/// `ICoreWebView2Controller2`: el que permite el fondo oscuro (sin destello blanco).
static IID_CONTROLLER2: Guid = Guid {
    data1: 0xc979_903e,
    data2: 0xd4ca,
    data3: 0x4228,
    data4: [0x92, 0xeb, 0x47, 0xee, 0x3f, 0xa9, 0x6e, 0xab],
};

mod slot {
    pub(super) const ADD_REF: usize = 1;
    pub(super) const RELEASE: usize = 2;
    pub(super) const ENV_CREATE_CONTROLLER: usize = 3;
    pub(super) const CTRL_PUT_BOUNDS: usize = 6;
    pub(super) const CTRL_MOVE_FOCUS: usize = 12;
    pub(super) const CTRL_CLOSE: usize = 24;
    pub(super) const CTRL_GET_WEBVIEW: usize = 25;
    pub(super) const CTRL2_PUT_BACKGROUND: usize = 27;
    pub(super) const WV_NAVIGATE: usize = 5;
    pub(super) const WV_NAVIGATE_TO_STRING: usize = 6;
    pub(super) const WV_ADD_NAVIGATION_COMPLETED: usize = 15;
    pub(super) const WV_ADD_TITLE_CHANGED: usize = 46;
    pub(super) const WV_GET_TITLE: usize = 48;
    pub(super) const NAV_IS_SUCCESS: usize = 3;
    pub(super) const NAV_ERROR_STATUS: usize = 4;
}

/// `COREWEBVIEW2_COLOR`: cuatro bytes, en este orden.
#[repr(C)]
#[derive(Clone, Copy)]
struct Color {
    a: u8,
    r: u8,
    g: u8,
    b: u8,
}

static ENV_DONE: CompletedVtbl = CompletedVtbl {
    query_interface,
    add_ref,
    release: add_ref,
    invoke: environment_created,
};
static CONTROLLER_DONE: CompletedVtbl = CompletedVtbl {
    query_interface,
    add_ref,
    release: add_ref,
    invoke: controller_created,
};
static NAVIGATED: EventVtbl = EventVtbl {
    query_interface,
    add_ref,
    release: add_ref,
    invoke: navigation_completed,
};
static TITLE_CHANGED: EventVtbl = EventVtbl {
    query_interface,
    add_ref,
    release: add_ref,
    invoke: title_changed,
};

/// Pide el entorno de `WebView2`; el resto sigue en los avisos de más abajo.
///
/// # Safety
/// `app` vive hasta que termina el programa y sólo se usa desde este hilo.
pub(super) unsafe fn start(runtime: &Runtime, app: *mut App) -> Hresult {
    let done = handler((&raw const ENV_DONE).cast(), app);
    // SAFETY: `app` vive (contrato de arriba); su carpeta de datos vive con él.
    let profile = unsafe { (*app).profile.as_ref().map_or(null(), Vec::as_ptr) };
    // SAFETY: runtime instalado (0), sin opciones (nulo), y un aviso que vive siempre.
    unsafe { (runtime.create)(true, 0, profile, null_mut(), done) }
}

/// Si algo falla al arrancar: se cierra, y quien lanzó la ventana abre otra.
fn give_up(app: *mut App, why: &str) {
    eprintln!("verx-desktop: {why}");
    // SAFETY: `app` vive siempre (lo crea windows.rs con Box::into_raw).
    unsafe { (*app).failed = Some(why.to_string()) };
    // SAFETY: sin punteros; termina el bucle de mensajes.
    unsafe { PostQuitMessage(0) };
}

/// # Safety
/// La llama `WebView2` con `this` (un `Handler` nuestro) y el entorno, o un error.
unsafe extern "system" fn environment_created(this: *mut Handler, result: Hresult, env: Com) -> Hresult {
    // SAFETY: `this` es un Handler creado por `handler()`, que vive siempre.
    let app = unsafe { (*this).app };
    if result < 0 || env.is_null() {
        give_up(
            app,
            &format!("WebView2 no pudo crear su entorno (0x{result:08x})"),
        );
        return S_OK;
    }
    let done = handler((&raw const CONTROLLER_DONE).cast(), app);
    // SAFETY: `env` es un ICoreWebView2Environment vivo durante este aviso; su
    // método 3 es CreateCoreWebView2Controller(HWND, aviso).
    let hr = unsafe { call2(env, slot::ENV_CREATE_CONTROLLER, (*app).hwnd, done.cast()) };
    if hr < 0 {
        give_up(app, &format!("WebView2 no pudo crear la vista (0x{hr:08x})"));
    }
    S_OK
}

/// # Safety
/// La llama `WebView2` con `this` (un `Handler` nuestro) y el controlador, o un error.
unsafe extern "system" fn controller_created(
    this: *mut Handler,
    result: Hresult,
    controller: Com,
) -> Hresult {
    // SAFETY: `this` es un Handler creado por `handler()`, que vive siempre.
    let app = unsafe { (*this).app };
    if result < 0 || controller.is_null() {
        give_up(app, &format!("WebView2 no pudo crear la vista (0x{result:08x})"));
        return S_OK;
    }
    // SAFETY: `controller` vive durante el aviso; AddRef lo mantiene vivo después.
    unsafe { count(controller, slot::ADD_REF) };
    // SAFETY: `app` vive siempre y sólo se toca desde este hilo.
    unsafe { (*app).controller = controller };
    dark_background(controller);
    // SAFETY: `app` tiene ya su controlador.
    unsafe { resize(app) };
    let mut webview: Com = null_mut();
    // SAFETY: método 25 del controlador: get_CoreWebView2(ICoreWebView2**).
    unsafe { call1(controller, slot::CTRL_GET_WEBVIEW, (&raw mut webview).cast()) };
    if webview.is_null() {
        give_up(app, "WebView2 no dio su vista");
        return S_OK;
    }
    // SAFETY: `app` vive siempre.
    unsafe { (*app).webview = webview };
    let mut token = 0i64;
    // SAFETY: métodos 15 y 46: add_NavigationCompleted / add_DocumentTitleChanged
    // (aviso, *EventRegistrationToken); los avisos viven siempre.
    unsafe {
        call2(
            webview,
            slot::WV_ADD_NAVIGATION_COMPLETED,
            handler((&raw const NAVIGATED).cast(), app).cast(),
            (&raw mut token).cast(),
        );
        call2(
            webview,
            slot::WV_ADD_TITLE_CHANGED,
            handler((&raw const TITLE_CHANGED).cast(), app).cast(),
            (&raw mut token).cast(),
        );
    }
    // SAFETY: `app` vive siempre.
    let url = wide(unsafe { &(*app).url });
    // SAFETY: método 5: Navigate(LPCWSTR); `url` vive durante la llamada.
    unsafe { call1(webview, slot::WV_NAVIGATE, url.as_ptr().cast_mut().cast()) };
    S_OK
}

/// Fondo oscuro mientras carga: sin destello blanco al abrir.
fn dark_background(controller: Com) {
    let mut second: Com = null_mut();
    // SAFETY: QueryInterface (método 0) con un IID y un puntero de salida válidos.
    let hr = unsafe {
        call2(
            controller,
            0,
            (&raw const IID_CONTROLLER2).cast_mut().cast(),
            (&raw mut second).cast(),
        )
    };
    if hr < 0 || second.is_null() {
        return; // un runtime antiguo: sin fondo propio, nada más
    }
    // SAFETY: método 27 de ICoreWebView2Controller2: put_DefaultBackgroundColor(COREWEBVIEW2_COLOR),
    // un struct de 4 bytes que va por valor.
    unsafe {
        let f = transmute::<*const c_void, unsafe extern "system" fn(Com, Color) -> Hresult>(method(
            second,
            slot::CTRL2_PUT_BACKGROUND,
        ));
        f(
            second,
            Color {
                a: 255,
                r: 4,
                g: 4,
                b: 10,
            },
        );
        count(second, slot::RELEASE);
    }
}

/// # Safety
/// La llama `WebView2`: `sender` es la vista y `args`, los datos de la navegación.
unsafe extern "system" fn navigation_completed(this: *mut Handler, sender: Com, args: Com) -> Hresult {
    let mut ok = 1i32;
    let mut status = 0i32;
    // SAFETY: métodos 3 y 4 de los datos: get_IsSuccess(BOOL*) y get_WebErrorStatus(int*).
    unsafe {
        call1(args, slot::NAV_IS_SUCCESS, (&raw mut ok).cast());
        call1(args, slot::NAV_ERROR_STATUS, (&raw mut status).cast());
    }
    if ok != 0 || status == CANCELED {
        return S_OK;
    }
    // La app no responde: se enseña la guía, que vuelve sola cuando responda.
    // SAFETY: `this` es un Handler nuestro y su `app` vive siempre.
    let page = guide::page(unsafe { &(*(*this).app).url }, guide::reason(status));
    let html = wide(&page);
    // SAFETY: método 6: NavigateToString(LPCWSTR); `html` vive durante la llamada.
    unsafe {
        call1(
            sender,
            slot::WV_NAVIGATE_TO_STRING,
            html.as_ptr().cast_mut().cast(),
        )
    };
    S_OK
}

/// # Safety
/// La llama `WebView2` con la vista cuyo título cambió.
unsafe extern "system" fn title_changed(this: *mut Handler, sender: Com, _args: Com) -> Hresult {
    let mut raw: *mut u16 = null_mut();
    // SAFETY: método 48: get_DocumentTitle(LPWSTR*); la cadena es nuestra y se libera abajo.
    unsafe { call1(sender, slot::WV_GET_TITLE, (&raw mut raw).cast()) };
    if raw.is_null() {
        return S_OK;
    }
    let mut len = 0;
    // SAFETY: WebView2 devuelve una cadena UTF-16 terminada en 0.
    while unsafe { *raw.add(len) } != 0 {
        len += 1;
    }
    // SAFETY: `len` caracteres válidos, contados arriba.
    let title = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(raw, len) });
    // SAFETY: memoria que reservó WebView2 con CoTaskMemAlloc: se libera con CoTaskMemFree.
    unsafe { CoTaskMemFree(raw.cast()) };
    // SAFETY: `this` es un Handler nuestro y su `app` vive siempre.
    let app = unsafe { &*(*this).app };
    let shown = if title.trim().is_empty() {
        app.title.clone()
    } else {
        title
    };
    let text = wide(&shown);
    // SAFETY: ventana viva y texto terminado en 0.
    unsafe { SetWindowTextW(app.hwnd, text.as_ptr()) };
    S_OK
}

/// La vista ocupa toda la ventana.
///
/// # Safety
/// `app` vive y sólo se usa desde este hilo.
pub(super) unsafe fn resize(app: *mut App) {
    // SAFETY: `app` vive (contrato de arriba).
    let app = unsafe { &*app };
    if app.controller.is_null() {
        return;
    }
    let mut rect = Rect::default();
    // SAFETY: ventana viva y un Rect donde escribir.
    unsafe { GetClientRect(app.hwnd, &raw mut rect) };
    // SAFETY: método 6 del controlador: put_Bounds(RECT), por valor.
    unsafe {
        let f = transmute::<*const c_void, unsafe extern "system" fn(Com, Rect) -> Hresult>(method(
            app.controller,
            slot::CTRL_PUT_BOUNDS,
        ));
        f(app.controller, rect);
    }
}

/// El teclado va a la vista al activar la ventana.
///
/// # Safety
/// `app` vive y sólo se usa desde este hilo.
pub(super) unsafe fn focus(app: *mut App) {
    // SAFETY: `app` vive (contrato de arriba).
    let controller = unsafe { (*app).controller };
    if !controller.is_null() {
        // SAFETY: método 12: MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON); 0 = programático.
        unsafe { call_int(controller, slot::CTRL_MOVE_FOCUS, 0) };
    }
}

/// Cierra la vista al salir.
///
/// # Safety
/// `app` vive y sólo se usa desde este hilo.
pub(super) unsafe fn close(app: *mut App) {
    // SAFETY: `app` vive (contrato de arriba).
    let controller = unsafe { (*app).controller };
    if !controller.is_null() {
        // SAFETY: método 24: Close(); después, Release del AddRef de controller_created.
        unsafe {
            call_int(controller, slot::CTRL_CLOSE, 0);
            count(controller, slot::RELEASE);
        }
    }
}
