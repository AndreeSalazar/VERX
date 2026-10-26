//! Elementos en línea: `código`, *énfasis*, **fuerte**, ~~tachado~~, enlaces,
//! imágenes, autoenlaces, escapes con `\` y saltos de línea.
//!
//! Seguro por diseño: el HTML del texto siempre se escapa y un enlace sólo
//! conserva su `href` si es relativo, un ancla o usa http, https o mailto (nada
//! de `javascript:`); si no, queda sólo su texto.

use crate::link::{autolink, image, link};
use crate::out::Out;

/// Qué se escribe.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// HTML completo.
    Html,
    /// Sólo el texto, escapado para HTML (p. ej. el `alt` de una imagen).
    Text,
    /// Sólo el texto, tal cual (para el índice JSON y los anclajes).
    Raw,
}

pub(crate) const MAX_DEPTH: usize = 12;

pub(crate) enum Step {
    /// Se escribió algo: seguir desde aquí.
    Done(usize),
    /// No era nada: estos bytes son texto literal.
    Skip(usize),
}

/// Renderiza `s` en `out`.
pub fn render(s: &[u8], out: &mut Out<'_>, mode: Mode) {
    run(s, out, mode, 0);
}

pub(crate) fn text(out: &mut Out<'_>, s: &[u8], mode: Mode) {
    if mode == Mode::Raw {
        out.raw(s);
    } else {
        out.text(s);
    }
}

fn tag(out: &mut Out<'_>, mode: Mode, html: &str) {
    if mode == Mode::Html {
        out.str(html);
    }
}

fn run_len(s: &[u8], at: usize, c: u8) -> usize {
    s[at..].iter().take_while(|&&b| b == c).count()
}

fn is_space(b: Option<&u8>) -> bool {
    b.is_none_or(u8::is_ascii_whitespace)
}

pub(crate) fn run(s: &[u8], out: &mut Out<'_>, mode: Mode, depth: usize) {
    let mut i = 0;
    let mut lit = 0;
    while i < s.len() {
        let before = &s[lit..i];
        let step = match s[i] {
            b'\\' => escape(s, i, before, out, mode),
            b'`' => code_span(s, i, before, out, mode),
            b'*' | b'_' if depth < MAX_DEPTH => emphasis(s, i, before, out, mode, depth),
            b'~' if depth < MAX_DEPTH && s.get(i + 1) == Some(&b'~') => {
                strike(s, i, before, out, mode, depth)
            }
            b'!' if s.get(i + 1) == Some(&b'[') => image(s, i, before, out, mode),
            b'[' if depth < MAX_DEPTH => link(s, i, before, out, mode, depth),
            b'<' => autolink(s, i, before, out, mode),
            b'\n' => newline(s, lit, i, out, mode),
            _ => Step::Skip(i + 1),
        };
        match step {
            Step::Done(next) => {
                i = next;
                lit = i;
            }
            Step::Skip(next) => i = next,
        }
    }
    text(out, &s[lit..], mode);
}

fn escape(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode) -> Step {
    match s.get(i + 1) {
        Some(b'\n') => {
            text(out, before, mode);
            if mode == Mode::Html {
                out.str("<br>\n");
            } else {
                out.raw(b" ");
            }
            Step::Done(i + 2)
        }
        Some(c) if c.is_ascii_punctuation() => {
            text(out, before, mode);
            text(out, &s[i + 1..i + 2], mode);
            Step::Done(i + 2)
        }
        _ => Step::Skip(i + 1),
    }
}

// Dos espacios antes del salto (o una `\`, ver `escape`) son un <br>.
fn newline(s: &[u8], lit: usize, i: usize, out: &mut Out<'_>, mode: Mode) -> Step {
    let trailing = s[lit..i].iter().rev().take_while(|&&b| b == b' ').count();
    text(out, &s[lit..i - trailing], mode);
    match mode {
        Mode::Html if trailing >= 2 => out.str("<br>\n"),
        Mode::Html => out.raw(b"\n"),
        _ => out.raw(b" "),
    }
    Step::Done(i + 1)
}

// Salta un código en línea que empieza en `at` (para no buscar delimitadores dentro).
pub(crate) fn skip_code(s: &[u8], at: usize) -> usize {
    let n = run_len(s, at, b'`');
    let mut j = at + n;
    while j < s.len() {
        if s[j] == b'`' {
            let m = run_len(s, j, b'`');
            if m == n {
                return j + m;
            }
            j += m;
        } else {
            j += 1;
        }
    }
    at + n
}

fn code_span(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode) -> Step {
    let n = run_len(s, i, b'`');
    let end = skip_code(s, i);
    if end == i + n {
        return Step::Skip(i + n); // sin cierre: los acentos graves son texto
    }
    let mut inner = &s[i + n..end - n];
    if inner.len() >= 2
        && inner[0] == b' '
        && inner[inner.len() - 1] == b' '
        && inner.iter().any(|&b| b != b' ')
    {
        inner = &inner[1..inner.len() - 1];
    }
    text(out, before, mode);
    tag(out, mode, "<code>");
    for (k, part) in inner.split(|&b| b == b'\n').enumerate() {
        if k > 0 {
            out.raw(b" ");
        }
        text(out, part, mode);
    }
    tag(out, mode, "</code>");
    Step::Done(end)
}

