//! Texto → términos. Todo ocurre en el mismo buffer: normalizar nunca alarga
//! el texto (una letra acentuada de 2 bytes pasa a 1), así que no hace falta memoria extra.
//!
//! - minúsculas y sin acentos: «Función» → `funcion`, «Ñandú» → `nandu`;
//! - un término es una racha de `[a-z0-9]` (como mucho [`MAX_TERM`] bytes);
//! - se ignoran las palabras vacías del español y las de una letra;
//! - plurales sencillos: `reglas` → `regla`, `funciones` → `funcion`.

/// Separa documentos en el texto de entrada.
pub const DOC_SEP: u8 = 0x1E;
/// Separa el título del cuerpo dentro de un documento.
pub const FIELD_SEP: u8 = 0x1F;
/// Longitud máxima de un término (el resto se descarta).
pub const MAX_TERM: usize = 24;

const STOPWORDS: [&[u8]; 44] = [
    b"al", b"como", b"con", b"cual", b"de", b"del", b"desde", b"el", b"ella", b"en", b"entre", b"era", b"es",
    b"esta", b"este", b"esto", b"fue", b"ha", b"hay", b"la", b"las", b"le", b"lo", b"los", b"mas", b"muy",
    b"no", b"nos", b"para", b"pero", b"por", b"que", b"se", b"si", b"sin", b"sobre", b"son", b"su", b"sus",
    b"tambien", b"un", b"una", b"uno", b"ya",
];

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

/// Normaliza `text` en su sitio y devuelve la nueva longitud. Queda sólo
/// `[a-z0-9]`, espacios y los separadores [`DOC_SEP`] / [`FIELD_SEP`].
pub fn normalize(text: &mut [u8]) -> usize {
    let (mut r, mut w) = (0, 0);
    while r < text.len() {
        let b = text[r];
        let (out, used) = match b {
            b'A'..=b'Z' => (b + 32, 1),
            b'a'..=b'z' | b'0'..=b'9' | DOC_SEP | FIELD_SEP => (b, 1),
            0xC3 => match text.get(r + 1).copied().and_then(latin1) {
                Some(base) => (base, 2),
                None => (b' ', 2),
            },
            // Otro carácter multibyte: se salta entero (sus bytes de continuación 10xxxxxx).
            0xC0.. => (
                b' ',
                1 + text[r + 1..].iter().take_while(|c| **c & 0xC0 == 0x80).count(),
            ),
            _ => (b' ', 1),
        };
        text[w] = out;
        w += 1;
        r += used;
    }
    w
}

/// Longitud del término tras quitar el plural (sobre texto ya normalizado).
#[must_use]
pub fn stem(term: &[u8]) -> usize {
    let n = term.len();
    match term {
        [.., c, b'e', b's'] if n > 5 && matches!(c, b'n' | b'r' | b'l' | b'd') => n - 2,
        [.., b's'] if n > 4 => n - 1,
        _ => n,
    }
}

/// ¿Es una palabra que no aporta nada a la búsqueda?
#[must_use]
pub fn is_stopword(term: &[u8]) -> bool {
    term.len() < 2 || STOPWORDS.binary_search(&term).is_ok()
}

/// Un término dentro del texto normalizado.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Token {
    /// Posición del primer byte.
    pub start: usize,
    /// Longitud ya recortada (plural y [`MAX_TERM`]).
    pub len: usize,
    /// Documento (cuenta los [`DOC_SEP`] anteriores).
    pub doc: usize,
    /// `true` si está en el título (antes del [`FIELD_SEP`]).
    pub title: bool,
}

/// Recorre los términos útiles de un texto ya normalizado.
pub struct Tokens<'a> {
    text: &'a [u8],
    pos: usize,
    doc: usize,
    title: bool,
}

impl<'a> Tokens<'a> {
    /// Empieza por el título del documento 0.
    #[must_use]
    pub fn new(text: &'a [u8]) -> Self {
        Self {
            text,
            pos: 0,
            doc: 0,
            title: true,
        }
    }
}

impl Iterator for Tokens<'_> {
    type Item = Token;

    fn next(&mut self) -> Option<Token> {
        loop {
            while let Some(&b) = self.text.get(self.pos) {
                if b.is_ascii_alphanumeric() {
                    break;
                }
                if b == DOC_SEP {
                    self.doc += 1;
                    self.title = true;
                } else if b == FIELD_SEP {
                    self.title = false;
                }
                self.pos += 1;
            }
            let start = self.pos;
            let rest = self.text.get(start..)?;
            if rest.is_empty() {
                return None;
            }
            let len = rest.iter().take_while(|b| b.is_ascii_alphanumeric()).count();
            self.pos += len;
            let word = &rest[..len];
            if is_stopword(word) {
                continue;
            }
            let len = stem(word).min(MAX_TERM);
            return Some(Token {
                start,
                len,
                doc: self.doc,
                title: self.title,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn norm(s: &str) -> std::string::String {
        let mut bytes = s.as_bytes().to_vec();
        let n = normalize(&mut bytes);
        std::string::String::from_utf8_lossy(&bytes[..n]).into_owned()
    }

    fn terms(s: &str) -> std::vec::Vec<std::string::String> {
        let mut bytes = s.as_bytes().to_vec();
        let n = normalize(&mut bytes);
        Tokens::new(&bytes[..n])
            .map(|t| std::string::String::from_utf8_lossy(&bytes[t.start..t.start + t.len]).into_owned())
            .collect()
    }

    #[test]
    fn quita_acentos_y_mayusculas() {
        assert_eq!(norm("Función Ñandú ÁÉÍÓÚ Über"), "funcion nandu aeiou uber");
        assert_eq!(norm("Rust→WASM 3D"), "rust wasm 3d");
        assert_eq!(norm("日本 x"), "   x"); // cada carácter ajeno, un solo espacio
    }

    #[test]
    fn palabras_vacias_y_plurales() {
        assert_eq!(terms("Las reglas de los paquetes"), ["regla", "paquete"]);
        assert_eq!(
            terms("funciones servidores islas a y o"),
            ["funcion", "servidor", "isla"]
        );
        assert_eq!(terms("bus más"), ["bus"]);
    }

    #[test]
    fn la_lista_de_palabras_vacias_esta_ordenada() {
        assert!(STOPWORDS.is_sorted());
    }

    #[test]
    fn separa_documentos_y_campos() {
        let mut bytes = b"Hola\x1Fmundo\x1Eadios\x1Fgente".to_vec();
        let n = normalize(&mut bytes);
        let docs: std::vec::Vec<(usize, bool)> = Tokens::new(&bytes[..n]).map(|t| (t.doc, t.title)).collect();
        assert_eq!(docs, [(0, true), (0, false), (1, true), (1, false)]);
    }

    #[test]
    fn recorta_terminos_largos() {
        let t = terms("supercalifragilisticoespialidoso");
        assert_eq!(t[0].len(), MAX_TERM);
    }
}
