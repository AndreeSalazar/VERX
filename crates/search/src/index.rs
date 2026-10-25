//! Índice invertido, formato `VXS1` (little-endian, sin alineación):
//!
//! ```text
//! "VXS1" · docs u32 · terms u32 · postings u32
//! lengths       docs × u16          términos de cada documento (para BM25)
//! term_offsets  (terms + 1) × u32   inicio de cada término en `strings`
//! post_starts   (terms + 1) × u32   primera entrada de cada término en `postings`
//! strings       bytes de los términos, ordenados y sin separador
//! postings      postings × (doc u16, tf u16)   bit alto de tf = aparece en el título
//! ```
//!
//! Los términos están ordenados: buscar un prefijo es una búsqueda binaria.

use core::cmp::Ordering;

use crate::text::{self, Tokens};

/// Cabecera mágica del formato.
pub const MAGIC: &[u8; 4] = b"VXS1";
const HEADER: usize = 16;
/// Bit de `tf` que marca que el término aparece en el título.
pub const IN_TITLE: u16 = 0x8000;

/// Una aparición de un término durante la construcción.
#[derive(Clone, Copy, Debug, Default)]
pub struct Occurrence {
    start: u32,
    len: u8,
    title: bool,
    doc: u16,
}

impl Occurrence {
    /// Aparición vacía (para inicializar memoria estática).
    pub const ZERO: Self = Self {
        start: 0,
        len: 0,
        title: false,
        doc: 0,
    };
}

/// Errores al construir un índice.
#[derive(Debug, PartialEq, Eq)]
pub enum BuildError {
    /// Más documentos de los que caben en `u16`.
    TooManyDocs,
    /// Más apariciones que el buffer de trabajo.
    TooManyOccurrences,
    /// El índice no cabe en el buffer de salida.
    OutputFull,
}

/// Heapsort en su sitio: O(n log n), sin memoria extra y con muy poco código
/// (el `sort_unstable` de `core` triplicaba el tamaño del `.wasm`).
fn heapsort<T: Copy>(v: &mut [T], less: impl Fn(&T, &T) -> bool) {
    let sift = |v: &mut [T], mut root: usize, end: usize| {
        loop {
            let mut child = 2 * root + 1;
            if child >= end {
                break;
            }
            if child + 1 < end && less(&v[child], &v[child + 1]) {
                child += 1;
            }
            if !less(&v[root], &v[child]) {
                break;
            }
            v.swap(root, child);
            root = child;
        }
    };
    for start in (0..v.len() / 2).rev() {
        sift(v, start, v.len());
    }
    for end in (1..v.len()).rev() {
        v.swap(0, end);
        sift(v, 0, end);
    }
}

fn put(out: &mut [u8], at: usize, v: u32) {
    out[at..at + 4].copy_from_slice(&v.to_le_bytes());
}

fn u32_at(bytes: &[u8], at: usize) -> Option<usize> {
    let b = bytes.get(at..at + 4)?;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
}

