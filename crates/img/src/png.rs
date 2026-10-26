//! PNG: decodificar cualquier PNG no entrelazado (gris, gris+alfa, RGB, RGBA,
//! paleta con transparencia; 1, 2, 4, 8 y 16 bits) a RGBA de 8 bits, y
//! codificarlo de vuelta (ver `encode`).

use crate::Error;
use crate::checksum::crc32;

use crate::inflate::inflate;

pub(crate) const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
/// Lado máximo admitido.
pub const MAX_SIDE: u32 = 16_384;
/// Píxeles máximos admitidos (64 megapíxeles).
pub const MAX_PIXELS: u64 = 64 * 1024 * 1024;

/// Una imagen RGBA de 8 bits por canal (sRGB, alfa sin premultiplicar).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Image {
    /// Ancho en píxeles.
    pub width: u32,
    /// Alto en píxeles.
    pub height: u32,
    /// `width × height × 4` bytes, fila a fila.
    pub rgba: Vec<u8>,
}

impl Image {
    /// ¿Algún píxel tiene transparencia?
    #[must_use]
    pub fn has_alpha(&self) -> bool {
        self.rgba.as_chunks::<4>().0.iter().any(|p| p[3] != 255)
    }
}

fn be32(b: &[u8]) -> u32 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}

pub(crate) fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let p = i16::from(a) + i16::from(b) - i16::from(c);
    let (pa, pb, pc) = (
        (p - i16::from(a)).abs(),
        (p - i16::from(b)).abs(),
        (p - i16::from(c)).abs(),
    );
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

// Deshace el filtro de una fila en su sitio; `prev` es la fila anterior ya reconstruida.
fn unfilter(kind: u8, row: &mut [u8], prev: &[u8], bpp: usize) -> Result<(), Error> {
    match kind {
        0 => {}
        1 => (bpp..row.len()).for_each(|i| row[i] = row[i].wrapping_add(row[i - bpp])),
        2 => row
            .iter_mut()
            .zip(prev)
            .for_each(|(r, &p)| *r = r.wrapping_add(p)),
        3 => {
            for i in 0..row.len() {
                let left = if i >= bpp { u16::from(row[i - bpp]) } else { 0 };
                row[i] = row[i].wrapping_add(u16::midpoint(left, u16::from(prev[i])) as u8);
            }
        }
        4 => {
            for i in 0..row.len() {
                let (a, c) = if i >= bpp {
                    (row[i - bpp], prev[i - bpp])
                } else {
                    (0, 0)
                };
                row[i] = row[i].wrapping_add(paeth(a, prev[i], c));
            }
        }
        _ => return Err(Error::Corrupt("filtro de fila desconocido")),
    }
    Ok(())
}

struct Header {
    width: u32,
    height: u32,
    depth: u8,
    color: u8,
}

impl Header {
    fn channels(&self) -> usize {
        match self.color {
            0 | 3 => 1,
            4 => 2,
            2 => 3,
            _ => 4,
        }
    }
}

/// Decodifica un PNG a RGBA de 8 bits.
///
/// # Errors
/// Si el PNG está roto, entrelazado o es demasiado grande.
pub fn decode(png: &[u8]) -> Result<Image, Error> {
    if png.get(..8) != Some(&SIGNATURE) {
        return Err(Error::Corrupt("no es un PNG"));
    }
    let mut pos = 8;
    let mut header = None;
    let (mut palette, mut trns, mut idat) = (Vec::new(), Vec::new(), Vec::new());
    loop {
        let len = be32(png.get(pos..pos + 4).ok_or(Error::Truncated)?) as usize;
        let kind = png.get(pos + 4..pos + 8).ok_or(Error::Truncated)?;
        let data = png.get(pos + 8..pos + 8 + len).ok_or(Error::Truncated)?;
        let crc = be32(png.get(pos + 8 + len..pos + 12 + len).ok_or(Error::Truncated)?);
        if crc != crc32(&[kind, data]) {
            return Err(Error::Corrupt("CRC de un trozo no coincide"));
        }
        match kind {
            b"IHDR" if data.len() == 13 => {
                if data[10] != 0 || data[11] != 0 {
                    return Err(Error::Unsupported("compresión o filtro desconocidos"));
                }
                if data[12] != 0 {
                    return Err(Error::Unsupported("PNG entrelazado (Adam7)"));
                }
                header = Some(Header {
                    width: be32(&data[0..4]),
                    height: be32(&data[4..8]),
                    depth: data[8],
                    color: data[9],
                });
            }
            b"PLTE" => palette = data.to_vec(),
            b"tRNS" => trns = data.to_vec(),
            b"IDAT" => idat.extend_from_slice(data),
            b"IEND" => break,
            _ => {}
        }
        pos += 12 + len;
    }
    let h = header.ok_or(Error::Corrupt("falta IHDR"))?;
    let valid = matches!(
        (h.color, h.depth),
        (0, 1 | 2 | 4 | 8 | 16) | (3, 1 | 2 | 4 | 8) | (2 | 4 | 6, 8 | 16)
    );
    if !valid {
        return Err(Error::Corrupt("combinación de color y profundidad inválida"));
    }
    if h.width == 0
        || h.height == 0
        || h.width > MAX_SIDE
        || h.height > MAX_SIDE
        || u64::from(h.width) * u64::from(h.height) > MAX_PIXELS
    {
        return Err(Error::TooLarge);
    }
    let bits = h.channels() * usize::from(h.depth);
    let stride = (h.width as usize * bits).div_ceil(8);
    let bpp = bits.div_ceil(8).max(1);
    let mut raw = inflate(&idat, (stride + 1) * h.height as usize)?;
    if raw.len() < (stride + 1) * h.height as usize {
        return Err(Error::Truncated);
    }
    let mut prev = vec![0u8; stride];
    for y in 0..h.height as usize {
        let start = y * (stride + 1);
        let (kind, row) = (raw[start], &mut raw[start + 1..start + 1 + stride]);
        unfilter(kind, row, &prev, bpp)?;
        prev.copy_from_slice(row);
    }
    Ok(expand(&h, &raw, stride, &palette, &trns))
}

