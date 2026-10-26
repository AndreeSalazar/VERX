//! Compresión DEFLATE dentro de un flujo zlib, para el codificador PNG.
//!
//! - LZ77 con cadenas de hash sobre una ventana de 32 KB y evaluación perezosa
//!   (si en el byte siguiente empieza una coincidencia más larga, se espera).
//! - Un bloque con códigos de Huffman dinámicos cada 16 K símbolos, calculados
//!   para las frecuencias de ese bloque.

use crate::checksum::adler32;
use crate::huffman::{codes, lengths};
use crate::inflate::{CLEN_ORDER, DIST_BASE, DIST_EXTRA, LEN_BASE, LEN_EXTRA};

const WINDOW: usize = 32 * 1024;
const MIN_MATCH: usize = 3;
const MAX_MATCH: usize = 258;
const HASH_BITS: u32 = 15;
const CHAIN: usize = 96;
const NICE: usize = 160;
const BLOCK: usize = 16 * 1024;

/// Literal (`dist == 0`, `value` = byte) o coincidencia (`value` = longitud).
#[derive(Clone, Copy)]
struct Token {
    value: u16,
    dist: u16,
}

struct Writer {
    out: Vec<u8>,
    buf: u64,
    count: u32,
}

impl Writer {
    fn put(&mut self, value: u32, bits: u32) {
        self.buf |= u64::from(value) << self.count;
        self.count += bits;
        while self.count >= 8 {
            self.out.push(self.buf as u8);
            self.buf >>= 8;
            self.count -= 8;
        }
    }

    fn flush(&mut self) {
        if self.count > 0 {
            self.out.push(self.buf as u8);
            self.buf = 0;
            self.count = 0;
        }
    }
}

// Índice en una tabla de bases: el mayor `i` con `base[i] <= v`.
fn bucket(base: &[u16], v: usize) -> usize {
    base.partition_point(|&b| usize::from(b) <= v) - 1
}

struct Lz<'a> {
    data: &'a [u8],
    head: Vec<u32>,
    prev: Vec<u32>,
}

impl Lz<'_> {
    fn hash(&self, i: usize) -> usize {
        let d = self.data;
        let v = u32::from(d[i]) | u32::from(d[i + 1]) << 8 | u32::from(d[i + 2]) << 16;
        (v.wrapping_mul(0x9E37_79B1) >> (32 - HASH_BITS)) as usize
    }

    fn insert(&mut self, i: usize) {
        if i + MIN_MATCH <= self.data.len() {
            let h = self.hash(i);
            self.prev[i % WINDOW] = self.head[h];
            self.head[h] = i as u32;
        }
    }

    /// La coincidencia más larga que empieza en `i` (antes de insertarlo).
    fn find(&self, i: usize) -> (usize, usize) {
        let d = self.data;
        if i + MIN_MATCH > d.len() {
            return (0, 0);
        }
        let max = MAX_MATCH.min(d.len() - i);
        let (mut best, mut dist) = (0, 0);
        let mut cand = self.head[self.hash(i)];
        for _ in 0..CHAIN {
            if cand == u32::MAX {
                break;
            }
            let c = cand as usize;
            if c >= i || i - c > WINDOW {
                break;
            }
            if d[c + best.min(max - 1)] == d[i + best.min(max - 1)] {
                let len = d[c..c + max]
                    .iter()
                    .zip(&d[i..i + max])
                    .take_while(|(a, b)| a == b)
                    .count();
                if len > best {
                    best = len;
                    dist = i - c;
                    if len >= NICE || len == max {
                        break;
                    }
                }
            }
            let next = self.prev[c % WINDOW];
            if next == u32::MAX || next as usize >= c {
                break;
            }
            cand = next;
        }
        if best >= MIN_MATCH { (best, dist) } else { (0, 0) }
    }
}

/// Comprime `data` en un flujo zlib completo (cabecera, bloques y Adler-32).
#[must_use]
pub fn zlib(data: &[u8]) -> Vec<u8> {
    let mut w = Writer {
        out: vec![0x78, 0xDA],
        buf: 0,
        count: 0,
    };
    let mut lz = Lz {
        data,
        head: vec![u32::MAX; 1 << HASH_BITS],
        prev: vec![u32::MAX; WINDOW],
    };
    let mut tokens = Vec::with_capacity(BLOCK + 1);
    let mut i = 0;
    while i < data.len() {
        let (len, dist) = lz.find(i);
        lz.insert(i);
        if (MIN_MATCH..NICE).contains(&len) && lz.find(i + 1).0 > len {
            tokens.push(Token {
                value: u16::from(data[i]),
                dist: 0,
            });
            i += 1;
        } else if len >= MIN_MATCH {
            tokens.push(Token {
                value: len as u16,
                dist: dist as u16,
            });
            for k in 1..len {
                lz.insert(i + k);
            }
            i += len;
        } else {
            tokens.push(Token {
                value: u16::from(data[i]),
                dist: 0,
            });
            i += 1;
        }
        if tokens.len() >= BLOCK {
            block(&mut w, &tokens, false);
            tokens.clear();
        }
    }
    block(&mut w, &tokens, true);
    w.flush();
    w.out.extend_from_slice(&adler32(data).to_be_bytes());
    w.out
}