/// Construye el índice de `input` (texto UTF-8 con [`text::DOC_SEP`] entre
/// documentos y [`text::FIELD_SEP`] entre título y cuerpo). Normaliza `input`
/// en su sitio, usa `scratch` como memoria de trabajo y escribe en `out`.
///
/// # Errors
/// Si se supera cualquiera de las capacidades (ver [`BuildError`]).
pub fn build(input: &mut [u8], scratch: &mut [Occurrence], out: &mut [u8]) -> Result<usize, BuildError> {
    let n = text::normalize(input);
    let input = &input[..n];
    let docs = if n == 0 {
        0
    } else {
        input.split(|b| *b == text::DOC_SEP).count()
    };
    if docs > usize::from(u16::MAX) {
        return Err(BuildError::TooManyDocs);
    }
    // Las longitudes van justo tras la cabecera: se rellenan antes de ordenar.
    let offsets_at = HEADER + docs * 2;
    if offsets_at > out.len() {
        return Err(BuildError::OutputFull);
    }
    out[HEADER..offsets_at].fill(0);

    let mut count = 0;
    for t in Tokens::new(input) {
        let slot = scratch.get_mut(count).ok_or(BuildError::TooManyOccurrences)?;
        *slot = Occurrence {
            start: t.start as u32,
            len: t.len as u8,
            title: t.title,
            doc: t.doc as u16,
        };
        let at = HEADER + t.doc * 2;
        let len = u16::from_le_bytes([out[at], out[at + 1]]).saturating_add(1);
        out[at..at + 2].copy_from_slice(&len.to_le_bytes());
        count += 1;
    }
    let occ = &mut scratch[..count];
    let term = |o: &Occurrence| &input[o.start as usize..o.start as usize + usize::from(o.len)];
    heapsort(occ, |a, b| {
        term(a).cmp(term(b)).then(a.doc.cmp(&b.doc)) == Ordering::Less
    });

    // Pasada 1: tamaños. Pasada 2: escritura.
    let (mut terms, mut postings, mut strings) = (0, 0, 0);
    for (i, o) in occ.iter().enumerate() {
        let new_term = i == 0 || term(&occ[i - 1]) != term(o);
        if new_term {
            terms += 1;
            strings += usize::from(o.len);
        }
        if new_term || occ[i - 1].doc != o.doc {
            postings += 1;
        }
    }
    let starts_at = offsets_at + (terms + 1) * 4;
    let strings_at = starts_at + (terms + 1) * 4;
    let postings_at = strings_at + strings;
    let total = postings_at + postings * 4;
    if total > out.len() {
        return Err(BuildError::OutputFull);
    }

    out[..4].copy_from_slice(MAGIC);
    put(out, 4, docs as u32);
    put(out, 8, terms as u32);
    put(out, 12, postings as u32);
    let (mut t, mut p, mut s) = (0, 0, 0);
    for (i, o) in occ.iter().enumerate() {
        let new_term = i == 0 || term(&occ[i - 1]) != term(o);
        if new_term {
            put(out, offsets_at + t * 4, s as u32);
            put(out, starts_at + t * 4, p as u32);
            let bytes = term(o);
            out[strings_at + s..strings_at + s + bytes.len()].copy_from_slice(bytes);
            s += bytes.len();
            t += 1;
        }
        if new_term || occ[i - 1].doc != o.doc {
            out[postings_at + p * 4..postings_at + p * 4 + 2].copy_from_slice(&o.doc.to_le_bytes());
            out[postings_at + p * 4 + 2..postings_at + p * 4 + 4].fill(0);
            p += 1;
        }
        let w = postings_at + (p - 1) * 4 + 2;
        let v = u16::from_le_bytes([out[w], out[w + 1]]);
        let tf = ((v & !IN_TITLE) + 1).min(!IN_TITLE);
        let title = (v & IN_TITLE) | if o.title { IN_TITLE } else { 0 };
        out[w..w + 2].copy_from_slice(&(tf | title).to_le_bytes());
    }
    put(out, offsets_at + terms * 4, strings as u32);
    put(out, starts_at + terms * 4, postings as u32);
    Ok(total)
}

/// Vista de sólo lectura sobre un índice `VXS1` ya validado.
#[derive(Clone, Copy, Debug)]
pub struct Index<'a> {
    bytes: &'a [u8],
    /// Documentos indexados.
    pub docs: usize,
    /// Términos distintos.
    pub terms: usize,
    /// Longitud media de los documentos (en términos).
    pub avg_len: f32,
    offsets_at: usize,
    strings_at: usize,
    postings_at: usize,
}