// Filas sin filtro → RGBA de 8 bits.
fn expand(h: &Header, raw: &[u8], stride: usize, palette: &[u8], trns: &[u8]) -> Image {
    let (w, ht) = (h.width as usize, h.height as usize);
    let mut rgba = Vec::with_capacity(w * ht * 4);
    let depth = usize::from(h.depth);
    let max = (1u32 << depth) - 1;
    // Muestra `i` (de `depth` bits) de una fila.
    let sample = |row: &[u8], i: usize| -> u32 {
        match depth {
            16 => u32::from(row[i * 2]),
            8 => u32::from(row[i]),
            _ => {
                let bit = i * depth;
                u32::from(row[bit / 8] >> (8 - depth - bit % 8)) & max
            }
        }
    };
    // Valor completo de una muestra (16 bits incluidos), para comparar con tRNS.
    let full = |row: &[u8], i: usize| {
        if depth == 16 {
            u32::from(u16::from_be_bytes([row[i * 2], row[i * 2 + 1]]))
        } else {
            sample(row, i)
        }
    };
    // Color transparente de tRNS (gris o RGB): canal `c`.
    let key = |c: usize| {
        trns.get(c * 2..c * 2 + 2)
            .map(|k| u32::from(u16::from_be_bytes([k[0], k[1]])))
    };
    // Gris de menos de 8 bits → 0..255.
    let gray = |v: u32| if depth < 8 { (v * 255 / max) as u8 } else { v as u8 };
    for y in 0..ht {
        let row = &raw[y * (stride + 1) + 1..(y + 1) * (stride + 1)];
        for x in 0..w {
            let px: [u8; 4] = match h.color {
                0 => {
                    let g = gray(sample(row, x));
                    [g, g, g, if key(0) == Some(full(row, x)) { 0 } else { 255 }]
                }
                3 => {
                    let i = sample(row, x) as usize;
                    let rgb = palette.get(i * 3..i * 3 + 3).unwrap_or(&[0, 0, 0]);
                    [rgb[0], rgb[1], rgb[2], trns.get(i).copied().unwrap_or(255)]
                }
                4 => {
                    let g = sample(row, x * 2) as u8;
                    [g, g, g, sample(row, x * 2 + 1) as u8]
                }
                2 => {
                    let transparent = (0..3).all(|c| key(c) == Some(full(row, x * 3 + c)));
                    [
                        sample(row, x * 3) as u8,
                        sample(row, x * 3 + 1) as u8,
                        sample(row, x * 3 + 2) as u8,
                        if transparent { 0 } else { 255 },
                    ]
                }
                _ => [0, 1, 2, 3].map(|c| sample(row, x * 4 + c) as u8),
            };
            rgba.extend_from_slice(&px);
        }
    }
    Image {
        width: h.width,
        height: h.height,
        rgba,
    }
}

#[cfg(test)]
mod tests {
    use super::{Image, decode};
    use crate::Error;
    use crate::encode::{chunk, encode};

