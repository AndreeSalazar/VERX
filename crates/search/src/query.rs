//! Consulta: cada palabra de la búsqueda es un prefijo («isl» encuentra «islas»)
//! y un documento sólo aparece si contiene TODAS (semántica AND).
//!
//! Puntuación: BM25, el estándar de los buscadores de texto. Por cada término
//! encontrado, `idf × tf × (k1 + 1) / (tf + k1 × (1 − b + b × largo / media))`:
//! - `tf` cuenta las apariciones y se satura (repetir no lo es todo);
//! - `idf`: las palabras raras pesan más que las que salen en todas partes;
//! - los documentos largos no ganan sólo por tener más texto.
//! - estar en el título multiplica por [`TITLE_BOOST`] (como BM25F).
//!
//! Una palabra que sólo es prefijo de un término («isl» → «isla») vale menos que la exacta.

use crate::index::Index;
use crate::text::{self, Tokens};

/// Palabras de la búsqueda que se tienen en cuenta.
pub const MAX_QUERY_TERMS: usize = 8;
/// Saturación de la frecuencia (BM25 `k1`).
const K1: f32 = 1.2;
/// Peso de la normalización por longitud (BM25 `b`).
const B: f32 = 0.75;
/// Multiplicador cuando el término aparece en el título.
pub const TITLE_BOOST: f32 = 3.0;
/// Lo que vale un prefijo frente a la palabra exacta.
const PREFIX: f32 = 0.4;

/// `ln(x)` para `x > 0` sin `std`: `x = m · 2^e` y `ln(m)` por la serie de
/// `atanh` (con `m` en [1, 2), el error es menor que 1e-4).
fn ln(x: f32) -> f32 {
    let bits = x.to_bits();
    let e = ((bits >> 23) & 0xff) as f32 - 127.0;
    let m = f32::from_bits((bits & 0x007f_ffff) | 0x3f80_0000);
    let t = (m - 1.0) / (m + 1.0);
    let t2 = t * t;
    2.0 * t * (1.0 + t2 * (1.0 / 3.0 + t2 * 0.2)) + e * core::f32::consts::LN_2
}

/// BM25 de un término en un documento.
fn bm25(tf: u32, df: usize, docs: usize, len: u32, avg_len: f32) -> f32 {
    let (tf, df, n) = (tf as f32, df as f32, docs as f32);
    let idf = ln(1.0 + (n - df + 0.5) / (df + 0.5));
    idf * tf * (K1 + 1.0) / (tf + K1 * (1.0 - B + B * len as f32 / avg_len))
}

/// Un resultado: documento y puntuación.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Hit {
    /// Posición del documento en el corpus (empieza en 0).
    pub doc: u32,
    /// Más alto = más relevante.
    pub score: u32,
}

/// Memoria de trabajo de una consulta: una casilla por documento.
pub struct Scratch<'a> {
    /// Puntuación acumulada.
    pub scores: &'a mut [u32],
    /// Cuántas palabras de la búsqueda contiene ya.
    pub matched: &'a mut [u8],
}

