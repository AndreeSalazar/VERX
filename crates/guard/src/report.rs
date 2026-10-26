//! `verx-guard check --json`: el resultado para otras herramientas (VERX Grafo
//! lo usa para iluminar en rojo lo bloqueado). Cada problema lleva su archivo y,
//! si lo hay, su línea por separado.
//!
//! ```json
//! {"ok":false,"quick":true,"files":240,"rules":[
//!   {"id":"sin-restos","title":"…","fix":"…","skipped":false,
//!    "problems":[{"file":"apps/web/a.js","line":3,"message":"resto de depuración: debugger"}]}],
//!  "compat":{"target":{…},"features":[…],"files":{"apps/web/a.css":[["has",12,false]]}}}
//! ```

use std::fmt::Write;

use crate::rules::Outcome;

// Los colores de terminal (`ESC [ … m`) no viajan en el JSON: ahí serían basura.
fn string(out: &mut String, s: &str) {
    out.push('"');
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            // Parámetros y, al final, una letra (0x40–0x7e) que cierra la secuencia.
            for c in chars.by_ref() {
                if ('\u{40}'..='\u{7e}').contains(&c) {
                    break;
                }
            }
            continue;
        }
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            c if u32::from(c) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", u32::from(c));
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Una cadena JSON (con sus comillas), para quien construya JSON a mano.
pub(crate) fn quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    string(&mut out, s);
    out
}

/// `ruta:línea` → (`ruta`, `Some(línea)`); sin línea, `None`.
fn location(file: &str) -> (&str, Option<u32>) {
    match file.rsplit_once(':') {
        Some((path, line)) if !path.is_empty() => line.parse().map_or((file, None), |n| (path, Some(n))),
        _ => (file, None),
    }
}

/// El informe completo en JSON. `compat` es el mapa de navegadores ya en JSON
/// (`compat::json`): qué usa cada archivo y dónde falta.
pub(crate) fn json(outcomes: &[Outcome<'_>], files: usize, quick: bool, compat: &str) -> String {
    let ok = outcomes.iter().all(|o| o.problems.is_empty());
    let mut out = format!("{{\"ok\":{ok},\"quick\":{quick},\"files\":{files},\"rules\":[");
    for (i, o) in outcomes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"id\":");
        string(&mut out, o.rule.id);
        out.push_str(",\"title\":");
        string(&mut out, o.rule.title);
        out.push_str(",\"fix\":");
        string(&mut out, o.rule.fix);
        let _ = write!(out, ",\"skipped\":{},\"problems\":[", o.skipped);
        for (k, p) in o.problems.iter().enumerate() {
            if k > 0 {
                out.push(',');
            }
            let (path, line) = location(&p.file);
            out.push_str("{\"file\":");
            string(&mut out, path);
            match line {
                Some(n) => {
                    let _ = write!(out, ",\"line\":{n}");
                }
                None => out.push_str(",\"line\":null"),
            }
            out.push_str(",\"message\":");
            string(&mut out, &p.message);
            out.push('}');
        }
        out.push_str("]}");
    }
    let _ = write!(out, "],\"compat\":{compat}}}");
    out
}

#[cfg(test)]
mod tests {
    use super::{json, location};
    use crate::json::{Json, parse};
    use crate::rules::{Outcome, Problem, RULES};

    #[test]
    fn separa_archivo_y_linea() {
        assert_eq!(location("apps/web/a.js:12"), ("apps/web/a.js", Some(12)));
        assert_eq!(location("crates/search"), ("crates/search", None));
        assert_eq!(location("apps/web /blog"), ("apps/web /blog", None));
    }

    #[test]
    fn json_valido_y_completo() {
        let outcomes = [
            Outcome {
                rule: &RULES[0],
                problems: std::vec::Vec::new(),
                skipped: false,
            },
            Outcome {
                rule: &RULES[1],
                problems: std::vec![Problem::new("a/b.js:3", "dice \"hola\"\n")],
                skipped: false,
            },
        ];
        let text = json(&outcomes, 7, true, "{\"target\":{}}");
        let doc = parse(&text);
        assert!(doc.is_ok(), "JSON inválido: {text}");
        let Ok(doc) = doc else { return };
        assert_eq!(doc.get("ok"), Some(&Json::Bool(false)));
        assert!(matches!(doc.get("rules"), Some(Json::Arr(rules)) if rules.len() == 2));
        assert!(text.contains(r#"{"file":"a/b.js","line":3,"message":"dice \"hola\"\n"}"#));
    }

    #[test]
    fn sin_colores_de_terminal() {
        let mut out = std::string::String::new();
        super::string(
            &mut out,
            "\u{1b}[31mSyntaxError\u{1b}[0m: \u{1b}[1;2mx\u{1b}[0m\u{7}",
        );
        assert_eq!(out, r#""SyntaxError: x\u0007""#);
    }
}
