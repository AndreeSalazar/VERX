//! Redimensionado de calidad para reducir imágenes:
//!
//! - **Promedio por área:** cada píxel de salida es la media exacta (con pesos
//!   fraccionarios) de los píxeles de entrada que cubre. Sin aliasing.
//! - **En luz lineal:** se pasa de sRGB a lineal antes de promediar. Promediar
//!   en sRGB oscurece los bordes claros (un blanco y un negro dan un gris
//!   demasiado oscuro).
//! - **Alfa premultiplicado:** los píxeles transparentes no aportan color, así
//!   que los bordes no sueltan halos.
//! - **Por filas:** cada fila de entrada se reduce en horizontal y se acumula en
//!   la fila de salida que le toca; la memoria crece con el ancho de salida, no
//!   con la foto.

use std::sync::OnceLock;

use crate::png::Image;

fn linear_table() -> &'static [f32; 256] {
    static TABLE: OnceLock<[f32; 256]> = OnceLock::new();
    TABLE.get_or_init(|| {
        std::array::from_fn(|i| {
            let c = i as f32 / 255.0;
            if c <= 0.040_45 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            }
        })
    })
}

fn srgb_table() -> &'static [u8; 4096] {
    static TABLE: OnceLock<[u8; 4096]> = OnceLock::new();
    TABLE.get_or_init(|| {
        std::array::from_fn(|i| {
            let v = i as f32 / 4095.0;
            let s = if v <= 0.003_130_8 {
                v * 12.92
            } else {
                1.055 * v.powf(1.0 / 2.4) - 0.055
            };
            (s * 255.0).round().clamp(0.0, 255.0) as u8
        })
    })
}

fn to_srgb(v: f32) -> u8 {
    srgb_table()[(v.clamp(0.0, 1.0) * 4095.0 + 0.5) as usize]
}

/// Qué píxeles de entrada cubre cada píxel de salida, y con qué peso (suman 1).
struct Spans {
    offsets: Vec<usize>,
    taps: Vec<(u32, f32)>,
}

impl Spans {
    fn new(src: u32, dst: u32) -> Self {
        let scale = f64::from(src) / f64::from(dst);
        let mut offsets = Vec::with_capacity(dst as usize + 1);
        let mut taps = Vec::new();
        for o in 0..dst {
            offsets.push(taps.len());
            let (start, end) = (f64::from(o) * scale, f64::from(o + 1) * scale);
            let mut i = start.floor() as u32;
            while f64::from(i) < end && i < src {
                let cover = (end.min(f64::from(i + 1)) - start.max(f64::from(i))) / scale;
                if cover > 1e-9 {
                    taps.push((i, cover as f32));
                }
                i += 1;
            }
        }
        offsets.push(taps.len());
        Self { offsets, taps }
    }

    fn get(&self, o: usize) -> &[(u32, f32)] {
        &self.taps[self.offsets[o]..self.offsets[o + 1]]
    }
}

// Fila `y` de la entrada, reducida en horizontal, en luz lineal premultiplicada.
fn row(img: &Image, y: u32, spans: &Spans, out: &mut [[f32; 4]]) {
    let lin = linear_table();
    let start = y as usize * img.width as usize * 4;
    let src = &img.rgba[start..start + img.width as usize * 4];
    for (x, acc) in out.iter_mut().enumerate() {
        *acc = [0.0; 4];
        for &(i, w) in spans.get(x) {
            let p = &src[i as usize * 4..i as usize * 4 + 4];
            let a = f32::from(p[3]) / 255.0;
            let wa = w * a;
            acc[0] += lin[usize::from(p[0])] * wa;
            acc[1] += lin[usize::from(p[1])] * wa;
            acc[2] += lin[usize::from(p[2])] * wa;
            acc[3] += wa;
        }
    }
}