// Longitudes de código de los dos alfabetos, comprimidas con 16/17/18.
fn rle(all: &[u8]) -> Vec<(u8, u8)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < all.len() {
        let l = all[i];
        let run = all[i..].iter().take_while(|&&x| x == l).count();
        let mut left = run;
        if l == 0 {
            while left >= 11 {
                let n = left.min(138);
                out.push((18, (n - 11) as u8));
                left -= n;
            }
            if left >= 3 {
                out.push((17, (left - 3) as u8));
                left = 0;
            }
        } else {
            out.push((l, 0));
            left -= 1;
            while left >= 3 {
                let n = left.min(6);
                out.push((16, (n - 3) as u8));
                left -= n;
            }
        }
        out.extend(std::iter::repeat_n((l, 0), left));
        i += run;
    }
    out
}

fn block(w: &mut Writer, tokens: &[Token], last: bool) {
    let mut lit_freq = [0u32; 286];
    let mut dist_freq = [0u32; 30];
    for t in tokens {
        if t.dist == 0 {
            lit_freq[usize::from(t.value)] += 1;
        } else {
            lit_freq[257 + bucket(&LEN_BASE, usize::from(t.value))] += 1;
            dist_freq[bucket(&DIST_BASE, usize::from(t.dist))] += 1;
        }
    }
    lit_freq[256] = 1;
    let lit_len = lengths(&lit_freq, 15);
    let mut dist_len = lengths(&dist_freq, 15);
    if dist_len.iter().all(|&l| l == 0) {
        dist_len[0] = 1;
    }
    let hlit = 257.max(lit_len.iter().rposition(|&l| l > 0).map_or(0, |p| p + 1));
    let hdist = 1.max(dist_len.iter().rposition(|&l| l > 0).map_or(0, |p| p + 1));
    let all: Vec<u8> = lit_len[..hlit]
        .iter()
        .chain(&dist_len[..hdist])
        .copied()
        .collect();
    let runs = rle(&all);
    let mut clen_freq = [0u32; 19];
    for &(sym, _) in &runs {
        clen_freq[usize::from(sym)] += 1;
    }
    let clen_len = lengths(&clen_freq, 7);
    let clen_code = codes(&clen_len);
    let hclen = 4.max(
        CLEN_ORDER
            .iter()
            .rposition(|&s| clen_len[s] > 0)
            .map_or(0, |p| p + 1),
    );

    w.put(u32::from(last), 1);
    w.put(2, 2);
    w.put((hlit - 257) as u32, 5);
    w.put((hdist - 1) as u32, 5);
    w.put((hclen - 4) as u32, 4);
    for &s in &CLEN_ORDER[..hclen] {
        w.put(u32::from(clen_len[s]), 3);
    }
    for &(sym, extra) in &runs {
        let s = usize::from(sym);
        w.put(u32::from(clen_code[s]), u32::from(clen_len[s]));
        match sym {
            16 => w.put(u32::from(extra), 2),
            17 => w.put(u32::from(extra), 3),
            18 => w.put(u32::from(extra), 7),
            _ => {}
        }
    }
    let lit_code = codes(&lit_len);
    let dist_code = codes(&dist_len);
    for t in tokens {
        if t.dist == 0 {
            let s = usize::from(t.value);
            w.put(u32::from(lit_code[s]), u32::from(lit_len[s]));
        } else {
            let (len, dist) = (usize::from(t.value), usize::from(t.dist));
            let li = bucket(&LEN_BASE, len);
            w.put(u32::from(lit_code[257 + li]), u32::from(lit_len[257 + li]));
            w.put((len - usize::from(LEN_BASE[li])) as u32, u32::from(LEN_EXTRA[li]));
            let di = bucket(&DIST_BASE, dist);
            w.put(u32::from(dist_code[di]), u32::from(dist_len[di]));
            w.put(
                (dist - usize::from(DIST_BASE[di])) as u32,
                u32::from(DIST_EXTRA[di]),
            );
        }
    }
    w.put(u32::from(lit_code[256]), u32::from(lit_len[256]));
}

#[cfg(test)]
mod tests {
    use super::zlib;
    use crate::inflate::inflate;

    fn round_trip(data: &[u8]) -> usize {
        let packed = zlib(data);
        assert_eq!(inflate(&packed, data.len() + 1).as_deref(), Ok(data));
        packed.len()
    }

    #[test]
    fn ida_y_vuelta() {
        round_trip(b"");
        round_trip(b"a");
        round_trip(b"hola hola hola");
        // Pseudoaleatorio (casi incompresible) y más grande que un bloque.
        let mut x = 7u32;
        let noise: std::vec::Vec<u8> = (0..70_000)
            .map(|_| {
                x = x.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                (x >> 16) as u8
            })
            .collect();
        round_trip(&noise);
    }

    #[test]
    fn comprime_como_zlib() {
        // Mismo texto que mide el test de JS: zlib (nivel 6) lo deja en 201 bytes.
        let mut text = "VERX ".repeat(2000);
        text.extend((0..3000).map(|i| char::from(32 + ((i * 7919) % 90) as u8)));
        let size = round_trip(text.as_bytes());
        assert!(size < 260, "comprimido en {size} bytes");
        // Repeticiones largas solapadas (distancia 1).
        assert!(round_trip(&std::vec![0u8; 100_000]) < 300);
    }
}
