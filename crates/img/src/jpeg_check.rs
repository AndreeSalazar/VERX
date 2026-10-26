//! Sólo para tests: un decodificador JPEG mínimo que lee lo que produce
//! `jpeg::encode` (baseline, 4:2:0, tablas estándar) y lo devuelve a RGB, para
//! medir de verdad la calidad (PSNR) con una ida y vuelta.

use super::{AC_CHROMA, AC_LUMA, DC_CHROMA, DC_LUMA, ZIGZAG, cosines, encode, tables};
use crate::png::Image;

struct Huff {
    first: [i32; 17],
    count: [i32; 17],
    offset: [usize; 17],
    symbols: &'static [u8],
}

fn huff(spec: &([u8; 16], &'static [u8])) -> Huff {
    let (mut first, mut count, mut offset) = ([0i32; 17], [0i32; 17], [0usize; 17]);
    let (mut code, mut k) = (0i32, 0usize);
    for len in 1..=16 {
        first[len] = code;
        count[len] = i32::from(spec.0[len - 1]);
        offset[len] = k;
        code = (code + count[len]) << 1;
        k += spec.0[len - 1] as usize;
    }
    Huff {
        first,
        count,
        offset,
        symbols: spec.1,
    }
}

struct Reader<'a> {
    d: &'a [u8],
    pos: usize,
    buf: u32,
    left: u32,
}

impl Reader<'_> {
    fn bit(&mut self) -> i32 {
        if self.left == 0 {
            let b = self.d.get(self.pos).copied().unwrap_or(0);
            self.pos += if b == 0xFF { 2 } else { 1 };
            self.buf = u32::from(b);
            self.left = 8;
        }
        self.left -= 1;
        ((self.buf >> self.left) & 1).cast_signed()
    }

    fn bits(&mut self, n: u8) -> i32 {
        (0..n).fold(0, |v, _| (v << 1) | self.bit())
    }

    fn decode(&mut self, h: &Huff) -> u8 {
        let mut code = 0;
        for len in 1..=16 {
            code = (code << 1) | self.bit();
            if code - h.first[len] < h.count[len] {
                return h.symbols[h.offset[len] + (code - h.first[len]) as usize];
            }
        }
        0
    }

    fn extend(&mut self, n: u8) -> i32 {
        if n == 0 {
            return 0;
        }
        let v = self.bits(n);
        if v < 1 << (n - 1) { v - (1 << n) + 1 } else { v }
    }
}

fn block(
    r: &mut Reader<'_>,
    dc: &Huff,
    ac: &Huff,
    q: &[u16; 64],
    prev: &mut i32,
    cos: &[[f32; 8]; 8],
) -> [f32; 64] {
    let mut f = [0f32; 64];
    let t = r.decode(dc);
    *prev += r.extend(t);
    f[0] = (*prev * i32::from(q[0])) as f32;
    let mut k = 1;
    while k < 64 {
        let rs = r.decode(ac);
        let (run, size) = (usize::from(rs >> 4), rs & 15);
        if size == 0 {
            if run == 15 {
                k += 16;
                continue;
            }
            break;
        }
        k += run;
        let i = ZIGZAG[k];
        f[i] = (r.extend(size) * i32::from(q[i])) as f32;
        k += 1;
    }
    let mut g = [0f32; 64];
    for v in 0..8 {
        for x in 0..8 {
            g[v * 8 + x] = (0..8).map(|u| f[v * 8 + u] * cos[u][x]).sum();
        }
    }
    std::array::from_fn(|i| (0..8).map(|v| g[v * 8 + i % 8] * cos[v][i / 8]).sum::<f32>())
}