/// Reduce `img` a `width × height` (si es más pequeña o igual, la devuelve tal cual).
#[must_use]
pub fn resize(img: &Image, width: u32, height: u32) -> Image {
    let (width, height) = (width.max(1), height.max(1));
    if width >= img.width && height >= img.height {
        return img.clone();
    }
    let (width, height) = (width.min(img.width), height.min(img.height));
    let horizontal = Spans::new(img.width, width);
    let vertical = Spans::new(img.height, height);
    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
    let mut line = vec![[0.0f32; 4]; width as usize];
    let mut acc = vec![[0.0f32; 4]; width as usize];
    // La fila de entrada que queda entre dos de salida se reduce una sola vez.
    let mut cached = u32::MAX;
    for y in 0..height as usize {
        acc.fill([0.0; 4]);
        for &(j, w) in vertical.get(y) {
            if j != cached {
                row(img, j, &horizontal, &mut line);
                cached = j;
            }
            for (a, l) in acc.iter_mut().zip(&line) {
                for c in 0..4 {
                    a[c] += l[c] * w;
                }
            }
        }
        for a in &acc {
            let alpha = a[3];
            let un = if alpha > 1e-6 { 1.0 / alpha } else { 0.0 };
            rgba.extend_from_slice(&[
                to_srgb(a[0] * un),
                to_srgb(a[1] * un),
                to_srgb(a[2] * un),
                (alpha * 255.0).round().clamp(0.0, 255.0) as u8,
            ]);
        }
    }
    Image { width, height, rgba }
}

/// Alto que corresponde a `width` manteniendo la proporción.
#[must_use]
pub fn height_for(img: &Image, width: u32) -> u32 {
    ((u64::from(img.height) * u64::from(width) + u64::from(img.width) / 2) / u64::from(img.width)).max(1)
        as u32
}

/// Miniatura cuyo lado mayor mide como mucho `max` píxeles (para el placeholder).
#[must_use]
pub fn thumbnail(img: &Image, max: u32) -> Image {
    if img.width >= img.height {
        resize(img, max, height_for(img, max.min(img.width)))
    } else {
        let w = ((u64::from(img.width) * u64::from(max)) / u64::from(img.height)).max(1) as u32;
        resize(img, w, max)
    }
}

/// Color medio (en luz lineal, ponderado por el alfa) como `0xRRGGBB`.
#[must_use]
pub fn average(img: &Image) -> u32 {
    let lin = linear_table();
    let mut sum = [0.0f64; 4];
    for p in img.rgba.as_chunks::<4>().0 {
        let a = f64::from(p[3]) / 255.0;
        for c in 0..3 {
            sum[c] += f64::from(lin[usize::from(p[c])]) * a;
        }
        sum[3] += a;
    }
    if sum[3] <= 0.0 {
        return 0;
    }
    let [r, g, b] = [0, 1, 2].map(|c| u32::from(to_srgb((sum[c] / sum[3]) as f32)));
    (r << 16) | (g << 8) | b
}

#[cfg(test)]
mod tests {
    use super::{average, height_for, resize, thumbnail};
    use crate::png::Image;

    fn solid(w: u32, h: u32, px: [u8; 4]) -> Image {
        Image {
            width: w,
            height: h,
            rgba: px.repeat((w * h) as usize),
        }
    }

    #[test]
    fn mantiene_un_color_plano() {
        let out = resize(&solid(37, 23, [200, 100, 50, 255]), 10, 6);
        assert_eq!((out.width, out.height), (10, 6));
        assert!(
            out.rgba
                .as_chunks::<4>()
                .0
                .iter()
                .all(|p| *p == [200, 100, 50, 255])
        );
    }

    #[test]
    fn promedia_en_luz_lineal() {
        // Blanco y negro alternos: en luz lineal la media es 0,5 → sRGB 188 (no 128).
        let mut img = solid(2, 1, [0, 0, 0, 255]);
        img.rgba[..4].copy_from_slice(&[255, 255, 255, 255]);
        assert_eq!(resize(&img, 1, 1).rgba, [188, 188, 188, 255]);
    }

    #[test]
    fn sin_halos_en_la_transparencia() {
        // Rojo opaco junto a verde totalmente transparente: el resultado sigue rojo, a medio alfa.
        let mut img = solid(2, 1, [0, 255, 0, 0]);
        img.rgba[..4].copy_from_slice(&[255, 0, 0, 255]);
        assert_eq!(resize(&img, 1, 1).rgba, [255, 0, 0, 128]);
    }

    #[test]
    fn proporciones_miniaturas_y_media() {
        let img = solid(1600, 900, [10, 20, 30, 255]);
        assert_eq!(height_for(&img, 800), 450);
        let t = thumbnail(&img, 20);
        assert_eq!((t.width, t.height), (20, 11));
        let tall = thumbnail(&solid(300, 1200, [0; 4]), 20);
        assert_eq!((tall.width, tall.height), (5, 20));
        assert_eq!(average(&img), 0x000A_141E);
        // No se agranda nunca.
        assert_eq!(resize(&img, 4000, 3000).width, 1600);
    }
}
