//! Los guardianes del `unsafe`. Sólo hay dos sitios donde se permite:
//!
//! · `crates/<puente>/src/abi.rs`: el contrato de cada `.wasm` con JavaScript;
//! · `crates/desktop/src/ffi/`: lo que VERX Desktop habla con el sistema
//!   (`Win32` y `WebView2` en Windows, `GTK` y `WebKitGTK` en Linux).
//!
//! Y en los dos, dos reglas más (`ffi-aislada`):
//!
//! · cada `unsafe` de verdad (un bloque, una `unsafe fn`, un `unsafe impl`, un
//!   bloque `unsafe extern`) lleva su `// SAFETY:` en la misma línea o en las
//!   tres de encima (los atributos no cuentan): por qué es seguro, escrito,
//!   para quien lo lea a las 3 AM. Una `unsafe fn` vale también con su
//!   sección `/// # Safety`, la forma de siempre en Rust;
//! · las declaraciones que hablan con el sistema (`extern "…" { … }`,
//!   `#[link]`, cargar bibliotecas a mano) sólo viven en `ffi/`: el resto de
//!   VERX Desktop es Rust seguro y no puede llamar al sistema por su cuenta.

use super::Problem;
use crate::repo::{Repo, code_only, has_word};

/// La carpeta FFI de VERX Desktop.
const FFI_DIR: &str = "crates/desktop/src/ffi/";
/// Hasta cuántas líneas de encima puede estar el `// SAFETY:` de un `unsafe`.
const SAFETY_REACH: usize = 3;

fn is_abi_file(path: &str) -> bool {
    path.starts_with("crates/") && path.ends_with("/src/abi.rs") && path.matches('/').count() == 3
}

/// ¿Puede este archivo tener `unsafe`?
fn unsafe_zone(path: &str) -> bool {
    let rust = std::path::Path::new(path)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("rs"));
    is_abi_file(path) || (path.starts_with(FFI_DIR) && rust)
}

/// ¿Tiene el `unsafe` de la línea `n` su justificación? Sube por encima de ella
/// saltando los atributos (también los de varias líneas) hasta `SAFETY_REACH`
/// líneas de código; si es una `unsafe fn`, también vale su `/// # Safety`.
fn justified(all: &[&str], n: usize, is_fn: bool) -> bool {
    if all[n].contains("SAFETY:") {
        return true;
    }
    let mut counted = 0;
    let mut in_attr = false;
    for line in all[..n].iter().rev() {
        let t = line.trim();
        let attr_start = t.starts_with("#[") || t.starts_with("#![");
        if in_attr {
            in_attr = !attr_start;
            continue;
        }
        if attr_start {
            continue;
        }
        if t.ends_with(")]") || t == "]" {
            in_attr = true; // el final de un atributo de varias líneas: se salta hasta su `#[`
            continue;
        }
        if t.contains("SAFETY:") || (is_fn && t.starts_with("///") && t.contains("# Safety")) {
            return true;
        }
        if is_fn && t.starts_with("///") {
            continue; // la documentación de la función, hasta su `# Safety`
        }
        counted += 1;
        if counted >= SAFETY_REACH {
            return false;
        }
    }
    false
}

/// ¿Hay en esta línea (ya sin comentarios ni cadenas) un `unsafe` que necesita
/// su justificación? Los tipos (`unsafe extern "system" fn(…)`, `unsafe fn(…)`)
/// y los atributos (`#[unsafe(no_mangle)]`) no: sólo describen, no hacen nada.
fn needs_safety(code: &str) -> bool {
    let is_ident = |c: char| c.is_alphanumeric() || c == '_';
    code.match_indices("unsafe").any(|(i, _)| {
        let before = code[..i].chars().next_back().is_none_or(|c| !is_ident(c));
        let rest = code[i + "unsafe".len()..].trim_start();
        if !before
            || rest.starts_with(is_ident) && !["fn", "impl", "extern"].iter().any(|k| rest.starts_with(k))
        {
            return false;
        }
        // Tras `extern ""` (la cadena ya va vacía): bloque, función con nombre o tipo.
        let rest = rest
            .strip_prefix("extern")
            .map_or(rest, |r| r.trim_start().trim_start_matches("\"\"").trim_start());
        if rest.starts_with('{') || rest.starts_with("impl") {
            return true;
        }
        rest.strip_prefix("fn")
            .is_some_and(|r| r.starts_with(char::is_whitespace) && r.trim_start().starts_with(is_ident))
    })
}

/// ¿Es una declaración que habla con el sistema?
fn is_ffi_decl(code: &str) -> bool {
    let import_block = code.match_indices("extern").any(|(i, _)| {
        code[i + "extern".len()..]
            .trim_start()
            .trim_start_matches("\"\"")
            .trim_start()
            .starts_with('{')
    });
    import_block
        || code.contains("#[link(")
        || [
            "LoadLibraryW",
            "LoadLibraryA",
            "GetProcAddress",
            "dlopen",
            "dlsym",
        ]
        .iter()
        .any(|w| has_word(code, w))
}

fn lines(repo: &Repo, file: &str) -> Vec<String> {
    repo.read(file)
        .unwrap_or_default()
        .lines()
        .map(String::from)
        .collect()
}

