//! Codificar RGBA a PNG: RGB si la imagen es opaca y RGBA si no, eligiendo para
//! cada fila el filtro que mejor comprime, y DEFLATE propio para los datos.

use crate::checksum::crc32;
use crate::deflate::zlib;
use crate::png::{Image, SIGNATURE, paeth};

pub(crate) fn chunk(out: &mut Vec<u8>, kind: [u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(&kind);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc32(&[&kind, data]).to_be_bytes());
}

// Filtra una fila con el filtro `kind` (la inversa de `unfilter`).
fn filter(kind: u8, row: &[u8], prev: &[u8], bpp: usize, out: &mut Vec<u8>) {
    out.push(kind);
    for i in 0..row.len() {
        let (a, b, c) = if i >= bpp {
            (row[i - bpp], prev[i], prev[i - bpp])
        } else {
            (0, prev[i], 0)
        };
        let predicted = match kind {
            0 => 0,
            1 => a,
            2 => b,
            3 => u16::midpoint(u16::from(a), u16::from(b)) as u8,
            _ => paeth(a, b, c),
        };
        out.push(row[i].wrapping_sub(predicted));
    }
}

/// Codifica una imagen como PNG: RGB si es opaca, RGBA si no; para cada fila,
/// el filtro con la menor suma de diferencias (la heurística de libpng).
#[must_use]
pub fn encode(img: &Image) -> Vec<u8> {
    let alpha = img.has_alpha();
    let channels = if alpha { 4 } else { 3 };
    let stride = img.width as usize * channels;
    let mut rows = Vec::with_capacity((stride + 1) * img.height as usize);
    let mut prev = vec![0u8; stride];
    let mut row = vec![0u8; stride];
    let mut best = Vec::with_capacity(stride + 1);
    let mut trial = Vec::with_capacity(stride + 1);
    for y in 0..img.height as usize {
        let src = &img.rgba[y * img.width as usize * 4..(y + 1) * img.width as usize * 4];
        if alpha {
            row.copy_from_slice(src);
        } else {
            for (dst, px) in row.as_chunks_mut::<3>().0.iter_mut().zip(src.as_chunks::<4>().0) {
                dst.copy_from_slice(&px[..3]);
            }
        }
        let mut best_score = u64::MAX;
        for kind in 0..5 {
            trial.clear();
            filter(kind, &row, &prev, channels, &mut trial);
            let score: u64 = trial[1..]
                .iter()
                .map(|&b| u64::from(b.cast_signed().unsigned_abs()))
                .sum();
            if score < best_score {
                best_score = score;
                std::mem::swap(&mut best, &mut trial);
            }
        }
        rows.extend_from_slice(&best);
        prev.copy_from_slice(&row);
    }
    let mut out = SIGNATURE.to_vec();
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&img.width.to_be_bytes());
    ihdr.extend_from_slice(&img.height.to_be_bytes());
    ihdr.extend_from_slice(&[8, if alpha { 6 } else { 2 }, 0, 0, 0]);
    chunk(&mut out, *b"IHDR", &ihdr);
    // sRGB con intención perceptual: el navegador sabe que los colores ya son sRGB.
    chunk(&mut out, *b"sRGB", &[0]);
    chunk(&mut out, *b"IDAT", &zlib(&rows));
    chunk(&mut out, *b"IEND", &[]);
    out
}
