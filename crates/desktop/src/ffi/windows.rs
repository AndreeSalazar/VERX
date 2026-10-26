//! La ventana en Windows: Win32 puro (win32.rs) con `WebView2` dentro
//! (webview2.rs). Nítida en cada monitor, barra de título oscura, centrada, y
//! el fondo del color del cosmos para que no destelle en blanco al abrir.

#![allow(unsafe_code, reason = "Win32: crear la ventana y su bucle de mensajes")]

use std::ptr::{null, null_mut};

use super::Failure;
use super::com::Com;
use super::win32::{
    COINIT_APARTMENTTHREADED, CoInitializeEx, CreateSolidBrush, CreateWindowExW, DPI_PER_MONITOR_V2,
    DWMWA_USE_IMMERSIVE_DARK_MODE, DefWindowProcW, DispatchMessageW, DwmSetWindowAttribute, GWLP_USERDATA,
    GetDpiForSystem, GetMessageW, GetModuleHandleW, GetSystemMetrics, GetWindowLongPtrW, Hwnd, IDC_ARROW,
    LoadCursorW, Lparam, Lresult, Msg, Point, PostQuitMessage, RegisterClassExW, SM_CXSCREEN, SM_CYSCREEN,
    SW_SHOW, SetProcessDpiAwarenessContext, SetWindowLongPtrW, ShowWindow, TranslateMessage, WM_ACTIVATE,
    WM_DESTROY, WM_SIZE, WS_OVERLAPPEDWINDOW, WndClassExW, Wparam, wide,
};
use super::{loader, webview2};
use crate::options::Options;

/// El color del cosmos (#04040a) como COLORREF (0x00BBGGRR).
const BACKGROUND: u32 = 0x000A_0404;

/// El estado de la ventana: lo comparten el bucle de mensajes y los avisos
/// de `WebView2`, siempre desde el mismo hilo.
pub(super) struct App {
    pub(super) hwnd: Hwnd,
    pub(super) controller: Com,
    pub(super) webview: Com,
    pub(super) url: String,
    pub(super) title: String,
    /// La carpeta de datos del `WebView`, en UTF-16 (vive tanto como la app).
    pub(super) profile: Option<Vec<u16>>,
    /// Si `WebView2` no pudo arrancar: por qué.
    pub(super) failed: Option<String>,
}

