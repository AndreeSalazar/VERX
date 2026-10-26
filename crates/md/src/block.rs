//! Bloques: títulos (con ancla), párrafos, código resaltado, citas y avisos
//! (`> [!NOTE]`), listas anidadas con tareas, tablas y separadores.

use crate::front::Slugs;
use crate::highlight::highlight;
use crate::inline::{self, Mode};
use crate::lines::{Lines, blank, fence, heading, indent, interrupts, item, quote, rule};
use crate::out::Out;
use crate::table::{is_delimiter, table};

const MAX_NESTING: usize = 8;

/// Palabras de un texto (rachas de letras o dígitos), para el tiempo de lectura.
#[must_use]
pub fn words(s: &[u8]) -> usize {
    let word = |b: u8| b.is_ascii_alphanumeric() || b >= 0x80;
    s.iter()
        .enumerate()
        .filter(|&(i, &b)| word(b) && (i == 0 || !word(s[i - 1])))
        .count()
}

fn push(buf: &mut [u8], len: &mut usize, s: &[u8]) {
    let n = s.len().min(buf.len() - *len);
    buf[*len..*len + n].copy_from_slice(&s[..n]);
    *len += n;
}

/// Un documento en curso: HTML, índice de títulos (entradas JSON) y memoria de trabajo.
pub struct Doc<'a> {
    /// HTML del documento.
    pub html: Out<'a>,
    /// Entradas JSON del índice de títulos, separadas por comas.
    pub toc: Out<'a>,
    /// Palabras del texto (para el tiempo de lectura).
    pub words: usize,
    scratch: &'a mut [u8],
    plain: &'a mut [u8],
    slugs: Slugs<'a>,
    headings: usize,
}

impl<'a> Doc<'a> {
    /// Prepara un documento sobre la memoria dada.
    pub fn new(
        html: &'a mut [u8],
        toc: &'a mut [u8],
        scratch: &'a mut [u8],
        plain: &'a mut [u8],
        seen: &'a mut [(u64, u16)],
    ) -> Self {
        Self {
            html: Out::new(html),
            toc: Out::new(toc),
            words: 0,
            scratch,
            plain,
            slugs: Slugs::new(seen),
            headings: 0,
        }
    }

    /// Renderiza el cuerpo (sin frontmatter).
    pub fn render(&mut self, body: &[u8]) {
        let mut lines = Lines::new(body);
        while let Some(line) = lines.peek() {
            if blank(line) {
                lines.advance();
            } else if let Some((level, text)) = heading(line) {
                lines.advance();
                self.heading(level, text);
            } else if let Some((c, n, info)) = fence(line) {
                lines.advance();
                self.code(&mut lines, c, n, info);
            } else if rule(line) {
                lines.advance();
                self.html.str("<hr>\n");
            } else if quote(line) {
                self.quote(&mut lines);
            } else if let Some(it) = item(line) {
                self.list(&mut lines, it.indent, 0);
            } else if line.contains(&b'|') && lines.peek_after().is_some_and(is_delimiter) {
                self.words += table(&mut lines, &mut self.html);
            } else {
                self.paragraph(&mut lines);
            }
        }
    }

    fn heading(&mut self, level: usize, text: &[u8]) {
        let mut plain = Out::new(&mut *self.plain);
        inline::render(text, &mut plain, Mode::Raw);
        let mut id_buf = [0u8; 100];
        let mut id = Out::new(&mut id_buf);
        self.slugs.write(plain.as_bytes(), &mut id);
        let h = [b'h', b'0' + level as u8];
        self.html.raw(b"<");
        self.html.raw(&h);
        self.html.str(" id=\"");
        self.html.raw(id.as_bytes());
        self.html.str("\">");
        inline::render(text, &mut self.html, Mode::Html);
        self.html.str("<a class=\"anchor\" href=\"#");
        self.html.raw(id.as_bytes());
        self.html.str("\" aria-label=\"Enlace a esta sección\">#</a></");
        self.html.raw(&h);
        self.html.str(">\n");
        if self.headings > 0 {
            self.toc.raw(b",");
        }
        self.toc.str("{\"level\":");
        self.toc.num(level);
        self.toc.str(",\"id\":\"");
        self.toc.raw(id.as_bytes());
        self.toc.str("\",\"text\":\"");
        self.toc.json(plain.as_bytes());
        self.toc.str("\"}");
        self.headings += 1;
        self.words += words(text);
    }

    fn paragraph(&mut self, lines: &mut Lines<'_>) {
        let (mut start, mut end) = (usize::MAX, 0);
        while let Some(line) = lines.peek() {
            if blank(line) || (start != usize::MAX && interrupts(line)) {
                break;
            }
            let Some((at, line)) = lines.advance() else { break };
            start = start.min(at);
            end = at + line.len();
        }
        let text = lines.s[start.min(end)..end].trim_ascii();
        self.html.str("<p>");
        inline::render(text, &mut self.html, Mode::Html);
        self.html.str("</p>\n");
        self.words += words(text);
    }

