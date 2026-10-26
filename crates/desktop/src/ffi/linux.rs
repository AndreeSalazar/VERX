//! La ventana en Linux: GTK 3 + `WebKitGTK`, cargados con `dlopen` al arrancar
//! (no se enlazan al compilar: el binario se construye en cualquier Linux y,
//! si falta `WebKitGTK`, sale con el código 3 y se abre el navegador).
//!
//! Paquetes: `libwebkit2gtk-4.1-0` (Debian/Ubuntu) o `webkit2gtk4.1` (Fedora);
//! también vale la 4.0. Tema oscuro, fondo del color del cosmos, el título de
//! la página en la ventana y la guía cuando la app no responde (guide.rs).

#![allow(
    unsafe_code,
    reason = "GTK y WebKitGTK por FFI, cargados en tiempo de ejecución"
)]

use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::mem::{size_of, transmute_copy};
use std::ptr::{null, null_mut};

use super::Failure;
use crate::guide;
use crate::options::Options;

const RTLD_NOW: c_int = 2;
/// `WEBKIT_NETWORK_ERROR_CANCELLED`: navegar a otra parte no es un fallo.
const CANCELLED: c_int = 302;

// SAFETY: firmas de dlfcn.h (libc); `dl` existe en cualquier glibc.
#[link(name = "dl")]
unsafe extern "C" {
    fn dlopen(file: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
}

type Widget = *mut c_void;

/// `GdkRGBA`: cuatro `double` de 0 a 1.
#[repr(C)]
struct Rgba {
    r: f64,
    g: f64,
    b: f64,
    a: f64,
}

/// `GError`: sólo se leen su código y su mensaje.
#[repr(C)]
struct GError {
    domain: u32,
    code: c_int,
    message: *const c_char,
}

/// Las funciones de GTK, `GObject` y `WebKitGTK` que se usan, ya cargadas.
struct Gtk {
    init: unsafe extern "C" fn(*mut c_int, *mut c_void),
    window_new: unsafe extern "C" fn(c_int) -> Widget,
    set_title: unsafe extern "C" fn(Widget, *const c_char),
    set_default_size: unsafe extern "C" fn(Widget, c_int, c_int),
    container_add: unsafe extern "C" fn(Widget, Widget),
    show_all: unsafe extern "C" fn(Widget),
    main: unsafe extern "C" fn(),
    main_quit: unsafe extern "C" fn(),
    settings_default: unsafe extern "C" fn() -> *mut c_void,
    object_set: unsafe extern "C" fn(*mut c_void, *const c_char, ...),
    signal_connect: unsafe extern "C" fn(
        *mut c_void,
        *const c_char,
        *const c_void,
        *mut c_void,
        *mut c_void,
        c_int,
    ) -> u64,
    view_new: unsafe extern "C" fn() -> Widget,
    load_uri: unsafe extern "C" fn(Widget, *const c_char),
    load_alternate_html: unsafe extern "C" fn(Widget, *const c_char, *const c_char, *const c_char),
    get_title: unsafe extern "C" fn(Widget) -> *const c_char,
    set_background: unsafe extern "C" fn(Widget, *const Rgba),
}

/// El estado de la ventana (vive toda la ejecución; lo usan las señales).
struct App {
    gtk: Gtk,
    window: Widget,
    url: CString,
    title: CString,
}

fn open(names: &[&CStr]) -> Result<*mut c_void, Failure> {
    for name in names {
        // SAFETY: nombre terminado en 0; RTLD_NOW resuelve todo al cargar.
        let lib = unsafe { dlopen(name.as_ptr(), RTLD_NOW) };
        if !lib.is_null() {
            return Ok(lib);
        }
    }
    let list: Vec<String> = names.iter().map(|n| n.to_string_lossy().into_owned()).collect();
    Err(Failure::Missing(format!(
        "no encuentro {} (instala WebKitGTK)",
        list.join(" ni ")
    )))
}

/// Una función de `lib` con el tipo `F` (un puntero a función).
fn sym<F: Copy>(lib: *mut c_void, name: &CStr) -> Result<F, Failure> {
    // SAFETY: `lib` viene de dlopen y el nombre termina en 0.
    let pointer = unsafe { dlsym(lib, name.as_ptr()) };
    if pointer.is_null() || size_of::<F>() != size_of::<*mut c_void>() {
        return Err(Failure::Missing(format!("falta {}", name.to_string_lossy())));
    }
    // SAFETY: `F` es un puntero a función del mismo tamaño, con la firma
    // publicada de esa función de GTK/WebKitGTK (ver `Gtk`).
    Ok(unsafe { transmute_copy::<*mut c_void, F>(&pointer) })
}

fn load() -> Result<Gtk, Failure> {
    let gtk = open(&[c"libgtk-3.so.0"])?;
    let gobject = open(&[c"libgobject-2.0.so.0"])?;
    let webkit = open(&[c"libwebkit2gtk-4.1.so.0", c"libwebkit2gtk-4.0.so.37"])?;
    Ok(Gtk {
        init: sym(gtk, c"gtk_init")?,
        window_new: sym(gtk, c"gtk_window_new")?,
        set_title: sym(gtk, c"gtk_window_set_title")?,
        set_default_size: sym(gtk, c"gtk_window_set_default_size")?,
        container_add: sym(gtk, c"gtk_container_add")?,
        show_all: sym(gtk, c"gtk_widget_show_all")?,
        main: sym(gtk, c"gtk_main")?,
        main_quit: sym(gtk, c"gtk_main_quit")?,
        settings_default: sym(gtk, c"gtk_settings_get_default")?,
        object_set: sym(gobject, c"g_object_set")?,
        signal_connect: sym(gobject, c"g_signal_connect_data")?,
        view_new: sym(webkit, c"webkit_web_view_new")?,
        load_uri: sym(webkit, c"webkit_web_view_load_uri")?,
        load_alternate_html: sym(webkit, c"webkit_web_view_load_alternate_html")?,
        get_title: sym(webkit, c"webkit_web_view_get_title")?,
        set_background: sym(webkit, c"webkit_web_view_set_background_color")?,
    })
}

/// # Safety
/// La llama GTK con nuestro `App` como `data`.
unsafe extern "C" fn on_destroy(_: Widget, data: *mut c_void) {
    // SAFETY: `data` es el App de `run`, que vive siempre.
    let app = unsafe { &*data.cast::<App>() };
    // SAFETY: estamos en el hilo de GTK.
    unsafe { (app.gtk.main_quit)() };
}

/// # Safety
/// La llama `WebKitGTK` (`load-failed`) con la vista, el error y nuestro `App`.
unsafe extern "C" fn on_load_failed(
    view: Widget,
    _event: c_int,
    _uri: *const c_char,
    error: *const GError,
    data: *mut c_void,
) -> c_int {
    // SAFETY: WebKitGTK da un GError válido durante la señal.
    if !error.is_null() && unsafe { (*error).code } == CANCELLED {
        return 0;
    }
    // SAFETY: `data` es el App de `run`, que vive siempre.
    let app = unsafe { &*data.cast::<App>() };
    let url = app.url.to_string_lossy();
    let Ok(html) = CString::new(guide::page(&url, guide::reason(6))) else {
        return 0;
    };
    // SAFETY: vista viva; HTML y URLs terminados en 0. La página guía «es» la
    // URL que falló, así al reintentar vuelve a ella.
    unsafe { (app.gtk.load_alternate_html)(view, html.as_ptr(), app.url.as_ptr(), null()) };
    1
}

/// # Safety
/// La llama `GObject` (`notify::title`) con la vista y nuestro `App`.
unsafe extern "C" fn on_title(view: Widget, _pspec: *mut c_void, data: *mut c_void) {
    // SAFETY: `data` es el App de `run`, que vive siempre.
    let app = unsafe { &*data.cast::<App>() };
    // SAFETY: vista viva; el título (o nulo) es de WebKitGTK y no se libera.
    let title = unsafe { (app.gtk.get_title)(view) };
    let shown = if title.is_null() {
        app.title.as_ptr()
    } else {
        title
    };
    // SAFETY: ventana viva y texto terminado en 0.
    unsafe { (app.gtk.set_title)(app.window, shown) };
}

/// Abre la ventana con la app y espera a que se cierre.
pub(crate) fn run(options: &Options) -> Result<(), Failure> {
    let gtk = load()?;
    let url = CString::new(options.url.as_str())
        .map_err(|_| Failure::Broken("la URL lleva un carácter nulo".into()))?;
    let title = CString::new(options.title.as_str())
        .map_err(|_| Failure::Broken("el título lleva un carácter nulo".into()))?;
    // SAFETY: gtk_init admite argc/argv nulos; después, todo en este hilo.
    unsafe {
        (gtk.init)(null_mut(), null_mut());
        (gtk.object_set)(
            (gtk.settings_default)(),
            c"gtk-application-prefer-dark-theme".as_ptr(),
            c_int::from(true),
            null::<c_void>(),
        );
    }
    // SAFETY: GTK ya está iniciado; 0 = GTK_WINDOW_TOPLEVEL.
    let window = unsafe { (gtk.window_new)(0) };
    // SAFETY: igual que arriba.
    let view = unsafe { (gtk.view_new)() };
    if window.is_null() || view.is_null() {
        return Err(Failure::Broken("GTK no creó la ventana".into()));
    }
    let app = Box::into_raw(Box::new(App {
        gtk,
        window,
        url,
        title,
    }));
    // SAFETY: `app` vive siempre (nunca se libera); ventana y vista, vivas.
    unsafe {
        let a = &*app;
        (a.gtk.set_title)(window, a.title.as_ptr());
        (a.gtk.set_default_size)(window, options.width, options.height);
        (a.gtk.set_background)(
            view,
            &Rgba {
                r: 4.0 / 255.0,
                g: 4.0 / 255.0,
                b: 10.0 / 255.0,
                a: 1.0,
            },
        );
        (a.gtk.container_add)(window, view);
        (a.gtk.signal_connect)(
            window,
            c"destroy".as_ptr(),
            on_destroy as *const c_void,
            app.cast(),
            null_mut(),
            0,
        );
        (a.gtk.signal_connect)(
            view,
            c"load-failed".as_ptr(),
            on_load_failed as *const c_void,
            app.cast(),
            null_mut(),
            0,
        );
        (a.gtk.signal_connect)(
            view,
            c"notify::title".as_ptr(),
            on_title as *const c_void,
            app.cast(),
            null_mut(),
            0,
        );
        (a.gtk.load_uri)(view, a.url.as_ptr());
        (a.gtk.show_all)(window);
        (a.gtk.main)();
    }
    Ok(())
}
