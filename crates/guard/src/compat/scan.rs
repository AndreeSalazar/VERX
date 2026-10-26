//! Dónde usa un archivo cada función de la tabla y si va protegida.
//!
//! · CSS: un uso va protegido si está dentro de un bloque `@supports (…)` que
//!   nombra la función, o si el archivo trae su alternativa (`guards`).
//! · JS: si el archivo comprueba antes que existe (`guards`).
//! · Las propias comprobaciones (`@supports (…)`, `CSS.supports(…)`,
//!   `HTMLScriptElement.supports(…)`) no son usos.

use super::table::{Feature, Kind};

/// Un uso de la función `feature` (índice en la tabla) en la línea `line`.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Use {
    pub(crate) feature: usize,
    pub(crate) line: usize,
    pub(crate) guarded: bool,
}

/// El cuerpo de un bloque `@supports`: su condición y entre qué bytes va.
struct Block {
    cond: String,
    start: usize,
    end: usize,
}

fn supports_blocks(text: &str) -> Vec<Block> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(rel) = text[from..].find("@supports") {
        let at = from + rel;
        let Some(open) = text[at..].find('{').map(|o| at + o) else {
            break;
        };
        let mut depth = 0usize;
        let mut end = text.len();
        for (i, &b) in bytes.iter().enumerate().skip(open) {
            if b == b'{' {
                depth += 1;
            } else if b == b'}' {
                depth -= 1;
                if depth == 0 {
                    end = i;
                    break;
                }
            }
        }
        out.push(Block {
            cond: text[at + "@supports".len()..open].to_string(),
            start: open,
            end,
        });
        from = open + 1;
    }
    out
}

/// ¿Es `pos` parte de una comprobación y no un uso?
fn is_check(text: &str, pos: usize) -> bool {
    let line_start = text[..pos].rfind('\n').map_or(0, |i| i + 1);
    let before = &text[line_start..pos];
    before.contains("@supports") || before.contains(".supports(") || before.contains(".supports?.(")
}

fn kind_applies(kind: Kind, path: &str) -> bool {
    match kind {
        // El CSS también vive en HTML y en cadenas de JS (p. ej. un shadow DOM).
        Kind::Css => true,
        // El JS, en todo menos en una hoja de estilos.
        Kind::Js => !std::path::Path::new(path)
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("css")),
    }
}

/// El texto con los comentarios en blanco (mismos bytes y saltos de línea, así
/// las posiciones y las líneas no cambian): `/* … */` siempre y, en JS, `// …`
/// salvo tras `:` (las URL como `https://…` no son comentarios).
fn blank_comments(text: &str, js: bool) -> String {
    let src = text.as_bytes();
    let mut out = src.to_vec();
    let mut i = 0;
    while i + 1 < src.len() {
        // En JS, lo que va entre comillas es texto, no comentario: '/*' es un patrón.
        if js && matches!(src[i], b'\'' | b'"' | b'`') {
            let quote = src[i];
            i += 1;
            while i < src.len() && src[i] != quote {
                i += if src[i] == b'\\' { 2 } else { 1 };
            }
            i += 1;
            continue;
        }
        let end = if src[i] == b'/' && src[i + 1] == b'*' {
            text[i + 2..].find("*/").map_or(src.len(), |e| i + 2 + e + 2)
        } else if js && src[i] == b'/' && src[i + 1] == b'/' && (i == 0 || src[i - 1] != b':') {
            text[i..].find('\n').map_or(src.len(), |e| i + e)
        } else {
            i += 1;
            continue;
        };
        for b in &mut out[i..end] {
            if *b != b'\n' {
                *b = b' ';
            }
        }
        i = end;
    }
    // Sólo se cambiaron bytes enteros de comentario por espacios: sigue siendo UTF-8.
    String::from_utf8(out).unwrap_or_default()
}