fn decode(jpeg: &[u8], w: usize, h: usize, quality: u8) -> std::vec::Vec<u8> {
    let (yq, cq) = tables(quality);
    let sos = jpeg.windows(2).position(|p| p == [0xFF, 0xDA]).unwrap_or(0);
    let len = usize::from(u16::from_be_bytes([jpeg[sos + 2], jpeg[sos + 3]]));
    let mut r = Reader {
        d: &jpeg[sos + 2 + len..],
        pos: 0,
        buf: 0,
        left: 0,
    };
    let (dcl, acl, dcc, acc) = (huff(&DC_LUMA), huff(&AC_LUMA), huff(&DC_CHROMA), huff(&AC_CHROMA));
    let cos = cosines();
    let (mut py, mut pb, mut pr) = (0, 0, 0);
    let mut rgb = std::vec![0u8; w * h * 3];
    for my in (0..h).step_by(16) {
        for mx in (0..w).step_by(16) {
            let ys: std::vec::Vec<[f32; 64]> = (0..4)
                .map(|_| block(&mut r, &dcl, &acl, &yq, &mut py, &cos))
                .collect();
            let cb = block(&mut r, &dcc, &acc, &cq, &mut pb, &cos);
            let cr = block(&mut r, &dcc, &acc, &cq, &mut pr, &cos);
            for dy in 0..16 {
                for dx in 0..16 {
                    let (x, y) = (mx + dx, my + dy);
                    if x >= w || y >= h {
                        continue;
                    }
                    let l = ys[(dy / 8) * 2 + dx / 8][(dy % 8) * 8 + dx % 8] + 128.0;
                    let (b, rr) = (cb[(dy / 2) * 8 + dx / 2], cr[(dy / 2) * 8 + dx / 2]);
                    let px = [l + 1.402 * rr, l - 0.344_136 * b - 0.714_136 * rr, l + 1.772 * b];
                    for c in 0..3 {
                        rgb[(y * w + x) * 3 + c] = px[c].round().clamp(0.0, 255.0) as u8;
                    }
                }
            }
        }
    }
    rgb
}

fn psnr(img: &Image, rgb: &[u8]) -> f64 {
    let mse: f64 = img
        .rgba
        .as_chunks::<4>()
        .0
        .iter()
        .zip(rgb.as_chunks::<3>().0)
        .map(|(a, b)| {
            (0..3)
                .map(|c| (f64::from(a[c]) - f64::from(b[c])).powi(2))
                .sum::<f64>()
        })
        .sum::<f64>()
        / (rgb.len() as f64);
    10.0 * (255.0 * 255.0 / mse.max(1e-9)).log10()
}

fn scene(w: u32, h: u32) -> Image {
    let mut rgba = std::vec::Vec::new();
    for y in 0..h {
        for x in 0..w {
            let d = (f64::from(x) - 40.0).hypot(f64::from(y) - 25.0);
            rgba.extend_from_slice(&[
                (x * 255 / w) as u8,
                (y * 255 / h) as u8,
                (128.0 + 100.0 * (d / 6.0).sin()) as u8,
                255,
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
fn estructura_jfif_valida() {
    let jpg = encode(&scene(70, 45), 85);
    assert_eq!(&jpg[..4], &[0xFF, 0xD8, 0xFF, 0xE0]);
    assert_eq!(&jpg[6..11], b"JFIF\0");
    assert_eq!(&jpg[jpg.len() - 2..], &[0xFF, 0xD9]);
    let sof = jpg.windows(2).position(|p| p == [0xFF, 0xC0]).unwrap_or(0);
    assert_eq!(u16::from_be_bytes([jpg[sof + 5], jpg[sof + 6]]), 45);
    assert_eq!(u16::from_be_bytes([jpg[sof + 7], jpg[sof + 8]]), 70);
}

#[test]
fn ida_y_vuelta_con_buena_calidad() {
    // 70×45 no es múltiplo de 16: prueba también el relleno de los bordes.
    let img = scene(70, 45);
    for (q, min) in [(95, 36.0), (85, 33.0), (50, 29.0)] {
        let jpg = encode(&img, q);
        let db = psnr(&img, &decode(&jpg, 70, 45, q));
        assert!(db > min, "calidad {q}: {db:.1} dB");
    }
    assert!(encode(&img, 95).len() > encode(&img, 50).len());
}