// Busca el cierre de un delimitador `c` de longitud `n` a partir de `from`.
fn closer(s: &[u8], from: usize, c: u8, n: usize) -> Option<(usize, usize)> {
    let mut j = from;
    while j < s.len() {
        match s[j] {
            b'\\' => j += 2,
            b'`' => j = skip_code(s, j),
            b if b == c => {
                let m = run_len(s, j, c);
                let fits = if n == 3 { m >= 3 } else { m == n };
                let after = s.get(j + m);
                let flanked = !s[j - 1].is_ascii_whitespace()
                    && (c != b'_' || !after.is_some_and(u8::is_ascii_alphanumeric));
                if fits && flanked {
                    return Some((j, m));
                }
                j += m;
            }
            _ => j += 1,
        }
    }
    None
}

fn emphasis(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode, depth: usize) -> Step {
    let c = s[i];
    let len = run_len(s, i, c);
    let n = len.min(3);
    let intraword = c == b'_' && i > 0 && s[i - 1].is_ascii_alphanumeric();
    if is_space(s.get(i + len)) || intraword {
        return Step::Skip(i + len);
    }
    let Some((j, _)) = closer(s, i + len, c, n) else {
        return Step::Skip(i + len);
    };
    let (open, close) = match n {
        1 => ("<em>", "</em>"),
        2 => ("<strong>", "</strong>"),
        _ => ("<strong><em>", "</em></strong>"),
    };
    text(out, before, mode);
    text(out, &s[i..i + len - n], mode);
    tag(out, mode, open);
    run(&s[i + len..j], out, mode, depth + 1);
    tag(out, mode, close);
    Step::Done(j + n)
}

fn strike(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode, depth: usize) -> Step {
    if run_len(s, i, b'~') != 2 || is_space(s.get(i + 2)) {
        return Step::Skip(i + run_len(s, i, b'~'));
    }
    let Some((j, _)) = closer(s, i + 2, b'~', 2) else {
        return Step::Skip(i + 2);
    };
    text(out, before, mode);
    tag(out, mode, "<del>");
    run(&s[i + 2..j], out, mode, depth + 1);
    tag(out, mode, "</del>");
    Step::Done(j + 2)
}

#[cfg(test)]
mod tests {
    use super::{Mode, render};
    use crate::link::safe_url;
    use crate::out::Out;

    fn html(s: &str) -> std::string::String {
        let mut buf = std::vec![0u8; 4096];
        let mut out = Out::new(&mut buf);
        render(s.as_bytes(), &mut out, Mode::Html);
        std::string::String::from_utf8_lossy(out.as_bytes()).into_owned()
    }

    fn raw(s: &str) -> std::string::String {
        let mut buf = std::vec![0u8; 4096];
        let mut out = Out::new(&mut buf);
        render(s.as_bytes(), &mut out, Mode::Raw);
        std::string::String::from_utf8_lossy(out.as_bytes()).into_owned()
    }

    #[test]
    fn enfasis_codigo_y_tachado() {
        assert_eq!(
            html("*a* **b** ***c*** ~~d~~"),
            "<em>a</em> <strong>b</strong> <strong><em>c</em></strong> <del>d</del>"
        );
        assert_eq!(html("**a *b* c**"), "<strong>a <em>b</em> c</strong>");
        assert_eq!(html("*a **b** c*"), "<em>a <strong>b</strong> c</em>");
        assert_eq!(
            html("`a < b` y ``x ` y``"),
            "<code>a &lt; b</code> y <code>x ` y</code>"
        );
        assert_eq!(html("snake_case_name y 2 * 3 * 4"), "snake_case_name y 2 * 3 * 4");
        assert_eq!(html("**sin cierre"), "**sin cierre");
    }

    #[test]
    fn el_html_del_texto_siempre_se_escapa() {
        assert_eq!(
            html("<script>alert(1)</script>"),
            "&lt;script&gt;alert(1)&lt;/script&gt;"
        );
        assert_eq!(
            html("\\*literal\\* & \"comillas\""),
            "*literal* &amp; &quot;comillas&quot;"
        );
    }

    #[test]
    fn enlaces_e_imagenes() {
        assert_eq!(
            html("[VERX](/docs \"Docs\")"),
            "<a href=\"/docs\" title=\"Docs\">VERX</a>"
        );
        assert_eq!(
            html("[**fuerte**](https://bun.sh)"),
            "<a href=\"https://bun.sh\" rel=\"noopener noreferrer\"><strong>fuerte</strong></a>"
        );
        assert_eq!(
            html("![un *gato*](gato.png)"),
            "<img src=\"gato.png\" alt=\"un gato\" loading=\"lazy\" decoding=\"async\">"
        );
        assert_eq!(
            html("<https://bun.sh>"),
            "<a href=\"https://bun.sh\" rel=\"noopener noreferrer\">https://bun.sh</a>"
        );
        assert_eq!(html("a <b> c"), "a &lt;b&gt; c");
    }

    #[test]
    fn urls_peligrosas_quedan_como_texto() {
        assert_eq!(html("[clic](javascript:alert(1))"), "clic");
        assert_eq!(html("[x](JaVaScRiPt:alert(1))"), "x");
        assert!(
            safe_url(b"#ancla") && safe_url(b"../a.md") && safe_url(b"mailto:a@b.c") && safe_url(b"/a:b")
        );
        assert!(!safe_url(b"data:text/html,x") && !safe_url(b"vbscript:x"));
    }

    #[test]
    fn saltos_de_linea() {
        assert_eq!(html("a  \nb\\\nc\nd"), "a<br>\nb<br>\nc\nd");
        assert_eq!(
            raw("Un `título` con [enlace](/x)\ny salto"),
            "Un título con enlace y salto"
        );
    }
}
