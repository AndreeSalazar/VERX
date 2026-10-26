//! Tablas al estilo de GitHub: fila de cabecera, fila de alineación
//! (`:--`, `:-:`, `--:`) y filas hasta la primera línea sin `|`.

use crate::inline::{self, Mode};
use crate::lines::{Lines, blank};
use crate::out::Out;

const MAX_COLS: usize = 32;

/// Celdas de una fila: separa por `|` que no esté escapado ni dentro de `código`.
struct Cells<'s> {
    s: &'s [u8],
    pos: usize,
}

fn cells(line: &[u8]) -> Cells<'_> {
    let mut s = line.trim_ascii();
    s = s.strip_prefix(b"|").unwrap_or(s);
    if s.ends_with(b"|") && !s.ends_with(b"\\|") {
        s = &s[..s.len() - 1];
    }
    Cells { s, pos: 0 }
}

impl<'s> Iterator for Cells<'s> {
    type Item = &'s [u8];

    fn next(&mut self) -> Option<&'s [u8]> {
        if self.pos > self.s.len() {
            return None;
        }
        let mut j = self.pos;
        let mut code = false;
        while j < self.s.len() {
            match self.s[j] {
                b'\\' => j += 1,
                b'`' => code = !code,
                b'|' if !code => break,
                _ => {}
            }
            j += 1;
        }
        let j = j.min(self.s.len());
        let cell = self.s[self.pos..j].trim_ascii();
        self.pos = j + 1;
        Some(cell)
    }
}

/// ¿Es una fila de alineación (`| --- | :-: |`)?
#[must_use]
pub fn is_delimiter(line: &[u8]) -> bool {
    line.contains(&b'|')
        && line.contains(&b'-')
        && line.iter().all(|&b| matches!(b, b'|' | b':' | b'-' | b' '))
}

fn align(cell: &[u8]) -> &'static str {
    match (cell.first() == Some(&b':'), cell.last() == Some(&b':')) {
        (true, true) => " style=\"text-align:center\"",
        (false, true) => " style=\"text-align:right\"",
        _ => "",
    }
}

fn row(out: &mut Out<'_>, line: &[u8], tag: &str, aligns: &[&'static str]) -> usize {
    out.str("<tr>");
    let mut words = 0;
    let mut written = 0;
    for (k, cell) in cells(line).take(aligns.len()).enumerate() {
        out.str("<");
        out.str(tag);
        out.str(aligns[k]);
        out.str(">");
        inline::render(cell, out, Mode::Html);
        out.str("</");
        out.str(tag);
        out.str(">");
        words += crate::block::words(cell);
        written += 1;
    }
    for _ in written..aligns.len() {
        out.str("<td></td>");
    }
    out.str("</tr>\n");
    words
}

/// Renderiza la tabla que empieza en la línea actual. Devuelve sus palabras.
pub fn table(lines: &mut Lines<'_>, out: &mut Out<'_>) -> usize {
    let (Some((_, head)), Some((_, delim))) = (lines.advance(), lines.advance()) else {
        return 0;
    };
    let mut aligns = [""; MAX_COLS];
    let mut cols = 0;
    for cell in cells(delim).take(MAX_COLS) {
        aligns[cols] = align(cell);
        cols += 1;
    }
    let aligns = &aligns[..cols];
    out.str("<div class=\"table-wrap\"><table>\n<thead>");
    let mut words = row(out, head, "th", aligns);
    out.str("</thead>\n<tbody>\n");
    while let Some(line) = lines.peek() {
        if blank(line) || !line.contains(&b'|') {
            break;
        }
        lines.advance();
        words += row(out, line, "td", aligns);
    }
    out.str("</tbody>\n</table></div>\n");
    words
}

#[cfg(test)]
mod tests {
    use super::{cells, is_delimiter};

    #[test]
    fn celdas_con_escapes_y_codigo() {
        let got: std::vec::Vec<&[u8]> = cells(b"| a | `x|y` | b\\|c |").collect();
        assert_eq!(got, [&b"a"[..], b"`x|y`", b"b\\|c"]);
        assert!(is_delimiter(b"|:--|:-:|--:|") && !is_delimiter(b"| a | b |"));
    }
}
