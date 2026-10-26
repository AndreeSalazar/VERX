//! Codificador JPEG «baseline» (ITU T.81), el formato con pérdida para fotos:
//!
//! - RGB → YCbCr (JFIF) con submuestreo 4:2:0: el color a media resolución,
//!   que el ojo no nota, y el brillo entero.
//! - Bloques de 8×8 → DCT → cuantización con las tablas del anexo K escaladas
//!   por la calidad (la fórmula de libjpeg).
//! - Coeficientes en zigzag, con longitudes de racha y las tablas de Huffman
//!   estándar del anexo K.
//!
//! No guarda transparencia: para imágenes con alfa se queda el PNG.

use crate::png::Image;

const ZIGZAG: [usize; 64] = [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7,
    14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39,
    46, 53, 60, 61, 54, 47, 55, 62, 63,
];

// Tablas de cuantización del anexo K (orden natural, fila a fila).
const LUMA_Q: [u16; 64] = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17,
    22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78,
    87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_Q: [u16; 64] = [
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

// Tablas de Huffman del anexo K.3: cuántos códigos hay de cada longitud (1..16) y sus símbolos.
pub(crate) const DC_LUMA: ([u8; 16], &[u8]) = (
    [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
);
pub(crate) const DC_CHROMA: ([u8; 16], &[u8]) = (
    [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
);
pub(crate) const AC_LUMA: ([u8; 16], &[u8]) = (
    [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
    &[
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22,
        0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33,
        0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34,
        0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55,
        0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76,
        0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
        0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5,
        0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
        0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1,
        0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
    ],
);
pub(crate) const AC_CHROMA: ([u8; 16], &[u8]) = (
    [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
    &[
        0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13,
        0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62,
        0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29,
        0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54,
        0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
        0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
        0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2,
        0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
        0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
    ],
);

/// Código canónico de cada símbolo: (bits, longitud).
fn huffman(spec: &([u8; 16], &[u8])) -> [(u16, u8); 256] {
    let mut table = [(0u16, 0u8); 256];
    let (mut code, mut k) = (0u16, 0);
    for len in 1..=16u8 {
        for _ in 0..spec.0[usize::from(len - 1)] {
            table[usize::from(spec.1[k])] = (code, len);
            code += 1;
            k += 1;
        }
        code <<= 1;
    }
    table
}

/// Tabla de cuantización escalada para una calidad de 1 a 100 (fórmula de libjpeg).
pub(crate) fn quant(base: &[u16; 64], quality: u8) -> [u16; 64] {
    let q = u32::from(quality.clamp(1, 100));
    let scale = if q < 50 { 5000 / q } else { 200 - q * 2 };
    base.map(|b| ((u32::from(b) * scale + 50) / 100).clamp(1, 255) as u16)
}

pub(crate) fn tables(quality: u8) -> ([u16; 64], [u16; 64]) {
    (quant(&LUMA_Q, quality), quant(&CHROMA_Q, quality))
}

/// Coseno de la DCT: `cos((2x + 1)·u·π / 16)` con la normalización de T.81.
pub(crate) fn cosines() -> [[f32; 8]; 8] {
    std::array::from_fn(|u| {
        std::array::from_fn(|x| {
            let c = if u == 0 {
                std::f32::consts::FRAC_1_SQRT_2
            } else {
                1.0
            };
            0.5 * c * (((2 * x + 1) as f32 * u as f32 * std::f32::consts::PI) / 16.0).cos()
        })
    })
}

fn fdct(block: &[f32; 64], cos: &[[f32; 8]; 8]) -> [f32; 64] {
    let mut rows = [0f32; 64];
    for y in 0..8 {
        for u in 0..8 {
            rows[y * 8 + u] = (0..8).map(|x| block[y * 8 + x] * cos[u][x]).sum();
        }
    }
    let mut out = [0f32; 64];
    for u in 0..8 {
        for v in 0..8 {
            out[v * 8 + u] = (0..8).map(|y| rows[y * 8 + u] * cos[v][y]).sum();
        }
    }
    out
}

struct Bits {
    out: Vec<u8>,
    buf: u32,
    count: u32,
}

impl Bits {
    fn put(&mut self, code: u16, len: u8) {
        self.buf = (self.buf << len) | u32::from(code);
        self.count += u32::from(len);
        while self.count >= 8 {
            let byte = (self.buf >> (self.count - 8)) as u8;
            self.out.push(byte);
            if byte == 0xFF {
                self.out.push(0); // relleno: 0xFF dentro de los datos va seguido de 0x00
            }
            self.count -= 8;
        }
        self.buf &= (1 << self.count) - 1;
    }

    fn flush(&mut self) {
        if self.count > 0 {
            let pad = 8 - self.count as u8;
            self.put((1 << pad) - 1, pad);
        }
    }
}

// Categoría (número de bits) de un coeficiente y su representación.
fn category(v: i32) -> (u8, u16) {
    let mag = v.unsigned_abs();
    let bits = (32 - mag.leading_zeros()) as u8;
    let code = if v < 0 {
        (v - 1) as u32 & ((1 << bits) - 1)
    } else {
        mag
    };
    (bits, code as u16)
}

struct Coder {
    dc: [(u16, u8); 256],
    ac: [(u16, u8); 256],
    q: [u16; 64],
    prev: i32,
}

impl Coder {
    fn block(&mut self, w: &mut Bits, samples: &[f32; 64], cos: &[[f32; 8]; 8]) {
        let f = fdct(samples, cos);
        let coef: [i32; 64] =
            std::array::from_fn(|k| (f[ZIGZAG[k]] / f32::from(self.q[ZIGZAG[k]])).round() as i32);
        let (bits, code) = category(coef[0] - self.prev);
        self.prev = coef[0];
        let (c, l) = self.dc[usize::from(bits)];
        w.put(c, l);
        w.put(code, bits);
        let mut run = 0;
        for &v in &coef[1..] {
            if v == 0 {
                run += 1;
                continue;
            }
            while run >= 16 {
                let (c, l) = self.ac[0xF0];
                w.put(c, l);
                run -= 16;
            }
            let (bits, code) = category(v);
            let (c, l) = self.ac[(run << 4) | usize::from(bits)];
            w.put(c, l);
            w.put(code, bits);
            run = 0;
        }
        if run > 0 {
            let (c, l) = self.ac[0x00];
            w.put(c, l);
        }
    }
}

fn marker(out: &mut Vec<u8>, m: u8, data: &[u8]) {
    out.extend_from_slice(&[0xFF, m]);
    out.extend_from_slice(&((data.len() + 2) as u16).to_be_bytes());
    out.extend_from_slice(data);
}

/// Codifica `img` (se ignora el alfa) como JPEG de calidad `quality` (1..100).
#[must_use]
pub fn encode(img: &Image, quality: u8) -> Vec<u8> {
    let (yq, cq) = tables(quality);
    let (w, h) = (img.width as usize, img.height as usize);
    let mut out = vec![0xFF, 0xD8];
    marker(&mut out, 0xE0, b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
    let mut dqt = vec![0u8];
    dqt.extend(ZIGZAG.iter().map(|&i| yq[i] as u8));
    dqt.push(1);
    dqt.extend(ZIGZAG.iter().map(|&i| cq[i] as u8));
    marker(&mut out, 0xDB, &dqt);
    let mut sof = vec![8];
    sof.extend_from_slice(&(h as u16).to_be_bytes());
    sof.extend_from_slice(&(w as u16).to_be_bytes());
    sof.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    marker(&mut out, 0xC0, &sof);
    let mut dht = Vec::new();
    for (class, spec) in [
        (0x00, &DC_LUMA),
        (0x10, &AC_LUMA),
        (0x01, &DC_CHROMA),
        (0x11, &AC_CHROMA),
    ] {
        dht.push(class);
        dht.extend_from_slice(&spec.0);
        dht.extend_from_slice(spec.1);
    }
    marker(&mut out, 0xC4, &dht);
    marker(&mut out, 0xDA, &[3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

    let cos = cosines();
    let mut bits = Bits {
        out,
        buf: 0,
        count: 0,
    };
    let mut luma = Coder {
        dc: huffman(&DC_LUMA),
        ac: huffman(&AC_LUMA),
        q: yq,
        prev: 0,
    };
    let mut cb = Coder {
        dc: huffman(&DC_CHROMA),
        ac: huffman(&AC_CHROMA),
        q: cq,
        prev: 0,
    };
    let mut cr = Coder {
        dc: huffman(&DC_CHROMA),
        ac: huffman(&AC_CHROMA),
        q: cq,
        prev: 0,
    };
    // Píxel (x, y) con los bordes repetidos, en YCbCr centrado en 0.
    let ycc = |x: usize, y: usize| {
        let p = &img.rgba[(y.min(h - 1) * w + x.min(w - 1)) * 4..];
        let (r, g, b) = (f32::from(p[0]), f32::from(p[1]), f32::from(p[2]));
        [
            0.299 * r + 0.587 * g + 0.114 * b - 128.0,
            -0.168_736 * r - 0.331_264 * g + 0.5 * b,
            0.5 * r - 0.418_688 * g - 0.081_312 * b,
        ]
    };
    for my in (0..h).step_by(16) {
        for mx in (0..w).step_by(16) {
            for (by, bx) in [(0, 0), (0, 8), (8, 0), (8, 8)] {
                let block: [f32; 64] = std::array::from_fn(|k| ycc(mx + bx + k % 8, my + by + k / 8)[0]);
                luma.block(&mut bits, &block, &cos);
            }
            // Color a media resolución: la media de cada 2×2.
            let chroma: [[f32; 2]; 64] = std::array::from_fn(|k| {
                let (x, y) = (mx + (k % 8) * 2, my + (k / 8) * 2);
                let px = [ycc(x, y), ycc(x + 1, y), ycc(x, y + 1), ycc(x + 1, y + 1)];
                [1, 2].map(|c| px.iter().map(|p| p[c]).sum::<f32>() / 4.0)
            });
            cb.block(&mut bits, &chroma.map(|c| c[0]), &cos);
            cr.block(&mut bits, &chroma.map(|c| c[1]), &cos);
        }
    }
    bits.flush();
    let mut out = bits.out;
    out.extend_from_slice(&[0xFF, 0xD9]);
    out
}

#[cfg(test)]
#[path = "jpeg_check.rs"]
mod check;
