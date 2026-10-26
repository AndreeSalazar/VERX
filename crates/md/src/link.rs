//! Enlaces, imágenes y autoenlaces. Un `href`/`src` sólo se conserva si es
//! relativo, un ancla o usa http, https o mailto (nada de `javascript:`); si
//! no, queda sólo el texto.

use crate::inline::{Mode, Step, run, skip_code, text};
use crate::out::Out;

/// Partes de `[texto](url "título")` que empieza en `at` (el `[`).
struct Target {
    text: (usize, usize),
    url: (usize, usize),
    title: Option<(usize, usize)>,
    end: usize,
}

fn target(s: &[u8], at: usize) -> Option<Target> {
    let mut j = at + 1;
    let mut nest = 0;
    loop {
        match *s.get(j)? {
            b'\\' => j += 1,
            b'`' => j = skip_code(s, j) - 1,
            b'[' => nest += 1,
            b']' if nest == 0 => break,
            b']' => nest -= 1,
            _ => {}
        }
        j += 1;
    }
    let text = (at + 1, j);
    if s.get(j + 1) != Some(&b'(') {
        return None;
    }
    let mut k = j + 2;
    while s.get(k) == Some(&b' ') {
        k += 1;
    }
    let url = if s.get(k) == Some(&b'<') {
        let start = k + 1;
        k = start + s[start..].iter().position(|&b| b == b'>' || b == b'\n')?;
        if s[k] != b'>' {
            return None;
        }
        k += 1;
        (start, k - 1)
    } else {
        let start = k;
        let mut parens = 0;
        while let Some(&b) = s.get(k) {
            match b {
                b'(' => parens += 1,
                b')' if parens == 0 => break,
                b')' => parens -= 1,
                b if b.is_ascii_whitespace() => break,
                _ => {}
            }
            k += 1;
        }
        (start, k)
    };
    while s.get(k) == Some(&b' ') {
        k += 1;
    }
    let mut title = None;
    if let Some(&q @ (b'"' | b'\'')) = s.get(k) {
        let start = k + 1;
        let close = start + s[start..].iter().position(|&b| b == q)?;
        title = Some((start, close));
        k = close + 1;
        while s.get(k) == Some(&b' ') {
            k += 1;
        }
    }
    (s.get(k) == Some(&b')')).then_some(Target {
        text,
        url,
        title,
        end: k + 1,
    })
}

/// ¿Se puede usar como `href`/`src`? Relativos, anclas, http, https y mailto.
#[must_use]
pub(crate) fn safe_url(url: &[u8]) -> bool {
    let colon = url.iter().position(|&b| b == b':');
    let stop = url.iter().position(|&b| matches!(b, b'/' | b'?' | b'#'));
    match colon {
        None => true,
        Some(c) if stop.is_some_and(|s| s < c) => true,
        Some(c) => [&b"http"[..], b"https", b"mailto"]
            .iter()
            .any(|scheme| url[..c].eq_ignore_ascii_case(scheme)),
    }
}

fn is_external(url: &[u8]) -> bool {
    url.len() > 4 && url[..4].eq_ignore_ascii_case(b"http")
}

pub(crate) fn link(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode, depth: usize) -> Step {
    let Some(t) = target(s, i) else {
        return Step::Skip(i + 1);
    };
    let url = &s[t.url.0..t.url.1];
    text(out, before, mode);
    let linked = mode == Mode::Html && safe_url(url);
    if linked {
        out.str("<a href=\"");
        out.text(url);
        out.raw(b"\"");
        if let Some((a, b)) = t.title {
            out.str(" title=\"");
            out.text(&s[a..b]);
            out.raw(b"\"");
        }
        if is_external(url) {
            out.str(" rel=\"noopener noreferrer\"");
        }
        out.raw(b">");
    }
    run(&s[t.text.0..t.text.1], out, mode, depth + 1);
    if linked {
        out.str("</a>");
    }
    Step::Done(t.end)
}

pub(crate) fn image(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode) -> Step {
    let Some(t) = target(s, i + 1) else {
        return Step::Skip(i + 1);
    };
    let src = &s[t.url.0..t.url.1];
    let alt = &s[t.text.0..t.text.1];
    text(out, before, mode);
    if mode == Mode::Html && safe_url(src) {
        out.str("<img src=\"");
        out.text(src);
        out.str("\" alt=\"");
        run(alt, out, Mode::Text, 0);
        out.raw(b"\"");
        if let Some((a, b)) = t.title {
            out.str(" title=\"");
            out.text(&s[a..b]);
            out.raw(b"\"");
        }
        out.str(" loading=\"lazy\" decoding=\"async\">");
    } else {
        run(alt, out, mode, 0);
    }
    Step::Done(t.end)
}

pub(crate) fn autolink(s: &[u8], i: usize, before: &[u8], out: &mut Out<'_>, mode: Mode) -> Step {
    let rest = &s[i + 1..];
    let Some(end) = rest
        .iter()
        .position(|&b| b == b'>' || b.is_ascii_whitespace() || b == b'<')
    else {
        return Step::Skip(i + 1);
    };
    let url = &rest[..end];
    let schemed = url.iter().position(|&b| b == b':').is_some_and(|c| c > 1);
    if rest[end] != b'>' || !schemed || !safe_url(url) {
        return Step::Skip(i + 1);
    }
    text(out, before, mode);
    if mode == Mode::Html {
        out.str("<a href=\"");
        out.text(url);
        out.str("\" rel=\"noopener noreferrer\">");
        out.text(url);
        out.str("</a>");
    } else {
        text(out, url, mode);
    }
    Step::Done(i + end + 2)
}