/// Todos los usos de un archivo: uno por función (el primero sin proteger, o
/// el primero si todos lo están), en el orden de la tabla.
pub(crate) fn uses(path: &str, text: &str, features: &[Feature]) -> Vec<Use> {
    let js = !std::path::Path::new(path)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("css"));
    let clean = blank_comments(text, js);
    let text = clean.as_str();
    let blocks = supports_blocks(text);
    let mut out = Vec::new();
    for (i, f) in features.iter().enumerate() {
        if !kind_applies(f.kind, path) {
            continue;
        }
        let file_guard = f.guards.iter().any(|g| text.contains(g.as_str()));
        let mut first: Option<Use> = None;
        for token in &f.tokens {
            for (pos, _) in text.match_indices(token.as_str()) {
                if is_check(text, pos) {
                    continue;
                }
                let guarded = file_guard
                    || (f.kind == Kind::Css
                        && blocks.iter().any(|b| {
                            b.start < pos
                                && pos < b.end
                                && !b.cond.contains("not")
                                && f.tokens.iter().any(|t| b.cond.contains(t.as_str()))
                        }));
                let line = text[..pos].matches('\n').count() + 1;
                let candidate = Use {
                    feature: i,
                    line,
                    guarded,
                };
                first = match first {
                    None => Some(candidate),
                    Some(prev) if prev.guarded && !candidate.guarded => Some(candidate),
                    Some(prev) => Some(prev),
                };
            }
        }
        out.extend(first);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::table::tests::sample;
    use super::Use;

    // Los usos con las fichas de ejemplo.
    fn uses(path: &str, text: &str) -> Vec<Use> {
        super::uses(path, text, &sample())
    }

    fn id(i: usize) -> String {
        sample()[i].id.clone()
    }

    #[test]
    fn css_protegido_con_supports() {
        let css = ".a { color: red; }\n@supports (animation-timeline: view()) {\n  .b { animation-timeline: view(); }\n}\n";
        let found = uses("a.css", css);
        assert_eq!(found.len(), 1);
        assert_eq!(id(found[0].feature), "animaciones-con-scroll");
        assert_eq!(found[0].line, 3);
        assert!(found[0].guarded);
    }

    #[test]
    fn css_sin_proteger_y_supports_not_no_cuenta() {
        let css = ".b { animation-timeline: view(); }\n@supports not (animation-timeline: view()) {\n  .c { animation-timeline: none; }\n}\n";
        let found = uses("a.css", css);
        assert_eq!(found.len(), 1);
        assert!(!found[0].guarded);
        assert_eq!(found[0].line, 1);
    }

    #[test]
    fn la_alternativa_con_prefijo_cubre() {
        let found = uses(
            "a.css",
            ".x { -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }",
        );
        assert!(
            found
                .iter()
                .any(|u| id(u.feature) == "backdrop-filter" && u.guarded)
        );
        let bare = uses("a.css", ".x { backdrop-filter: blur(4px); }");
        assert!(
            bare.iter()
                .any(|u| id(u.feature) == "backdrop-filter" && !u.guarded)
        );
    }

    #[test]
    fn js_con_y_sin_comprobacion() {
        let ok = uses(
            "r.js",
            "const idle = 'requestIdleCallback' in window ? requestIdleCallback : setTimeout\n",
        );
        assert!(
            ok.iter()
                .any(|u| id(u.feature) == "request-idle-callback" && u.guarded)
        );
        let bad = uses("r.js", "requestIdleCallback(go)\n");
        assert!(
            bad.iter()
                .any(|u| id(u.feature) == "request-idle-callback" && !u.guarded)
        );
    }

    #[test]
    fn las_comprobaciones_no_son_usos() {
        let js = "if (!CSS.supports('animation-timeline: view()')) load()\nif (!HTMLScriptElement.supports?.('speculationrules')) more()\n";
        assert_eq!(uses("c.js", js), Vec::new());
    }

    #[test]
    fn los_comentarios_no_cuentan() {
        let css = "/* Sin animation-timeline (Firefox), todo quieto. */\n.a { color: red; }\n";
        assert_eq!(uses("a.css", css), Vec::new());
        let js =
            "// requestIdleCallback no está en Safari\nconst url = 'https://x.test/requestIdleCallback'\n";
        let found = uses("a.js", js);
        assert_eq!(found.len(), 1, "la URL sí es código");
        assert_eq!(found[0].line, 2);
        // Un '/*' dentro de una cadena no abre un comentario.
        let rules = "const r = { href_matches: '/*' }\ntags.push('<script type=\"speculationrules\">')\n";
        assert_eq!(uses("d.js", rules).len(), 1);
    }

    #[test]
    fn el_js_no_busca_funciones_js_dentro_del_css() {
        assert_eq!(uses("a.css", "/* requestIdleCallback */ .a{}"), Vec::new());
    }
}
