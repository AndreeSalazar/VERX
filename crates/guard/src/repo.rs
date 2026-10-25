//! Recorrido del repositorio: lista de archivos (rutas relativas con `/`) y
//! utilidades de lectura. Ignora dependencias instaladas y salidas de build.

use std::fs;
use std::path::{Path, PathBuf};

const SKIP_DIRS: [&str; 6] = ["node_modules", "target", "dist", ".git", ".claude", ".bun"];

pub(crate) struct Repo {
    pub(crate) root: PathBuf,
    pub(crate) files: Vec<String>,
}

impl Repo {
    pub(crate) fn open(root: &Path) -> Result<Self, String> {
        let mut files = Vec::new();
        walk(root, root, &mut files).map_err(|e| format!("no se pudo recorrer {}: {e}", root.display()))?;
        files.sort();
        Ok(Self {
            root: root.to_path_buf(),
            files,
        })
    }

    pub(crate) fn read(&self, rel: &str) -> Option<String> {
        fs::read_to_string(self.root.join(rel)).ok()
    }

    pub(crate) fn exists(&self, rel: &str) -> bool {
        self.root.join(rel).exists()
    }

    /// Carpetas de un grupo (`packages`, `crates`, `apps`) que contienen `manifest`.
    pub(crate) fn members(&self, group: &str, manifest: &str) -> Vec<String> {
        let Ok(entries) = fs::read_dir(self.root.join(group)) else {
            return Vec::new();
        };
        let mut out: Vec<String> = entries
            .filter_map(Result::ok)
            .filter(|e| e.path().join(manifest).is_file())
            .map(|e| format!("{group}/{}", e.file_name().to_string_lossy()))
            .collect();
        out.sort();
        out
    }

    /// Archivos cuya extensión está en `exts`, opcionalmente bajo `prefix`.
    pub(crate) fn with_ext<'a>(
        &'a self,
        exts: &'a [&str],
        prefix: &'a str,
    ) -> impl Iterator<Item = &'a String> {
        self.files
            .iter()
            .filter(move |f| f.starts_with(prefix) && exts.iter().any(|e| f.ends_with(e)))
    }
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) {
                walk(root, &path, out)?;
            }
        } else if kind.is_file()
            && let Ok(rel) = path.strip_prefix(root)
        {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

/// Sube desde `start` hasta encontrar la raíz del monorepo
/// (la carpeta con `package.json` y `crates/Cargo.toml`).
pub(crate) fn find_root(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .find(|d| d.join("package.json").is_file() && d.join("crates").join("Cargo.toml").is_file())
        .map(Path::to_path_buf)
}

/// Quita comentarios `//` y el contenido de las cadenas (`"…"`, `r"…"`,
/// `r#"…"#`) y caracteres literales de una línea, para que las reglas no se
/// confundan con texto.
pub(crate) fn code_only(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(c) = rest.chars().next() {
        if rest.starts_with("//") {
            break;
        }
        if let Some(after) = skip_literal(rest, &out) {
            out.push_str("\"\"");
            rest = after;
            continue;
        }
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    out
}

/// Si `s` empieza por un literal de texto, devuelve lo que viene después.
fn skip_literal<'a>(s: &'a str, before: &str) -> Option<&'a str> {
    for ch in ["'\"'", "'\\''", "'\\\\'"] {
        if let Some(after) = s.strip_prefix(ch) {
            return Some(after);
        }
    }
    if let Some(body) = s.strip_prefix('"') {
        let mut chars = body.char_indices();
        while let Some((i, c)) = chars.next() {
            match c {
                '\\' => {
                    chars.next();
                }
                '"' => return Some(&body[i + 1..]),
                _ => {}
            }
        }
        return Some("");
    }
    let after_ident = before
        .chars()
        .next_back()
        .is_some_and(|c| c.is_alphanumeric() || c == '_');
    if after_ident {
        return None;
    }
    let raw = s.strip_prefix('r')?;
    let hashes = raw.len() - raw.trim_start_matches('#').len();
    let body = raw[hashes..].strip_prefix('"')?;
    let close = format!("\"{}", "#".repeat(hashes));
    Some(body.find(&close).map_or("", |k| &body[k + close.len()..]))
}

/// ¿Aparece `word` como palabra completa en `text`?
pub(crate) fn has_word(text: &str, word: &str) -> bool {
    let is_ident = |c: char| c.is_alphanumeric() || c == '_';
    text.match_indices(word).any(|(i, _)| {
        let before = text[..i].chars().next_back().is_none_or(|c| !is_ident(c));
        let after = text[i + word.len()..].chars().next().is_none_or(|c| !is_ident(c));
        before && after
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_only_quita_comentarios_y_cadenas() {
        assert_eq!(
            code_only(r#"let a = "unsafe // no"; // unsafe"#),
            r#"let a = ""; "#
        );
        assert_eq!(code_only(r#"x("a\"b") + y"#), r#"x("") + y"#);
        assert_eq!(code_only(r#"f(r"unsafe x", 1)"#), r#"f("", 1)"#);
        assert_eq!(
            code_only(r#"match c { '"' => unsafe_ok }"#),
            r#"match c { "" => unsafe_ok }"#
        );
        assert_eq!(code_only("for r in rows"), "for r in rows");
    }

    #[test]
    fn palabras_completas() {
        assert!(has_word("unsafe { x }", "unsafe"));
        assert!(!has_word("deny_unsafe_code", "unsafe"));
        assert!(!has_word("unsafely", "unsafe"));
    }
}