/// # Safety
/// La llama Windows con una ventana viva de nuestra clase.
unsafe extern "system" fn window_proc(hwnd: Hwnd, msg: u32, wparam: Wparam, lparam: Lparam) -> Lresult {
    // SAFETY: GWLP_USERDATA guarda el App de esta ventana (o 0 antes de guardarlo).
    let app = unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } as *mut App;
    match msg {
        // SAFETY: `app` vive siempre (Box::into_raw en `run`) y estamos en su hilo.
        WM_SIZE if !app.is_null() => unsafe { webview2::resize(app) },
        // SAFETY: igual que arriba.
        WM_ACTIVATE if !app.is_null() => unsafe { webview2::focus(app) },
        WM_DESTROY => {
            // SAFETY: sin punteros; termina el bucle de mensajes.
            unsafe { PostQuitMessage(0) };
            return 0;
        }
        _ => {}
    }
    // SAFETY: lo que no tratamos lo trata Windows, con los mismos argumentos.
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// Abre la ventana con la app y espera a que se cierre.
pub(crate) fn run(options: &Options) -> Result<(), Failure> {
    let dll = loader::find_runtime()
        .ok_or_else(|| Failure::Missing("WebView2 no está instalado en este Windows".into()))?;
    let runtime = loader::load(&dll).map_err(Failure::Missing)?;

    // SAFETY: llamadas de arranque del proceso, sin punteros que validar.
    unsafe {
        SetProcessDpiAwarenessContext(DPI_PER_MONITOR_V2);
        CoInitializeEx(null_mut(), COINIT_APARTMENTTHREADED);
    }
    let class = wide("VerxDesktop");
    let title = wide(&options.title);
    // SAFETY: nulo = el propio ejecutable.
    let instance = unsafe { GetModuleHandleW(null()) };
    let window_class = WndClassExW {
        cb_size: u32::try_from(size_of::<WndClassExW>()).unwrap_or(80),
        style: 0,
        wnd_proc: Some(window_proc),
        cls_extra: 0,
        wnd_extra: 0,
        instance,
        icon: null_mut(),
        // SAFETY: cursor del sistema (MAKEINTRESOURCE) y un pincel de color fijo.
        cursor: unsafe { LoadCursorW(null_mut(), IDC_ARROW as *const u16) },
        // SAFETY: igual que arriba.
        background: unsafe { CreateSolidBrush(BACKGROUND) },
        menu_name: null(),
        class_name: class.as_ptr(),
        icon_sm: null_mut(),
    };
    // SAFETY: `window_class` y sus cadenas viven durante la llamada.
    if unsafe { RegisterClassExW(&raw const window_class) } == 0 {
        return Err(Failure::Broken("no pude registrar la clase de ventana".into()));
    }

    // Tamaño en píxeles reales del monitor, y centrada.
    // SAFETY: consultas sin punteros.
    let (dpi, screen_w, screen_h) = unsafe {
        (
            GetDpiForSystem().max(96),
            GetSystemMetrics(SM_CXSCREEN),
            GetSystemMetrics(SM_CYSCREEN),
        )
    };
    let scale = |v: i32| i32::try_from(i64::from(v) * i64::from(dpi) / 96).unwrap_or(v);
    let (width, height) = (
        scale(options.width).min(screen_w),
        scale(options.height).min(screen_h),
    );
    // SAFETY: clase registrada arriba; título terminado en 0; sin padre ni menú.
    let hwnd = unsafe {
        CreateWindowExW(
            0,
            class.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPEDWINDOW,
            ((screen_w - width) / 2).max(0),
            ((screen_h - height) / 2).max(0),
            width,
            height,
            null_mut(),
            null_mut(),
            instance,
            null_mut(),
        )
    };
    if hwnd.is_null() {
        return Err(Failure::Broken("no pude crear la ventana".into()));
    }
    let dark: i32 = 1;
    // SAFETY: ventana viva; el valor es un BOOL de 4 bytes que vive durante la llamada.
    unsafe { DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, (&raw const dark).cast(), 4) };

    let app = Box::into_raw(Box::new(App {
        hwnd,
        controller: null_mut(),
        webview: null_mut(),
        url: options.url.clone(),
        title: options.title.clone(),
        profile: options.profile.as_deref().map(wide),
        failed: None,
    }));
    // SAFETY: ventana viva; `app` vive hasta el final del programa (nunca se libera).
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, app as isize);
        ShowWindow(hwnd, SW_SHOW);
    }
    // SAFETY: `app` vive siempre y sólo lo usa este hilo.
    let hr = unsafe { webview2::start(&runtime, app) };
    if hr < 0 {
        return Err(Failure::Missing(format!("WebView2 no arrancó (0x{hr:08x})")));
    }

    let mut msg = Msg {
        hwnd: null_mut(),
        message: 0,
        wparam: 0,
        lparam: 0,
        time: 0,
        pt: Point::default(),
        private: 0,
    };
    // SAFETY: el bucle de mensajes de siempre, con un Msg nuestro.
    while unsafe { GetMessageW(&raw mut msg, null_mut(), 0, 0) } > 0 {
        // SAFETY: `msg` lo acaba de llenar GetMessageW.
        unsafe {
            TranslateMessage(&raw const msg);
            DispatchMessageW(&raw const msg);
        }
    }
    // SAFETY: `app` vive; ya no llegan más mensajes.
    unsafe { webview2::close(app) };
    // SAFETY: `app` vive siempre.
    match unsafe { (*app).failed.take() } {
        // Si WebView2 no pudo arrancar, quien abrió la ventana abre otra (Edge).
        Some(why) => Err(Failure::Missing(why)),
        None => Ok(()),
    }
}