    fn code(&mut self, lines: &mut Lines<'_>, c: u8, n: usize, info: &[u8]) {
        let start = lines.pos.min(lines.s.len());
        let mut end = lines.s.len();
        while let Some((at, line)) = lines.advance() {
            if fence(line).is_some_and(|(c2, n2, rest)| c2 == c && n2 >= n && rest.is_empty()) {
                end = at;
                break;
            }
        }
        let content = &lines.s[start..end.max(start)];
        let content = content.strip_suffix(b"\n").unwrap_or(content);
        let lang = info.split(|&b| b == b' ').next().unwrap_or(&[]);
        let title = info.windows(7).position(|w| w == b"title=\"").and_then(|at| {
            let rest = &info[at + 7..];
            rest.iter().position(|&b| b == b'"').map(|end| &rest[..end])
        });
        self.html.str("<figure class=\"code\">");
        if let Some(title) = title {
            self.html.str("<figcaption>");
            self.html.text(title);
            self.html.str("</figcaption>");
        }
        self.html.str("<pre data-lang=\"");
        self.html.text(lang);
        self.html.str("\"><code>");
        highlight(lang, content, &mut self.html);
        self.html.str("</code></pre></figure>\n");
    }

    fn quote(&mut self, lines: &mut Lines<'_>) {
        let mut len = 0;
        while let Some(line) = lines.peek().filter(|l| quote(l)) {
            lines.advance();
            let t = &line[indent(line) + 1..];
            push(self.scratch, &mut len, t.strip_prefix(b" ").unwrap_or(t));
            push(self.scratch, &mut len, b"\n");
        }
        let text = &self.scratch[..len];
        let first_line = text.split(|&b| b == b'\n').next().unwrap_or(&[]);
        let first = first_line.trim_ascii();
        let kinds: [(&[u8], &str, &str); 5] = [
            (b"[!NOTE]", "note", "Nota"),
            (b"[!TIP]", "tip", "Consejo"),
            (b"[!IMPORTANT]", "important", "Importante"),
            (b"[!WARNING]", "warning", "Atención"),
            (b"[!CAUTION]", "caution", "Cuidado"),
        ];
        let callout = kinds.iter().find(|(tag, _, _)| first.eq_ignore_ascii_case(tag));
        let body = if let Some((_, class, label)) = callout {
            self.html.str("<aside class=\"callout ");
            self.html.str(class);
            self.html.str("\" role=\"note\"><p class=\"callout-title\">");
            self.html.str(label);
            self.html.str("</p>\n");
            text.get(first_line.len() + 1..).unwrap_or(&[])
        } else {
            self.html.str("<blockquote>\n");
            text
        };
        let mut rest = body;
        while !rest.is_empty() {
            let cut = rest.windows(2).position(|w| w == b"\n\n").unwrap_or(rest.len());
            let para = rest[..cut].trim_ascii();
            if !para.is_empty() {
                self.html.str("<p>");
                inline::render(para, &mut self.html, Mode::Html);
                self.html.str("</p>\n");
                self.words += words(para);
            }
            rest = rest.get(cut + 2..).unwrap_or(&[]);
        }
        self.html.str(if callout.is_some() {
            "</aside>\n"
        } else {
            "</blockquote>\n"
        });
    }

    fn list(&mut self, lines: &mut Lines<'_>, base: usize, depth: usize) {
        let Some(first) = lines.peek().and_then(item) else {
            return;
        };
        let ordered = first.ordered;
        if !ordered {
            self.html.str("<ul>\n");
        } else if first.start == 1 {
            self.html.str("<ol>\n");
        } else {
            self.html.str("<ol start=\"");
            self.html.num(first.start);
            self.html.str("\">\n");
        }
        let mut open = false;
        while let Some(line) = lines.peek() {
            if blank(line) {
                // La lista sigue si tras las líneas en blanco viene otro de sus elementos.
                let mut probe = *lines;
                while probe.peek().is_some_and(blank) {
                    probe.advance();
                }
                match probe.peek().and_then(item) {
                    Some(it) if it.indent >= base && (it.indent > base + 1 || it.ordered == ordered) => {
                        *lines = probe;
                    }
                    _ => break,
                }
                continue;
            }
            let Some(it) = item(line) else { break };
            if it.indent < base {
                break;
            }
            let nested = it.indent > base + 1;
            if nested && open && depth < MAX_NESTING {
                self.list(lines, it.indent, depth + 1);
                continue;
            }
            if !nested && it.ordered != ordered {
                break;
            }
            lines.advance();
            if open {
                self.html.str("</li>\n");
            }
            let mut len = 0;
            push(self.scratch, &mut len, it.content);
            while let Some(next) = lines.peek() {
                if blank(next) || interrupts(next) {
                    break;
                }
                lines.advance();
                push(self.scratch, &mut len, b"\n");
                push(self.scratch, &mut len, next.trim_ascii_start());
            }
            let text = &self.scratch[..len];
            let task = [(&b"[ ] "[..], false), (b"[x] ", true), (b"[X] ", true)]
                .into_iter()
                .find(|(p, _)| text.starts_with(p));
            if let Some((_, done)) = task {
                self.html
                    .str("<li class=\"task\"><input type=\"checkbox\" disabled");
                self.html.str(if done { " checked> " } else { "> " });
                inline::render(&text[4..], &mut self.html, Mode::Html);
            } else {
                self.html.str("<li>");
                inline::render(text, &mut self.html, Mode::Html);
            }
            self.words += words(text);
            open = true;
        }
        if open {
            self.html.str("</li>\n");
        }
        self.html.str(if ordered { "</ol>\n" } else { "</ul>\n" });
    }
}