/// Busca `query` (UTF-8, se normaliza en su sitio) y escribe en `hits` los
/// mejores resultados, de más a menos relevante. Devuelve cuántos hay.
pub fn search(index: &Index<'_>, query: &mut [u8], scratch: &mut Scratch<'_>, hits: &mut [Hit]) -> usize {
    let n = text::normalize(query);
    let query = &query[..n];
    let docs = index.docs.min(scratch.scores.len()).min(scratch.matched.len());
    scratch.scores[..docs].fill(0);
    scratch.matched[..docs].fill(0);

    let mut words = 0u8;
    for t in Tokens::new(query).take(MAX_QUERY_TERMS) {
        let word = &query[t.start..t.start + t.len];
        let mut i = index.lower_bound(word);
        while i < index.terms && index.term(i).starts_with(word) {
            let affinity = if index.term(i).len() == word.len() {
                1.0
            } else {
                PREFIX
            };
            let df = index.postings(i).count();
            for (doc, tf, in_title) in index.postings(i) {
                let Some(m) = scratch.matched.get_mut(doc).filter(|_| doc < docs) else {
                    continue;
                };
                // Sólo siguen en carrera los que contenían todas las palabras anteriores.
                if *m == words || *m == words + 1 {
                    *m = words + 1;
                    let boost = if in_title { TITLE_BOOST } else { 1.0 };
                    let score =
                        bm25(tf, df, index.docs, index.doc_len(doc), index.avg_len) * affinity * boost;
                    scratch.scores[doc] += ((score * 100.0) as u32).max(1);
                }
            }
            i += 1;
        }
        words += 1;
    }
    if words == 0 {
        return 0;
    }

    // Los `hits.len()` mejores por inserción (el límite es pequeño).
    let mut found = 0;
    for doc in 0..docs {
        if scratch.matched[doc] != words {
            continue;
        }
        let hit = Hit {
            doc: doc as u32,
            score: scratch.scores[doc],
        };
        let mut at = found;
        while at > 0 && hits[at - 1].score < hit.score {
            at -= 1;
        }
        if at < hits.len() {
            let end = found.min(hits.len() - 1);
            hits.copy_within(at..end, at + 1);
            hits[at] = hit;
            found = (found + 1).min(hits.len());
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::{Occurrence, build};

    const CORPUS: &str = "Rutas\x1Frutas por archivos y layouts\x1E\
        Islas\x1Fcomponentes que se hidratan en el navegador\x1E\
        Rust y WebAssembly\x1Fla galaxia corre en Rust: rutas de memoria\x1E\
        Despliegue\x1Fexportación estática de las islas";

    fn run(index: &[u8], query: &str, limit: usize) -> std::vec::Vec<u32> {
        let Some(index) = Index::parse(index) else {
            return std::vec::Vec::new();
        };
        let (mut scores, mut matched) = ([0u32; 16], [0u8; 16]);
        let mut scratch = Scratch {
            scores: &mut scores,
            matched: &mut matched,
        };
        let mut hits = std::vec![Hit::default(); limit];
        let mut q = query.as_bytes().to_vec();
        let n = search(&index, &mut q, &mut scratch, &mut hits);
        hits[..n].iter().map(|h| h.doc).collect()
    }

    #[test]
    fn logaritmo_sin_std() {
        for x in [0.001_f32, 0.5, 1.0, 2.0, core::f32::consts::E, 10.0, 1234.5] {
            assert!((ln(x) - x.ln()).abs() < 1e-3, "ln({x})");
        }
    }

    fn corpus() -> std::vec::Vec<u8> {
        let mut input = CORPUS.as_bytes().to_vec();
        let mut scratch = std::vec![Occurrence::ZERO; 512];
        let mut out = std::vec![0u8; 8192];
        let n = build(&mut input, &mut scratch, &mut out).unwrap_or(0);
        out.truncate(n);
        out
    }

    #[test]
    fn el_titulo_pesa_mas_que_el_cuerpo() {
        assert_eq!(run(&corpus(), "rutas", 8), [0, 2]);
        assert_eq!(run(&corpus(), "islas", 8), [1, 3]);
    }

    #[test]
    fn prefijos_acentos_y_and() {
        let index = corpus();
        assert_eq!(run(&index, "ISL", 8), [1, 3]);
        assert_eq!(run(&index, "exportacion", 8), [3]);
        assert_eq!(run(&index, "Exportación ESTÁTICA", 8), [3]);
        assert_eq!(run(&index, "rust rutas", 8), [2]);
        assert_eq!(run(&index, "islas galaxia", 8), std::vec::Vec::<u32>::new());
    }

    #[test]
    fn sin_palabras_utiles_no_hay_resultados() {
        assert_eq!(run(&corpus(), "de la y", 8), std::vec::Vec::<u32>::new());
        assert_eq!(run(&corpus(), "", 8), std::vec::Vec::<u32>::new());
        assert_eq!(run(&corpus(), "zzz", 8), std::vec::Vec::<u32>::new());
    }

    #[test]
    fn respeta_el_limite() {
        assert_eq!(run(&corpus(), "e", 8).len(), 0);
        assert_eq!(run(&corpus(), "rutas", 1), [0]);
    }
}