    fn gradient(w: u32, h: u32, alpha: bool) -> Image {
        let mut rgba = std::vec::Vec::new();
        for y in 0..h {
            for x in 0..w {
                rgba.extend_from_slice(&[
                    (x * 255 / w.max(1)) as u8,
                    (y * 255 / h.max(1)) as u8,
                    128,
                    if alpha { (x + y) as u8 } else { 255 },
                ]);
            }
        }
        Image {
            width: w,
            height: h,
            rgba,
        }
    }

    #[test]
    fn ida_y_vuelta_rgb_y_rgba() {
        for (w, h, alpha) in [(1, 1, false), (17, 9, false), (64, 33, true), (300, 200, false)] {
            let img = gradient(w, h, alpha);
            let png = encode(&img);
            assert_eq!(decode(&png).as_ref(), Ok(&img));
        }
    }

    #[test]
    fn comprime_degradados() {
        let png = encode(&gradient(300, 200, false));
        // 180 000 bytes de píxeles; con filtros y deflate deben quedar muy pocos.
        assert!(png.len() < 6_000, "{} bytes", png.len());
    }

    // PNG a mano: filas sin filtro (tipo 0) de cualquier color y profundidad.
    fn raw_png(
        w: u32,
        h: u32,
        depth: u8,
        color: u8,
        rows: &[&[u8]],
        extra: &[(&[u8; 4], &[u8])],
    ) -> std::vec::Vec<u8> {
        let mut out = super::SIGNATURE.to_vec();
        let mut ihdr = w.to_be_bytes().to_vec();
        ihdr.extend_from_slice(&h.to_be_bytes());
        ihdr.extend_from_slice(&[depth, color, 0, 0, 0]);
        chunk(&mut out, *b"IHDR", &ihdr);
        for (kind, data) in extra {
            chunk(&mut out, **kind, data);
        }
        let data: std::vec::Vec<u8> = rows
            .iter()
            .flat_map(|r| std::iter::once(0).chain(r.iter().copied()))
            .collect();
        chunk(&mut out, *b"IDAT", &crate::deflate::zlib(&data));
        chunk(&mut out, *b"IEND", &[]);
        out
    }

    fn pixels(png: &[u8]) -> std::vec::Vec<[u8; 4]> {
        decode(png)
            .map(|i| i.rgba.as_chunks::<4>().0.to_vec())
            .unwrap_or_default()
    }

    #[test]
    fn grises_paletas_y_16_bits() {
        // Gris de 1 bit: 10100101.
        let g1 = pixels(&raw_png(8, 1, 1, 0, &[&[0b1010_0101]], &[]));
        assert_eq!(
            g1.iter().map(|p| p[0]).collect::<std::vec::Vec<_>>(),
            [255, 0, 255, 0, 0, 255, 0, 255]
        );
        // Paleta de 2 bits con transparencia en el color 1.
        let pal = pixels(&raw_png(
            4,
            1,
            2,
            3,
            &[&[0b0001_1011]],
            &[
                (b"PLTE", &[10, 0, 0, 0, 20, 0, 0, 0, 30, 40, 40, 40]),
                (b"tRNS", &[255, 0]),
            ],
        ));
        assert_eq!(
            pal,
            [[10, 0, 0, 255], [0, 20, 0, 0], [0, 0, 30, 255], [40, 40, 40, 255]]
        );
        // Gris de 16 bits (se queda el byte alto) y gris + alfa.
        assert_eq!(
            pixels(&raw_png(1, 1, 16, 0, &[&[0xAB, 0xCD]], &[])),
            [[0xAB, 0xAB, 0xAB, 255]]
        );
        assert_eq!(pixels(&raw_png(1, 1, 8, 4, &[&[90, 7]], &[])), [[90, 90, 90, 7]]);
        // RGB de 8 bits con color transparente (tRNS).
        let rgb = pixels(&raw_png(
            2,
            1,
            8,
            2,
            &[&[1, 2, 3, 9, 9, 9]],
            &[(b"tRNS", &[0, 1, 0, 2, 0, 3])],
        ));
        assert_eq!(rgb, [[1, 2, 3, 0], [9, 9, 9, 255]]);
    }

    #[test]
    fn rechaza_lo_roto() {
        let mut png = encode(&gradient(8, 8, false));
        assert!(decode(&png[..20]).is_err());
        let last = png.len() - 20;
        png[last] ^= 0xFF;
        assert_eq!(decode(&png), Err(Error::Corrupt("CRC de un trozo no coincide")));
        assert_eq!(decode(b"GIF89a"), Err(Error::Corrupt("no es un PNG")));
    }
}
