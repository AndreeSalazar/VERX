//! Encuentra y carga el runtime de `WebView2` que Windows ya trae, sin su
//! `WebView2Loader.dll` (que sería una dependencia): el registro dice dónde
//! está (`EdgeUpdate\ClientState\{F3017226-…}` → `EBWebView`) y su
//! `EmbeddedBrowserWebView.dll` exporta la función que crea el entorno.

#![allow(
    unsafe_code,
    reason = "registro de Windows y carga de la DLL del runtime por FFI"
)]

use std::ffi::c_void;
use std::mem::transmute;
use std::ptr::null_mut;

use super::com::{Com, Handler};
use super::win32::{
    GetProcAddress, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, Hresult, LoadLibraryW, RRF_RT_REG_SZ,
    RegGetValueW, from_wide, wide,
};

/// El id de cliente del runtime estable de `WebView2` en `EdgeUpdate`.
const CLIENT: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const ARCH: &str = if cfg!(target_arch = "aarch64") {
    "arm64"
} else if cfg!(target_arch = "x86") {
    "x86"
} else {
    "x64"
};

fn registry_dir(root: isize, subkey: &str) -> Option<String> {
    let subkey = wide(subkey);
    let name = wide("EBWebView");
    let mut size: u32 = 0;
    // SAFETY: primera consulta, sólo el tamaño: RegGetValueW admite `data` nulo.
    let status = unsafe {
        RegGetValueW(
            root,
            subkey.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            null_mut(),
            null_mut(),
            &raw mut size,
        )
    };
    if status != 0 || size == 0 {
        return None;
    }
    let mut buffer = vec![0u16; size as usize / 2 + 1];
    // SAFETY: `buffer` tiene al menos `size` bytes, lo que pidió la primera consulta.
    let status = unsafe {
        RegGetValueW(
            root,
            subkey.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            null_mut(),
            buffer.as_mut_ptr().cast(),
            &raw mut size,
        )
    };
    let dir = from_wide(&buffer);
    (status == 0 && !dir.is_empty()).then_some(dir)
}

/// Dónde está la DLL del runtime de `WebView2` instalado, si lo está.
pub(super) fn find_runtime() -> Option<String> {
    let keys = [
        (
            HKEY_LOCAL_MACHINE,
            format!("SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\ClientState\\{CLIENT}"),
        ),
        (
            HKEY_LOCAL_MACHINE,
            format!("SOFTWARE\\Microsoft\\EdgeUpdate\\ClientState\\{CLIENT}"),
        ),
        (
            HKEY_CURRENT_USER,
            format!("SOFTWARE\\Microsoft\\EdgeUpdate\\ClientState\\{CLIENT}"),
        ),
    ];
    keys.iter()
        .filter_map(|(root, key)| registry_dir(*root, key))
        .map(|dir| format!("{dir}\\EBWebView\\{ARCH}\\EmbeddedBrowserWebView.dll"))
        .find(|dll| std::path::Path::new(dll).exists())
}

pub(super) type CreateEnvironment =
    unsafe extern "system" fn(bool, i32, *const u16, Com, *mut Handler) -> Hresult;

/// El runtime cargado, listo para crear su entorno.
pub(super) struct Runtime {
    pub(super) create: CreateEnvironment,
}

/// Carga la DLL del runtime y busca su función de arranque.
pub(super) fn load(dll: &str) -> Result<Runtime, String> {
    let path = wide(dll);
    // SAFETY: `path` es una ruta UTF-16 terminada en 0.
    let module = unsafe { LoadLibraryW(path.as_ptr()) };
    if module.is_null() {
        return Err(format!("no pude cargar {dll}"));
    }
    // SAFETY: `module` es la DLL recién cargada y el nombre es ASCII terminado en 0.
    let function = unsafe {
        GetProcAddress(
            module,
            c"CreateWebViewEnvironmentWithOptionsInternal".as_ptr().cast(),
        )
    };
    if function.is_null() {
        return Err("el runtime de WebView2 no exporta su función de arranque".into());
    }
    // SAFETY: es la firma con la que la llaman los cargadores de WebView2
    // (bool, tipo de runtime, carpeta de datos, opciones, aviso de «listo»).
    Ok(Runtime {
        create: unsafe { transmute::<*mut c_void, CreateEnvironment>(function) },
    })
}
