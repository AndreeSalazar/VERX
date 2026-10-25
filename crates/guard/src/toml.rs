//! Lector TOML mínimo: secciones y pares `clave = valor` de una línea.
//! Suficiente para los `Cargo.toml` de este repo (sin tablas multilínea).

#[derive(Debug, PartialEq)]
pub(crate) struct Entry {
    pub(crate) section: String,
    pub(crate) key: String,
    pub(crate) value: String,
}

pub(crate) fn parse(text: &str) -> Vec<Entry> {
    let mut section = String::new();
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = strip_comment(raw).trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            section = line.trim_matches(|c| c == '[' || c == ']').trim().to_string();
        } else if let Some((key, value)) = line.split_once('=') {
            out.push(Entry {
                section: section.clone(),
                key: key.trim().trim_matches('"').to_string(),
                value: value.trim().to_string(),
            });
        }
    }
    out
}

fn strip_comment(line: &str) -> &str {
    let mut in_str = false;
    for (i, c) in line.char_indices() {
        match c {
            '"' => in_str = !in_str,
            '#' if !in_str => return &line[..i],
            _ => {}
        }
    }
    line
}

/// Valor de una cadena TOML (`"x"` → `x`).
pub(crate) fn unquote(value: &str) -> &str {
    value.trim().trim_matches('"')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secciones_claves_y_comentarios() {
        let t = "[package]\nname = \"verx-sim\" # nombre\n\n[dependencies]\nserde = { version = \"1\" }\n";
        let e = parse(t);
        assert_eq!(e.len(), 2);
        assert_eq!(
            (e[0].section.as_str(), e[0].key.as_str(), unquote(&e[0].value)),
            ("package", "name", "verx-sim")
        );
        assert_eq!(e[1].section, "dependencies");
        assert_eq!(e[1].key, "serde");
    }
}
