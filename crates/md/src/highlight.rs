//! Resaltado de código en el servidor: el navegador recibe `<span class="t-…">`
//! ya hechos y cero JS. Un lexer pequeño por familia de lenguajes:
//!
//! | clase | qué |
//! |---|---|
//! | `t-kw` | palabras clave |
//! | `t-str` | cadenas |
//! | `t-com` | comentarios |
//! | `t-num` | números |
//! | `t-fn` | llamadas (`nombre(`, `macro!`) y el comando de cada línea en shell |
//! | `t-ty` | tipos (`Mayúscula`) en Rust y TypeScript |
//! | `t-attr` | claves de TOML/JSON/CSS y opciones `--así` en shell |

use crate::out::Out;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Family {
    Js,
    Rust,
    Shell,
    Toml,
    Json,
    Css,
    Plain,
}

const JS: &[&str] = &[
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "of",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "yield",
];
const RUST: &[&str] = &[
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern", "false",
    "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
    "self", "Self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while",
];
const SHELL: &[&str] = &[
    "case", "do", "done", "elif", "else", "esac", "export", "fi", "for", "function", "if", "in", "then",
    "while",
];
const LITERALS: &[&str] = &["false", "null", "true"];

fn family(lang: &[u8]) -> Family {
    let is = |names: &[&str]| names.iter().any(|n| lang.eq_ignore_ascii_case(n.as_bytes()));
    if is(&["js", "jsx", "ts", "tsx", "mjs", "javascript", "typescript"]) {
        Family::Js
    } else if is(&["rs", "rust"]) {
        Family::Rust
    } else if is(&["sh", "bash", "shell", "console", "zsh"]) {
        Family::Shell
    } else if is(&["toml", "ini"]) {
        Family::Toml
    } else if is(&["json", "jsonc"]) {
        Family::Json
    } else if is(&["css"]) {
        Family::Css
    } else {
        Family::Plain
    }
}

fn ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_' || b == b'$' || b >= 0x80
}

// El guion forma parte de la palabra sólo donde es habitual (`--opción`, `font-size`, `clave-x`).
fn ident_char(b: u8, dash: bool) -> bool {
    ident_start(b) || b.is_ascii_digit() || (dash && b == b'-')
}

fn span(out: &mut Out<'_>, class: &str, s: &[u8]) {
    out.str("<span class=\"t-");
    out.str(class);
    out.str("\">");
    out.text(s);
    out.str("</span>");
}

fn line_comment(f: Family, rest: &[u8]) -> bool {
    match f {
        Family::Js | Family::Rust | Family::Json => rest.starts_with(b"//"),
        Family::Shell | Family::Toml => rest[0] == b'#',
        Family::Css | Family::Plain => false,
    }
}

/// Escribe `code` resaltado según `lang` (sin lenguaje conocido: sólo escapado).
pub fn highlight(lang: &[u8], code: &[u8], out: &mut Out<'_>) {
    let f = family(lang);
    let dash = matches!(f, Family::Shell | Family::Css | Family::Toml);
    if f == Family::Plain {
        out.text(code);
        return;
    }
    let mut i = 0;
    let mut line_start = true;
    let mut after_def = false; // la palabra anterior fue `fn` o `function`
    while i < code.len() {
        let b = code[i];
        let rest = &code[i..];
        if b == b'\n' {
            out.raw(b"\n");
            line_start = true;
            i += 1;
            continue;
        }
        if b == b' ' || b == b'\t' {
            out.raw(&code[i..=i]);
            i += 1;
            continue;
        }
        let start_of_line = line_start;
        line_start = false;
        let end = if line_comment(f, rest) {
            i + rest.iter().position(|&c| c == b'\n').unwrap_or(rest.len())
        } else if rest.starts_with(b"/*") && f != Family::Shell && f != Family::Toml {
            rest.windows(2)
                .position(|w| w == b"*/")
                .map_or(code.len(), |p| i + p + 2)
        } else {
            0
        };
        if end > 0 {
            span(out, "com", &code[i..end]);
            i = end;
            continue;
        }
        if b == b'"' || b == b'\'' || (b == b'`' && f == Family::Js) {
            // En Rust, 'a es un tiempo de vida, no una cadena.
            let lifetime = f == Family::Rust
                && b == b'\''
                && code.get(i + 2) != Some(&b'\'')
                && code.get(i + 3) != Some(&b'\'');
            if !lifetime {
                let end = string_end(code, i);
                let class = if f != Family::Js && is_key(code, end) {
                    "attr"
                } else {
                    "str"
                };
                span(out, class, &code[i..end]);
                i = end;
                continue;
            }
        }
        if b.is_ascii_digit() && (i == 0 || !ident_char(code[i - 1], dash)) {
            let len = rest
                .iter()
                .take_while(|&&c| c.is_ascii_alphanumeric() || c == b'.' || c == b'_')
                .count();
            span(out, "num", &rest[..len]);
            i += len;
            continue;
        }
        if f == Family::Toml && start_of_line && b == b'[' {
            let len = rest.iter().position(|&c| c == b'\n').unwrap_or(rest.len());
            span(out, "ty", &rest[..len]);
            i += len;
            continue;
        }
        if ident_start(b)
            || (b == b'-'
                && matches!(f, Family::Shell | Family::Css)
                && rest.get(1).is_some_and(|&c| c == b'-' || c.is_ascii_alphabetic()))
        {
            let len = 1 + rest[1..]
                .iter()
                .take_while(|&&c| ident_char(c, dash) || (f == Family::Shell && (c == b'.' || c == b'/')))
                .count();
            after_def = word(f, &rest[..len], code, i + len, (start_of_line, after_def), out);
            i += len;
            continue;
        }
        out.text(&code[i..=i]);
        i += 1;
    }
}

