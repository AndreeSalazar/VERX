//! # verx-desktop
//!
//! VERX Desktop en una ventana nativa: el motor web del sistema (`WebView2` en
//! Windows, `WebKitGTK` en Linux) con la app que sirve Bun en `127.0.0.1`. Sin
//! Chromium propio y sin dependencias: unos cientos de KB.
//!
//! ```text
//! verx-desktop --url http://127.0.0.1:4123/_verx/desktop?token=… --title VERX --profile <carpeta>
//! ```
//!
//! Códigos de salida: 0 al cerrar la ventana; 2 si los argumentos están mal;
//! 3 si falta el motor web del sistema (quien la lanzó abre otra ventana); 1
//! con cualquier otro fallo. Si la app deja de responder, la ventana enseña
//! una página que lo explica y vuelve sola cuando responde (guide.rs).

mod ffi;
#[cfg_attr(
    not(any(windows, target_os = "linux")),
    allow(dead_code, reason = "sin ventana nativa, no hay guía que enseñar")
)]
mod guide;
mod options;

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let options = match options::parse(&args) {
        Ok(options) => options,
        Err(why) => {
            eprintln!("verx-desktop: {why}");
            return ExitCode::from(2);
        }
    };
    match ffi::run(&options) {
        Ok(()) => ExitCode::SUCCESS,
        Err(ffi::Failure::Missing(why)) => {
            eprintln!("verx-desktop: {why}");
            ExitCode::from(3)
        }
        Err(ffi::Failure::Broken(why)) => {
            eprintln!("verx-desktop: {why}");
            ExitCode::from(1)
        }
    }
}
