//! Reglas sobre el contenido del código.

use super::Problem;
use crate::repo::{Repo, code_only, has_word};

const JS: [&str; 5] = [".js", ".jsx", ".ts", ".tsx", ".mjs"];
const RUST: [&str; 1] = [".rs"];
const TEXT: [&str; 13] = [
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".json", ".md", ".css", ".html", ".rs", ".toml", ".svg", ".txt",
];
const MAX_LINES: usize = 400;
const ABI_FILE: &str = "crates/sim/src/abi.rs";
const BRIDGE: &str = "packages/sim/";

fn lines(repo: &Repo, file: &str) -> Vec<String> {
    repo.read(file)
        .unwrap_or_default()
        .lines()
        .map(String::from)
        .collect()
}

/// ¿Es una sentencia de importación real? (no un comentario ni texto que la mencione)
fn is_import(line: &str) -> bool {
    let t = line.trim_start();
    if t.starts_with("//") || t.starts_with('*') || t.starts_with("/*") {
        return false;
    }
    let statement = (t.starts_with("import ") || t.starts_with("import{") || t.starts_with("export "))
        && (t.contains(" from ")
            || t.contains("from'")
            || t.contains("from\"")
            || t.starts_with("import '")
            || t.starts_with("import \""));
    statement || t.contains("import(") || t.contains("require(")
}

pub(super) fn frontera(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for file in repo.with_ext(&JS, "") {
        for (n, line) in lines(repo, file).iter().enumerate() {
            if !is_import(line) {
                continue;
            }
            if line.contains("crates/") {
                out.push(Problem::new(
                    format!("{file}:{}", n + 1),
                    "un archivo JS importa del mundo Rust (crates/)",
                ));
            }
            if line.contains(".wasm") && !file.starts_with(BRIDGE) {
                out.push(Problem::new(
                    format!("{file}:{}", n + 1),
                    "sólo @verx/sim puede cargar archivos .wasm",
                ));
            }
        }
    }
    for file in repo
        .with_ext(&RUST, "crates/")
        .filter(|f| !f.starts_with("crates/guard/"))
    {
        for (n, line) in lines(repo, file).iter().enumerate() {
            let outside = line.contains("packages/") || line.contains("apps/");
            let escapes =
                (line.contains("include_bytes!") || line.contains("include_str!")) && line.contains("..");
            if outside || escapes {
                out.push(Problem::new(
                    format!("{file}:{}", n + 1),
                    "un crate referencia archivos fuera de crates/",
                ));
            }
        }
    }
    out
}

pub(super) fn unsafe_acotado(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for file in repo.with_ext(&RUST, "crates/").filter(|f| f.as_str() != ABI_FILE) {
        for (n, line) in lines(repo, file).iter().enumerate() {
            if has_word(&code_only(line), "unsafe") {
                out.push(Problem::new(
                    format!("{file}:{}", n + 1),
                    "`unsafe` fuera de abi.rs",
                ));
            }
        }
    }
    out
}

pub(super) fn sin_restos(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for file in repo.with_ext(&JS, "") {
        let is_test = file.contains(".test.");
        for (n, line) in lines(repo, file).iter().enumerate() {
            let t = line.trim_start();
            let only = is_test && [".only(", ".skip("].iter().any(|p| t.contains(p));
            if only || t.starts_with("debugger") {
                out.push(Problem::new(
                    format!("{file}:{}", n + 1),
                    format!("resto de depuración: {}", t.trim()),
                ));
            }
        }
    }
    for file in repo.with_ext(&RUST, "crates/") {
        for (n, line) in lines(repo, file).iter().enumerate() {
            let code = code_only(line);
            for m in ["dbg!(", "todo!(", "unimplemented!("] {
                if code.contains(m) {
                    out.push(Problem::new(
                        format!("{file}:{}", n + 1),
                        format!("resto de depuración: {m}…)"),
                    ));
                }
            }
        }
    }
    out
}

pub(super) fn tamano(repo: &Repo) -> Vec<Problem> {
    let code: Vec<&str> = JS.iter().chain(RUST.iter()).copied().collect();
    repo.with_ext(&code, "")
        .filter(|f| !f.contains("/fixtures/"))
        .filter_map(|f| {
            let count = repo.read(f)?.lines().count();
            (count > MAX_LINES).then(|| Problem::new(f, format!("{count} líneas (máximo {MAX_LINES})")))
        })
        .collect()
}

pub(super) fn lf(repo: &Repo) -> Vec<Problem> {
    repo.with_ext(&TEXT, "")
        .filter(|f| repo.read(f).is_some_and(|t| t.contains("\r\n")))
        .map(|f| Problem::new(f, "tiene saltos de línea CRLF"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::is_import;

    #[test]
    fn solo_imports_reales() {
        assert!(is_import("import x from '../sim.wasm' with { type: 'file' }"));
        assert!(is_import("export { a } from \"./b.js\""));
        assert!(is_import("const m = await import('./x.js')"));
        assert!(is_import("import './side-effect.js'"));
        assert!(!is_import("    // sim.wasm importado con type: 'file'"));
        assert!(!is_import(" * import desde crates/ está prohibido"));
        assert!(!is_import("const texto = 'importante'"));
    }
}
