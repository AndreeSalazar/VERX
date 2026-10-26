//! Recorrido por líneas y reconocimiento de cada tipo de bloque.

/// Cursor sobre las líneas de un texto (sin el `\n`). Es `Copy`: se puede mirar
/// por delante con una copia y quedarse con ella si conviene.
#[derive(Clone, Copy)]
pub struct Lines<'s> {
    /// El texto entero.
    pub s: &'s [u8],
    /// Inicio de la línea actual.
    pub pos: usize,
}

impl<'s> Lines<'s> {
    /// Desde el principio de `s`.
    #[must_use]
    pub fn new(s: &'s [u8]) -> Self {
        Self { s, pos: 0 }
    }

    /// La línea actual, sin avanzar.
    #[must_use]
    pub fn peek(&self) -> Option<&'s [u8]> {
        let rest = self.s.get(self.pos..).filter(|r| !r.is_empty())?;
        Some(&rest[..rest.iter().position(|&b| b == b'\n').unwrap_or(rest.len())])
    }

    /// La línea siguiente a la actual.
    #[must_use]
    pub fn peek_after(&self) -> Option<&'s [u8]> {
        let mut copy = *self;
        copy.advance()?;
        copy.peek()
    }

    /// Avanza y devuelve `(posición, línea)`.
    pub fn advance(&mut self) -> Option<(usize, &'s [u8])> {
        let line = self.peek()?;
        let at = self.pos;
        self.pos += line.len() + 1;
        Some((at, line))
    }
}

/// Espacios al principio.
#[must_use]
pub fn indent(l: &[u8]) -> usize {
    l.iter().take_while(|&&b| b == b' ').count()
}

/// ¿Línea vacía o sólo espacios?
#[must_use]
pub fn blank(l: &[u8]) -> bool {
    l.iter().all(u8::is_ascii_whitespace)
}

fn body(l: &[u8]) -> Option<&[u8]> {
    let n = indent(l);
    (n <= 3).then(|| &l[n..])
}

/// `## Título` → `(2, "Título")` (sin los `#` finales opcionales).
#[must_use]
pub fn heading(l: &[u8]) -> Option<(usize, &[u8])> {
    let t = body(l)?;
    let n = t.iter().take_while(|&&b| b == b'#').count();
    if n == 0 || n > 6 || t.get(n).is_some_and(|&b| b != b' ') {
        return None;
    }
    let mut text = t[n..].trim_ascii();
    let closing = text.iter().rev().take_while(|&&b| b == b'#').count();
    if closing > 0 && (closing == text.len() || text[text.len() - closing - 1] == b' ') {
        text = text[..text.len() - closing].trim_ascii();
    }
    Some((n, text))
}

/// Valla de código: ```` ``` ```` o `~~~` → `(carácter, longitud, info)`.
#[must_use]
pub fn fence(l: &[u8]) -> Option<(u8, usize, &[u8])> {
    let t = body(l)?;
    let c = *t.first()?;
    if c != b'`' && c != b'~' {
        return None;
    }
    let n = t.iter().take_while(|&&b| b == c).count();
    let info = t[n..].trim_ascii();
    (n >= 3 && !(c == b'`' && info.contains(&b'`'))).then_some((c, n, info))
}

/// Separador: tres o más `-`, `*` o `_` (con espacios entre medias, si se quiere).
#[must_use]
pub fn rule(l: &[u8]) -> bool {
    let Some(t) = body(l) else { return false };
    let Some(&c) = t.first().filter(|&&c| matches!(c, b'-' | b'*' | b'_')) else {
        return false;
    };
    t.iter().all(|&b| b == c || b == b' ') && t.split(|&b| b == c).count() > 3
}

/// ¿Empieza por `>`?
#[must_use]
pub fn quote(l: &[u8]) -> bool {
    body(l).is_some_and(|t| t.first() == Some(&b'>'))
}

/// Un elemento de lista.
#[derive(Clone, Copy)]
pub struct Item<'s> {
    /// Espacios antes del marcador.
    pub indent: usize,
    /// ¿Numerada (`1.`) o con viñeta (`-`)?
    pub ordered: bool,
    /// Número inicial (listas numeradas).
    pub start: usize,
    /// Texto tras el marcador.
    pub content: &'s [u8],
}

/// `- algo`, `* algo`, `+ algo` o `3. algo` / `3) algo`.
#[must_use]
pub fn item(l: &[u8]) -> Option<Item<'_>> {
    let n = indent(l);
    let t = &l[n..];
    let spaced = |at: usize| t.get(at).is_none_or(|&b| b == b' ');
    if matches!(t.first(), Some(b'-' | b'*' | b'+')) && spaced(1) && !rule(l) {
        return Some(Item {
            indent: n,
            ordered: false,
            start: 1,
            content: t[1..].trim_ascii(),
        });
    }
    let digits = t.iter().take_while(|b| b.is_ascii_digit()).count();
    if (1..=9).contains(&digits) && matches!(t.get(digits), Some(b'.' | b')')) && spaced(digits + 1) {
        let start = t[..digits]
            .iter()
            .fold(0, |acc, &d| acc * 10 + usize::from(d - b'0'));
        return Some(Item {
            indent: n,
            ordered: true,
            start,
            content: t[digits + 1..].trim_ascii(),
        });
    }
    None
}

/// ¿Esta línea corta un párrafo (empieza otro bloque)?
#[must_use]
pub fn interrupts(l: &[u8]) -> bool {
    heading(l).is_some() || fence(l).is_some() || rule(l) || quote(l) || item(l).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconoce_cada_bloque() {
        assert_eq!(heading(b"## Hola ##"), Some((2, &b"Hola"[..])));
        assert_eq!(heading(b"#hashtag"), None);
        assert_eq!(heading(b"####### siete"), None);
        assert_eq!(
            fence(b"```js title=\"a.js\""),
            Some((b'`', 3, &b"js title=\"a.js\""[..]))
        );
        assert!(fence(b"``").is_none());
        assert!(rule(b"---") && rule(b"* * *") && !rule(b"--") && !rule(b"- a"));
        let it = item(b"  12. doce");
        assert!(it.is_some_and(|i| i.ordered && i.start == 12 && i.indent == 2 && i.content == b"doce"));
        assert!(item(b"-sin espacio").is_none() && item(b"- [x] hecho").is_some());
    }

    #[test]
    fn cursor_de_lineas() {
        let mut lines = Lines::new(b"a\n\nb");
        assert_eq!(lines.peek_after(), Some(&b""[..]));
        assert_eq!(lines.advance(), Some((0, &b"a"[..])));
        assert_eq!(lines.advance(), Some((2, &b""[..])));
        assert_eq!(lines.advance(), Some((3, &b"b"[..])));
        assert_eq!(lines.advance(), None);
    }
}
