//! Frontmatter (`---` … `---` al principio) y anclas de las secciones.
//!
//! El frontmatter es una lista de `clave: valor`. Los valores pueden ser texto
//! (con o sin comillas), números, `true`/`false`/`null` o listas `[a, "b"]`.
//! Sale como un objeto JSON.

use crate::out::Out;

/// Separa el frontmatter (sin las líneas `---`) del cuerpo.
#[must_use]
pub fn split(src: &[u8]) -> (Option<&[u8]>, &[u8]) {
    let Some(rest) = src.strip_prefix(b"---\n") else {
        return (None, src);
    };
    let mut at = 0;
    for line in rest.split(|&b| b == b'\n') {
        if line == b"---" {
            let body = rest.get(at + line.len() + 1..).unwrap_or(&[]);
            return (Some(&rest[..at.saturating_sub(1)]), body);
        }
        at += line.len() + 1;
    }
    (None, src)
}

fn trim(s: &[u8]) -> &[u8] {
    s.trim_ascii()
}

fn unquote(v: &[u8]) -> Option<&[u8]> {
    let (&first, &last) = (v.first()?, v.last()?);
    (v.len() >= 2 && first == last && (first == b'"' || first == b'\'')).then(|| &v[1..v.len() - 1])
}

fn is_number(v: &[u8]) -> bool {
    let digits = v.strip_prefix(b"-").unwrap_or(v);
    !digits.is_empty() && digits.iter().all(|&b| b.is_ascii_digit() || b == b'.') && digits[0] != b'.'
}

fn value(v: &[u8], out: &mut Out<'_>) {
    let v = trim(v);
    if let Some(s) = unquote(v) {
        out.raw(b"\"");
        out.json(s);
        out.raw(b"\"");
    } else if matches!(v, b"true" | b"false" | b"null") || is_number(v) {
        out.raw(v);
    } else {
        out.raw(b"\"");
        out.json(v);
        out.raw(b"\"");
    }
}

/// Escribe el frontmatter como objeto JSON.
pub fn json(front: Option<&[u8]>, out: &mut Out<'_>) {
    out.raw(b"{");
    let mut first = true;
    for line in front.unwrap_or(&[]).split(|&b| b == b'\n') {
        let line = trim(line);
        if line.is_empty() || line[0] == b'#' {
            continue;
        }
        let Some(colon) = line.iter().position(|&b| b == b':') else {
            continue;
        };
        let key = trim(&line[..colon]);
        if key.is_empty()
            || !key
                .iter()
                .all(|&b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            continue;
        }
        if !first {
            out.raw(b",");
        }
        first = false;
        out.raw(b"\"");
        out.json(key);
        out.raw(b"\":");
        let v = trim(&line[colon + 1..]);
        if let Some(items) = v.strip_prefix(b"[").and_then(|v| v.strip_suffix(b"]")) {
            out.raw(b"[");
            for (k, item) in items
                .split(|&b| b == b',')
                .filter(|i| !trim(i).is_empty())
                .enumerate()
            {
                if k > 0 {
                    out.raw(b",");
                }
                value(item, out);
            }
            out.raw(b"]");
        } else {
            value(v, out);
        }
    }
    out.raw(b"}");
}

/// Letra base de un carácter Latin-1 escrito en UTF-8 como `0xC3 b`.
fn latin1(b: u8) -> Option<u8> {
    Some(match b | 0x20 {
        0xA0..=0xA5 => b'a',
        0xA7 => b'c',
        0xA8..=0xAB => b'e',
        0xAC..=0xAF => b'i',
        0xB1 => b'n',
        0xB2..=0xB6 => b'o',
        0xB9..=0xBC => b'u',
        0xBD | 0xBF => b'y',
        _ => return None,
    })
}

/// Anclas únicas por documento: «Estructura de una app» → `estructura-de-una-app`,
/// y la segunda sección con el mismo título, `…-2`.
pub struct Slugs<'a> {
    seen: &'a mut [(u64, u16)],
    len: usize,
}

impl<'a> Slugs<'a> {
    /// Empieza vacío.
    pub fn new(seen: &'a mut [(u64, u16)]) -> Self {
        Self { seen, len: 0 }
    }

    /// Escribe en `out` el ancla de `text` (texto plano, UTF-8).
    pub fn write(&mut self, text: &[u8], out: &mut Out<'_>) {
        let start = out.len();
        let mut dash = false;
        let mut i = 0;
        let mut written = 0;
        while i < text.len() && written < 80 {
            let b = text[i];
            let (c, used) = match b {
                b'A'..=b'Z' => (Some(b + 32), 1),
                b'a'..=b'z' | b'0'..=b'9' => (Some(b), 1),
                0xC3 => (text.get(i + 1).copied().and_then(latin1), 2),
                0xC0.. => (
                    None,
                    1 + text[i + 1..].iter().take_while(|&&c| c & 0xC0 == 0x80).count(),
                ),
                _ => (None, 1),
            };
            match c {
                Some(c) => {
                    if dash && written > 0 {
                        out.raw(b"-");
                        written += 1;
                    }
                    out.raw(&[c]);
                    written += 1;
                    dash = false;
                }
                None => dash = true,
            }
            i += used;
        }
        if written == 0 {
            out.raw(b"seccion");
        }
        let hash = out.as_bytes()[start..]
            .iter()
            .fold(0xcbf2_9ce4_8422_2325_u64, |h, &b| {
                (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
            });
        if let Some(entry) = self.seen[..self.len].iter_mut().find(|e| e.0 == hash) {
            entry.1 += 1;
            out.raw(b"-");
            out.num(usize::from(entry.1));
        } else if let Some(slot) = self.seen.get_mut(self.len) {
            *slot = (hash, 1);
            self.len += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Slugs, json, split};
    use crate::out::Out;

    fn front(src: &str) -> (std::string::String, std::string::String) {
        let (f, body) = split(src.as_bytes());
        let mut buf = std::vec![0u8; 1024];
        let mut out = Out::new(&mut buf);
        json(f, &mut out);
        (
            std::string::String::from_utf8_lossy(out.as_bytes()).into_owned(),
            std::string::String::from_utf8_lossy(body).into_owned(),
        )
    }

    #[test]
    fn frontmatter_a_json() {
        let (meta, body) = front(
            "---\ntitle: \"¿Por qué?\"\nid: 3\ndraft: false\ntags: [bun, \"rust\"]\n# comentario\nnota: dice \"hola\"\n---\n# Hola\n",
        );
        assert_eq!(
            meta,
            r#"{"title":"¿Por qué?","id":3,"draft":false,"tags":["bun","rust"],"nota":"dice \"hola\""}"#
        );
        assert_eq!(body, "# Hola\n");
        assert_eq!(
            front("# Sin frontmatter\n"),
            ("{}".into(), "# Sin frontmatter\n".into())
        );
        assert_eq!(front("---\nsin: cierre\n").0, "{}");
    }

    #[test]
    fn anclas_como_el_sitio_y_unicas() {
        let mut seen = [(0u64, 0u16); 8];
        let mut slugs = Slugs::new(&mut seen);
        let mut buf = [0u8; 256];
        let mut out = Out::new(&mut buf);
        for t in [
            "Estructura de una app",
            "¿Qué es Ñandú?",
            "Listas con <For>",
            "Estructura de una app",
            "!!!",
        ] {
            slugs.write(t.as_bytes(), &mut out);
            out.raw(b" ");
        }
        assert_eq!(
            out.as_bytes(),
            b"estructura-de-una-app que-es-nandu listas-con-for estructura-de-una-app-2 seccion "
        );
    }
}