fn string_end(code: &[u8], at: usize) -> usize {
    let q = code[at];
    let mut j = at + 1;
    while j < code.len() {
        match code[j] {
            b'\\' => j += 2,
            c if c == q => return j + 1,
            b'\n' if q != b'`' => return j,
            _ => j += 1,
        }
    }
    code.len()
}

// ¿Lo que acaba en `end` es una clave (`"clave": …` o `clave = …`)?
fn is_key(code: &[u8], end: usize) -> bool {
    code[end.min(code.len())..]
        .iter()
        .find(|&&c| c != b' ')
        .is_some_and(|&c| c == b':' || c == b'=')
}

// Escribe una palabra con su clase. Devuelve si define una función (`fn`, `function`),
// para marcar como función la palabra siguiente aunque lleve genéricos (`f<T>(`).
fn word(
    f: Family,
    w: &[u8],
    code: &[u8],
    end: usize,
    (start_of_line, after_def): (bool, bool),
    out: &mut Out<'_>,
) -> bool {
    let next = code[end..].iter().find(|&&c| c != b' ').copied();
    let in_list = |list: &[&str]| list.iter().any(|k| k.as_bytes() == w);
    let class = match f {
        Family::Js | Family::Rust if after_def => Some("fn"),
        Family::Js if in_list(JS) => Some("kw"),
        Family::Rust if in_list(RUST) => Some("kw"),
        Family::Shell if in_list(SHELL) => Some("kw"),
        Family::Shell if w[0] == b'-' => Some("attr"),
        Family::Shell if start_of_line => Some("fn"),
        Family::Toml | Family::Json if in_list(LITERALS) => Some("kw"),
        Family::Toml | Family::Css if is_key(code, end) => Some("attr"),
        Family::Js | Family::Rust if next == Some(b'(') || (f == Family::Rust && next == Some(b'!')) => {
            Some("fn")
        }
        Family::Js | Family::Rust if w[0].is_ascii_uppercase() => Some("ty"),
        _ => None,
    };
    match class {
        Some(c) => span(out, c, w),
        None => out.text(w),
    }
    matches!(w, b"fn" | b"function")
}

#[cfg(test)]
mod tests {
    use super::highlight;
    use crate::out::Out;

    fn hl(lang: &str, code: &str) -> std::string::String {
        let mut buf = std::vec![0u8; 8192];
        let mut out = Out::new(&mut buf);
        highlight(lang.as_bytes(), code.as_bytes(), &mut out);
        std::string::String::from_utf8_lossy(out.as_bytes()).into_owned()
    }

    #[test]
    fn javascript() {
        assert_eq!(
            hl("js", "const n = await load('a') // listo"),
            "<span class=\"t-kw\">const</span> n = <span class=\"t-kw\">await</span> <span class=\"t-fn\">load</span>(<span class=\"t-str\">&#39;a&#39;</span>) <span class=\"t-com\">// listo</span>"
        );
        assert!(hl("tsx", "new Map<string>()").contains("<span class=\"t-ty\">Map</span>"));
    }

    #[test]
    fn rust_con_tiempos_de_vida_y_macros() {
        let out = hl("rust", "fn f<'a>(x: &'a str) { println!(\"{x}\"); 42 }");
        assert!(out.starts_with("<span class=\"t-kw\">fn</span> <span class=\"t-fn\">f</span>"));
        assert!(out.contains("&amp;&#39;a str"));
        assert!(out.contains("<span class=\"t-fn\">println</span>!"));
        assert!(out.contains("<span class=\"t-num\">42</span>"));
    }

    #[test]
    fn shell_toml_json() {
        assert_eq!(
            hl("bash", "bun run dev --hot # arranca"),
            "<span class=\"t-fn\">bun</span> run dev <span class=\"t-attr\">--hot</span> <span class=\"t-com\"># arranca</span>"
        );
        assert!(
            hl("toml", "[package]\nname = \"verx\"")
                .contains("<span class=\"t-ty\">[package]</span>\n<span class=\"t-attr\">name</span>")
        );
        assert!(
            hl("json", "{\"a\": true}")
                .contains("<span class=\"t-attr\">&quot;a&quot;</span>: <span class=\"t-kw\">true</span>")
        );
    }

    #[test]
    fn sin_lenguaje_solo_escapa() {
        assert_eq!(hl("", "<b> & c"), "&lt;b&gt; &amp; c");
        assert_eq!(hl("brainfuck", "+<>"), "+&lt;&gt;");
    }
}
