//! Win32 a mano: sólo lo que usa la ventana de VERX Desktop, declarado tal
//! cual lo documenta Microsoft (sin crates: cero dependencias). `raw-dylib`
//! enlaza con las DLL del sistema sin necesitar las .lib del SDK.
//!
//! Aquí sólo hay declaraciones y tipos; quien las llama (windows.rs,
//! webview2.rs) justifica cada llamada con su `// SAFETY:`.

#![allow(
    unsafe_code,
    reason = "declaraciones FFI de Win32: la única forma de hablar con el sistema"
)]
#![allow(
    non_snake_case,
    reason = "los nombres de Win32 se escriben como en su documentación"
)]

use std::ffi::c_void;

pub(super) type Hwnd = *mut c_void;
pub(super) type Hinstance = *mut c_void;
pub(super) type Wparam = usize;
pub(super) type Lparam = isize;
pub(super) type Lresult = isize;
pub(super) type Hresult = i32;
pub(super) type WndProc = unsafe extern "system" fn(Hwnd, u32, Wparam, Lparam) -> Lresult;

#[repr(C)]
pub(super) struct WndClassExW {
    pub(super) cb_size: u32,
    pub(super) style: u32,
    pub(super) wnd_proc: Option<WndProc>,
    pub(super) cls_extra: i32,
    pub(super) wnd_extra: i32,
    pub(super) instance: Hinstance,
    pub(super) icon: *mut c_void,
    pub(super) cursor: *mut c_void,
    pub(super) background: *mut c_void,
    pub(super) menu_name: *const u16,
    pub(super) class_name: *const u16,
    pub(super) icon_sm: *mut c_void,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub(super) struct Point {
    pub(super) x: i32,
    pub(super) y: i32,
}

#[repr(C)]
pub(super) struct Msg {
    pub(super) hwnd: Hwnd,
    pub(super) message: u32,
    pub(super) wparam: Wparam,
    pub(super) lparam: Lparam,
    pub(super) time: u32,
    pub(super) pt: Point,
    pub(super) private: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Debug)]
pub(super) struct Rect {
    pub(super) left: i32,
    pub(super) top: i32,
    pub(super) right: i32,
    pub(super) bottom: i32,
}

#[repr(C)]
pub(super) struct Guid {
    pub(super) data1: u32,
    pub(super) data2: u16,
    pub(super) data3: u16,
    pub(super) data4: [u8; 8],
}

pub(super) const WS_OVERLAPPEDWINDOW: u32 = 0x00CF_0000;
pub(super) const SW_SHOW: i32 = 5;
pub(super) const WM_DESTROY: u32 = 0x0002;
pub(super) const WM_SIZE: u32 = 0x0005;
pub(super) const WM_ACTIVATE: u32 = 0x0006;
pub(super) const GWLP_USERDATA: i32 = -21;
pub(super) const IDC_ARROW: usize = 32512;
pub(super) const COINIT_APARTMENTTHREADED: u32 = 0x2;
pub(super) const HKEY_CURRENT_USER: isize = 0x8000_0001_u32.cast_signed() as isize;
pub(super) const HKEY_LOCAL_MACHINE: isize = 0x8000_0002_u32.cast_signed() as isize;
pub(super) const RRF_RT_REG_SZ: u32 = 0x0000_0002;
pub(super) const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
pub(super) const SM_CXSCREEN: i32 = 0;
pub(super) const SM_CYSCREEN: i32 = 1;
/// `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`: nítido en cada monitor.
pub(super) const DPI_PER_MONITOR_V2: isize = -4;

// SAFETY: son las firmas publicadas de user32.dll (documentación de Win32);
// los tipos de Rust tienen el mismo tamaño y orden que los de C.
#[link(name = "user32", kind = "raw-dylib")]
unsafe extern "system" {
    pub(super) fn RegisterClassExW(class: *const WndClassExW) -> u16;
    pub(super) fn CreateWindowExW(
        ex_style: u32,
        class: *const u16,
        title: *const u16,
        style: u32,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        parent: Hwnd,
        menu: *mut c_void,
        instance: Hinstance,
        param: *mut c_void,
    ) -> Hwnd;
    pub(super) fn DefWindowProcW(hwnd: Hwnd, msg: u32, wparam: Wparam, lparam: Lparam) -> Lresult;
    pub(super) fn GetMessageW(msg: *mut Msg, hwnd: Hwnd, min: u32, max: u32) -> i32;
    pub(super) fn TranslateMessage(msg: *const Msg) -> i32;
    pub(super) fn DispatchMessageW(msg: *const Msg) -> Lresult;
    pub(super) fn PostQuitMessage(code: i32);
    pub(super) fn ShowWindow(hwnd: Hwnd, cmd: i32) -> i32;
    pub(super) fn GetClientRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
    pub(super) fn SetWindowTextW(hwnd: Hwnd, text: *const u16) -> i32;
    pub(super) fn LoadCursorW(instance: Hinstance, name: *const u16) -> *mut c_void;
    pub(super) fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
    pub(super) fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
    pub(super) fn SetProcessDpiAwarenessContext(context: isize) -> i32;
    pub(super) fn GetDpiForSystem() -> u32;
    pub(super) fn GetSystemMetrics(index: i32) -> i32;
}

// SAFETY: firmas publicadas de kernel32.dll.
#[link(name = "kernel32", kind = "raw-dylib")]
unsafe extern "system" {
    pub(super) fn GetModuleHandleW(name: *const u16) -> Hinstance;
    pub(super) fn LoadLibraryW(name: *const u16) -> *mut c_void;
    pub(super) fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
}

// SAFETY: firmas publicadas de ole32.dll (COM).
#[link(name = "ole32", kind = "raw-dylib")]
unsafe extern "system" {
    pub(super) fn CoInitializeEx(reserved: *mut c_void, flags: u32) -> Hresult;
    pub(super) fn CoTaskMemFree(memory: *mut c_void);
}

// SAFETY: firma publicada de advapi32.dll (registro).
#[link(name = "advapi32", kind = "raw-dylib")]
unsafe extern "system" {
    pub(super) fn RegGetValueW(
        key: isize,
        subkey: *const u16,
        value: *const u16,
        flags: u32,
        kind: *mut u32,
        data: *mut c_void,
        size: *mut u32,
    ) -> i32;
}

// SAFETY: firma publicada de dwmapi.dll (barra de título oscura).
#[link(name = "dwmapi", kind = "raw-dylib")]
unsafe extern "system" {
    pub(super) fn DwmSetWindowAttribute(
        hwnd: Hwnd,
        attribute: u32,
        value: *const c_void,
        size: u32,
    ) -> Hresult;
}

// SAFETY: firma publicada de gdi32.dll (el fondo de la ventana).
#[link(name = "gdi32", kind = "raw-dylib")]
unsafe extern "system" {
    pub(super) fn CreateSolidBrush(color: u32) -> *mut c_void;
}

/// Texto de Rust → UTF-16 terminado en 0, como lo esperan las funciones `…W`.
pub(super) fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// UTF-16 terminado en 0 (de Windows) → texto de Rust.
pub(super) fn from_wide(s: &[u16]) -> String {
    let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    String::from_utf16_lossy(&s[..end])
}