impl<'a> Index<'a> {
    /// Valida la cabecera y los tamaños. `None` si no es un índice `VXS1` íntegro.
    #[must_use]
    pub fn parse(bytes: &'a [u8]) -> Option<Self> {
        if bytes.get(..4)? != MAGIC {
            return None;
        }
        let (docs, terms, postings) = (u32_at(bytes, 4)?, u32_at(bytes, 8)?, u32_at(bytes, 12)?);
        // Cotas antes de multiplicar: un índice corrupto no puede desbordar las cuentas.
        if docs > bytes.len() || terms > bytes.len() || postings > bytes.len() {
            return None;
        }
        let offsets_at = HEADER + docs * 2;
        let starts_at = offsets_at + (terms + 1) * 4;
        let strings_at = starts_at + (terms + 1) * 4;
        let strings = u32_at(bytes, offsets_at + terms * 4)?;
        let postings_at = strings_at + strings;
        let ok =
            u32_at(bytes, starts_at + terms * 4)? == postings && postings_at + postings * 4 == bytes.len();
        if !ok {
            return None;
        }
        let total: u32 = bytes[HEADER..offsets_at]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|l| u32::from(u16::from_le_bytes(*l)))
            .sum();
        let avg_len = if docs == 0 {
            1.0
        } else {
            (total as f32 / docs as f32).max(1.0)
        };
        Some(Self {
            bytes,
            docs,
            terms,
            avg_len,
            offsets_at,
            strings_at,
            postings_at,
        })
    }

    /// Bytes del término `i` (vacío si el índice estuviera corrupto).
    #[must_use]
    pub fn term(&self, i: usize) -> &'a [u8] {
        let range = u32_at(self.bytes, self.offsets_at + i * 4)
            .zip(u32_at(self.bytes, self.offsets_at + (i + 1) * 4));
        range
            .and_then(|(a, b)| self.bytes.get(self.strings_at + a..self.strings_at + b))
            .unwrap_or(&[])
    }

    /// Entradas `(doc, tf, en el título)` del término `i`.
    pub fn postings(&self, i: usize) -> impl Iterator<Item = (usize, u32, bool)> + 'a {
        let starts_at = self.offsets_at + (self.terms + 1) * 4;
        let (a, b) = u32_at(self.bytes, starts_at + i * 4)
            .zip(u32_at(self.bytes, starts_at + (i + 1) * 4))
            .unwrap_or((0, 0));
        let at = self.postings_at;
        let entries = self.bytes.get(at + a * 4..at + b * 4).unwrap_or(&[]);
        entries.as_chunks::<4>().0.iter().map(|e| {
            let tf = u16::from_le_bytes([e[2], e[3]]);
            (
                usize::from(u16::from_le_bytes([e[0], e[1]])),
                u32::from(tf & !IN_TITLE),
                tf & IN_TITLE != 0,
            )
        })
    }

    /// Términos del documento `doc` (0 si no existe).
    #[must_use]
    pub fn doc_len(&self, doc: usize) -> u32 {
        self.bytes
            .get(HEADER + doc * 2..HEADER + doc * 2 + 2)
            .filter(|_| doc < self.docs)
            .map_or(0, |l| u32::from(u16::from_le_bytes([l[0], l[1]])))
    }

    /// Primer término `>= prefix` (búsqueda binaria).
    #[must_use]
    pub fn lower_bound(&self, prefix: &[u8]) -> usize {
        let (mut lo, mut hi) = (0, self.terms);
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            if self.term(mid) < prefix {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        lo
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn sample(text: &str, out: &mut std::vec::Vec<u8>) -> usize {
        let mut input = text.as_bytes().to_vec();
        let mut scratch = std::vec![Occurrence::ZERO; 1024];
        out.resize(8192, 0);
        let n = build(&mut input, &mut scratch, out).unwrap_or(0);
        out.truncate(n);
        n
    }

    #[test]
    fn construye_y_lee_el_mismo_indice() {
        let mut out = std::vec::Vec::new();
        sample(
            "Rutas\x1Frutas y paquetes\x1EIslas\x1Fpaquetes con islas",
            &mut out,
        );
        let index = Index::parse(&out).map(|i| (i.docs, i.terms));
        assert_eq!(index, Some((2, 3)));
        let Some(index) = Index::parse(&out) else { return };
        let terms: std::vec::Vec<&[u8]> = (0..index.terms).map(|i| index.term(i)).collect();
        assert_eq!(terms, [&b"isla"[..], b"paquete", b"ruta"]);
        // «isla»: dos veces en el doc 1, una de ellas en el título.
        assert_eq!(index.postings(0).collect::<std::vec::Vec<_>>(), [(1, 2, true)]);
        assert_eq!(
            index.postings(1).collect::<std::vec::Vec<_>>(),
            [(0, 1, false), (1, 1, false)]
        );
        assert_eq!(index.lower_bound(b"pa"), 1);
        assert_eq!(index.lower_bound(b"zz"), 3);
        assert_eq!((index.doc_len(0), index.doc_len(1), index.doc_len(9)), (3, 3, 0));
        assert!((index.avg_len - 3.0).abs() < f32::EPSILON);
    }

    #[test]
    fn heapsort_ordena() {
        let mut v = [5, 3, 9, 1, 1, 8, 0, 7, 2];
        heapsort(&mut v, |a, b| a < b);
        assert_eq!(v, [0, 1, 1, 2, 3, 5, 7, 8, 9]);
        let mut empty: [u8; 0] = [];
        heapsort(&mut empty, |a, b| a < b);
    }

    #[test]
    fn rechaza_indices_corruptos() {
        let mut out = std::vec::Vec::new();
        sample("hola\x1Fmundo", &mut out);
        assert!(Index::parse(&out).is_some());
        assert!(Index::parse(&out[..out.len() - 1]).is_none());
        assert!(Index::parse(b"VXS0").is_none());
        assert!(Index::parse(&[]).is_none());
    }

    #[test]
    fn avisa_si_no_cabe() {
        let mut input = b"uno dos tres cuatro".to_vec();
        let mut scratch = [Occurrence::ZERO; 2];
        let mut out = [0u8; 4096];
        assert_eq!(
            build(&mut input, &mut scratch, &mut out),
            Err(BuildError::TooManyOccurrences)
        );
        let mut input = b"uno dos tres cuatro".to_vec();
        let mut scratch = [Occurrence::ZERO; 8];
        assert_eq!(
            build(&mut input, &mut scratch, &mut out[..20]),
            Err(BuildError::OutputFull)
        );
    }
}
