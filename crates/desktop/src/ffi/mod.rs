//! Lo único de VERX Desktop que habla con el sistema, y el único sitio del
//! crate con `unsafe` (lo vigilan las reglas `unsafe-acotado` y `ffi-aislada`
//! del guardián: cada `unsafe` con su `// SAFETY:`, y las declaraciones FFI
//! sólo aquí). Fuera de esta carpeta, todo es Rust seguro.
//!
//! · Windows: Win32 + `WebView2` (el Edge que trae el sistema), sin su SDK.
//! · Linux: GTK 3 + `WebKitGTK`, cargados al arrancar (sin enlazarlos al compilar).

#[cfg(windows)]
mod com;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
mod loader;
#[cfg(windows)]
mod webview2;
#[cfg(windows)]
mod win32;
#[cfg(windows)]
mod windows;

/// Por qué no se pudo abrir (o mantener) la ventana.
#[derive(Debug)]
pub(crate) enum Failure {
    /// Falta el motor web del sistema: quien lanzó la ventana abre otra (Edge
    /// o el navegador). Sale con el código 3.
    Missing(String),
    /// Otro fallo: sale con el código 1.
    Broken(String),
}

#[cfg(target_os = "linux")]
pub(crate) use linux::run;
#[cfg(windows)]
pub(crate) use windows::run;

/// Otros sistemas (macOS…): sin ventana nativa; se abre la de siempre.
#[cfg(not(any(windows, target_os = "linux")))]
pub(crate) fn run(_: &crate::options::Options) -> Result<(), Failure> {
    Err(Failure::Missing("sin ventana nativa en este sistema".into()))
}