/// `unsafe` sólo en las dos zonas.
pub(super) fn unsafe_acotado(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for file in repo.with_ext(&[".rs"], "crates/").filter(|f| !unsafe_zone(f)) {
        for (n, line) in lines(repo, file).iter().enumerate() {
            if has_word(&code_only(line), "unsafe") {
                out.push(Problem::new(
                    format!("{file}:{}", n + 1),
                    "`unsafe` fuera de abi.rs y de crates/desktop/src/ffi/",
                ));
            }
        }
    }
    out
}

/// Los problemas de un archivo (`path`, con su texto) para `ffi-aislada`.
fn check_file(path: &str, text: &str) -> Vec<Problem> {
    let all: Vec<&str> = text.lines().collect();
    let mut out = Vec::new();
    for (n, line) in all.iter().enumerate() {
        let code = code_only(line);
        if unsafe_zone(path) && needs_safety(&code) {
            let is_fn =
                code.contains("unsafe fn ") || (code.contains("unsafe extern") && code.contains(" fn "));
            if !justified(&all, n, is_fn) {
                out.push(Problem::new(
                    format!("{path}:{}", n + 1),
                    "`unsafe` sin su `// SAFETY:` (por qué es seguro) justo encima",
                ));
            }
        }
        if !path.starts_with(FFI_DIR) && is_ffi_decl(&code) {
            out.push(Problem::new(
                format!("{path}:{}", n + 1),
                "declaración que habla con el sistema fuera de crates/desktop/src/ffi/",
            ));
        }
    }
    out
}

pub(super) fn ffi_aislada(repo: &Repo) -> Vec<Problem> {
    repo.with_ext(&[".rs"], "crates/")
        .flat_map(|f| check_file(f, &repo.read(f).unwrap_or_default()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{check_file, is_ffi_decl, needs_safety, unsafe_zone};
    use crate::repo::code_only;

    #[test]
    fn las_dos_zonas() {
        assert!(unsafe_zone("crates/sim/src/abi.rs"));
        assert!(unsafe_zone("crates/desktop/src/ffi/win32.rs"));
        assert!(!unsafe_zone("crates/desktop/src/main.rs"));
        assert!(!unsafe_zone("crates/sim/src/ffi/x.rs"));
        assert!(!unsafe_zone("crates/sim/src/deep/abi.rs"));
    }

    #[test]
    fn que_unsafe_necesita_justificacion() {
        let needs = |l: &str| needs_safety(&code_only(l));
        assert!(needs("    let x = unsafe { leer(p) };"));
        assert!(needs("unsafe fn crear(p: *mut u8) -> u8 {"));
        assert!(needs("pub(super) unsafe fn llamar() {"));
        assert!(needs("unsafe impl Sync for Ventana {}"));
        assert!(needs("unsafe extern \"system\" {"));
        assert!(!needs(
            "type Crear = unsafe extern \"system\" fn(*mut u8) -> i32;"
        ));
        assert!(!needs(
            "invoke: unsafe extern \"system\" fn(*mut Handler, i32) -> i32,"
        ));
        assert!(!needs("#[unsafe(no_mangle)]"));
        assert!(!needs("let a = \"unsafe { }\"; // unsafe {"));
        assert!(!needs("#![allow(unsafe_code)]"));
    }

    #[test]
    fn declaraciones_del_sistema() {
        let decl = |l: &str| is_ffi_decl(&code_only(l));
        assert!(decl("unsafe extern \"system\" {"));
        assert!(decl("extern \"C\" {"));
        assert!(decl("#[link(name = \"user32\")]"));
        assert!(decl("let f = GetProcAddress(dll, nombre);"));
        assert!(!decl("pub extern \"C\" fn verx_abi() -> u32 {"));
        assert!(!decl("// GetProcAddress vive en ffi/"));
    }

    #[test]
    fn exige_safety_y_que_lo_del_sistema_viva_en_ffi() {
        let bien = "// SAFETY: `p` viene de Box::into_raw y vive hasta el final.\nlet v = unsafe { *p };\n";
        assert_eq!(check_file("crates/desktop/src/ffi/a.rs", bien).len(), 0);
        let lejos = "// SAFETY: demasiado arriba\n\n\n\n\nlet v = unsafe { *p };\n";
        assert_eq!(check_file("crates/desktop/src/ffi/a.rs", lejos).len(), 1);
        // Los atributos entre el comentario y el `unsafe` no cuentan como distancia.
        let attr = "    // SAFETY: un solo llamador.\n    #[allow(\n        clippy::deref_addrof,\n        reason = \"…\"\n    )]\n    let v = unsafe { *p };\n";
        assert_eq!(check_file("crates/sim/src/abi.rs", attr).len(), 0);
        // Una `unsafe fn` vale con su sección `# Safety` (y sus atributos).
        let doc = "/// El estado.\n///\n/// # Safety\n/// Un solo llamador.\n#[allow(clippy::x, reason = \"…\")]\nunsafe fn state() -> u8 {\n";
        assert_eq!(check_file("crates/sim/src/abi.rs", doc).len(), 0);
        let sin_doc = "/// El estado.\nunsafe fn state() -> u8 {\n";
        assert_eq!(check_file("crates/sim/src/abi.rs", sin_doc).len(), 1);
        let fuera = "unsafe extern \"system\" {\n    fn GetTickCount() -> u32;\n}\n";
        let found = check_file("crates/desktop/src/main.rs", fuera);
        assert_eq!(found.len(), 1);
        assert!(found[0].message.contains("fuera de crates/desktop/src/ffi/"));
    }
}
