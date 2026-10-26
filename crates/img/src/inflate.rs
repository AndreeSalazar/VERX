//! Descompresión DEFLATE (RFC 1951) dentro de un flujo zlib (RFC 1950): lo que
//! guarda los píxeles de un PNG. Bloques sin comprimir, con códigos de Huffman
//! fijos y dinámicos. La decodificación canónica sigue a `puff.c` de zlib.

use crate::Error;
use crate::checksum::adler32;

const MAX_BITS: usize = 15;

// Bases y bits extra de las longitudes (257..285) y distancias (0..29).
pub(crate) const LEN_BASE: [u16; 29] = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195,
    227, 258,
];
pub(crate) const LEN_EXTRA: [u8; 29] = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
pub(crate) const DIST_BASE: [u16; 30] = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
    4097, 6145, 8193, 12289, 16385, 24577,
];
pub(crate) const DIST_EXTRA: [u8; 30] = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
/// Orden en que llegan las longitudes del alfabeto de longitudes de código.
pub(crate) const CLEN_ORDER: [usize; 19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

struct Bits<'a> {
    data: &'a [u8],
    pos: usize,
    buf: u32,
    count: u32,
}

impl Bits<'_> {
    fn bits(&mut self, n: u32) -> Result<u32, Error> {
        while self.count < n {
            let byte = *self.data.get(self.pos).ok_or(Error::Truncated)?;
            self.pos += 1;
            self.buf |= u32::from(byte) << self.count;
            self.count += 8;
        }
        let v = self.buf & ((1u32 << n) - 1);
        self.buf = if n == 32 { 0 } else { self.buf >> n };
        self.count -= n;
        Ok(v)
    }

    fn align(&mut self) {
        self.buf = 0;
        self.count = 0;
    }
}

/// Un código de Huffman canónico: cuántos símbolos hay de cada longitud y cuáles.
struct Huffman {
    count: [u16; MAX_BITS + 1],
    symbol: Vec<u16>,
}

impl Huffman {
    fn new(lengths: &[u8]) -> Result<Self, Error> {
        let mut count = [0u16; MAX_BITS + 1];
        for &l in lengths {
            count[usize::from(l)] += 1;
        }
        count[0] = 0;
        // Un código con más combinaciones de las posibles está corrupto.
        let mut left: i32 = 1;
        for &c in &count[1..] {
            left = (left << 1) - i32::from(c);
            if left < 0 {
                return Err(Error::Corrupt("código de Huffman imposible"));
            }
        }
        let mut offs = [0u16; MAX_BITS + 1];
        for len in 1..MAX_BITS {
            offs[len + 1] = offs[len] + count[len];
        }
        let mut symbol = vec![0u16; lengths.len()];
        for (s, &l) in lengths.iter().enumerate() {
            if l != 0 {
                symbol[usize::from(offs[usize::from(l)])] = s as u16;
                offs[usize::from(l)] += 1;
            }
        }
        Ok(Self { count, symbol })
    }

    fn decode(&self, bits: &mut Bits<'_>) -> Result<u16, Error> {
        let (mut code, mut first, mut index) = (0i32, 0i32, 0i32);
        for len in 1..=MAX_BITS {
            code |= bits.bits(1)?.cast_signed();
            let count = i32::from(self.count[len]);
            if code - count < first {
                return self
                    .symbol
                    .get((index + code - first) as usize)
                    .copied()
                    .ok_or(Error::Corrupt("símbolo fuera de rango"));
            }
            index += count;
            first = (first + count) << 1;
            code <<= 1;
        }
        Err(Error::Corrupt("código de Huffman inexistente"))
    }
}

fn codes(bits: &mut Bits<'_>, out: &mut Vec<u8>, lit: &Huffman, dist: &Huffman) -> Result<(), Error> {
    loop {
        let sym = lit.decode(bits)?;
        match sym {
            0..=255 => out.push(sym as u8),
            256 => return Ok(()),
            _ => {
                let i = usize::from(sym - 257);
                let len = usize::from(*LEN_BASE.get(i).ok_or(Error::Corrupt("longitud inválida"))?)
                    + bits.bits(u32::from(LEN_EXTRA[i]))? as usize;
                let d = usize::from(dist.decode(bits)?);
                let distance = usize::from(*DIST_BASE.get(d).ok_or(Error::Corrupt("distancia inválida"))?)
                    + bits.bits(u32::from(DIST_EXTRA[d]))? as usize;
                if distance > out.len() {
                    return Err(Error::Corrupt("distancia más allá del principio"));
                }
                let start = out.len() - distance;
                // Puede solaparse consigo misma (repeticiones): byte a byte.
                for k in 0..len {
                    out.push(out[start + k]);
                }
            }
        }
    }
}

fn fixed() -> Result<(Huffman, Huffman), Error> {
    let mut lengths = [0u8; 288];
    lengths[..144].fill(8);
    lengths[144..256].fill(9);
    lengths[256..280].fill(7);
    lengths[280..].fill(8);
    Ok((Huffman::new(&lengths)?, Huffman::new(&[5; 30])?))
}

fn dynamic(bits: &mut Bits<'_>) -> Result<(Huffman, Huffman), Error> {
    let nlen = bits.bits(5)? as usize + 257;
    let ndist = bits.bits(5)? as usize + 1;
    let ncode = bits.bits(4)? as usize + 4;
    if nlen > 286 || ndist > 30 {
        return Err(Error::Corrupt("demasiados códigos"));
    }
    let mut clen = [0u8; 19];
    for &i in &CLEN_ORDER[..ncode] {
        clen[i] = bits.bits(3)? as u8;
    }
    let lencode = Huffman::new(&clen)?;
    let mut lengths = [0u8; 316];
    let mut i = 0;
    while i < nlen + ndist {
        let sym = lencode.decode(bits)?;
        let (value, repeat) = match sym {
            0..=15 => (sym as u8, 1),
            16 if i > 0 => (lengths[i - 1], 3 + bits.bits(2)? as usize),
            16 => return Err(Error::Corrupt("repetición sin longitud previa")),
            17 => (0, 3 + bits.bits(3)? as usize),
            _ => (0, 11 + bits.bits(7)? as usize),
        };
        if i + repeat > nlen + ndist {
            return Err(Error::Corrupt("demasiadas longitudes"));
        }
        lengths[i..i + repeat].fill(value);
        i += repeat;
    }
    if lengths[256] == 0 {
        return Err(Error::Corrupt("falta el fin de bloque"));
    }
    Ok((
        Huffman::new(&lengths[..nlen])?,
        Huffman::new(&lengths[nlen..nlen + ndist])?,
    ))
}

/// Descomprime un flujo zlib completo y comprueba su Adler-32. `limit` acota la
/// salida (un PNG malicioso no puede pedir gigas de memoria).
///
/// # Errors
/// Si el flujo está cortado o corrupto, o si pasaría de `limit` bytes.
pub fn inflate(zlib: &[u8], limit: usize) -> Result<Vec<u8>, Error> {
    let (&cmf, &flg) = (
        zlib.first().ok_or(Error::Truncated)?,
        zlib.get(1).ok_or(Error::Truncated)?,
    );
    if cmf & 0x0F != 8 || (u16::from(cmf) * 256 + u16::from(flg)) % 31 != 0 || flg & 0x20 != 0 {
        return Err(Error::Corrupt("cabecera zlib inválida"));
    }
    let mut bits = Bits {
        data: &zlib[2..],
        pos: 0,
        buf: 0,
        count: 0,
    };
    let mut out = Vec::new();
    loop {
        let last = bits.bits(1)? == 1;
        match bits.bits(2)? {
            0 => {
                bits.align();
                let rest = &bits.data[bits.pos..];
                let (Some(len), Some(nlen)) = (rest.get(..2), rest.get(2..4)) else {
                    return Err(Error::Truncated);
                };
                let len = usize::from(u16::from_le_bytes([len[0], len[1]]));
                if len != usize::from(!u16::from_le_bytes([nlen[0], nlen[1]])) {
                    return Err(Error::Corrupt("bloque sin comprimir inválido"));
                }
                out.extend_from_slice(rest.get(4..4 + len).ok_or(Error::Truncated)?);
                bits.pos += 4 + len;
            }
            1 => {
                let (lit, dist) = fixed()?;
                codes(&mut bits, &mut out, &lit, &dist)?;
            }
            2 => {
                let (lit, dist) = dynamic(&mut bits)?;
                codes(&mut bits, &mut out, &lit, &dist)?;
            }
            _ => return Err(Error::Corrupt("tipo de bloque inválido")),
        }
        if out.len() > limit {
            return Err(Error::TooLarge);
        }
        if last {
            break;
        }
    }
    let tail = bits.data.get(bits.pos..bits.pos + 4).ok_or(Error::Truncated)?;
    if u32::from_be_bytes([tail[0], tail[1], tail[2], tail[3]]) != adler32(&out) {
        return Err(Error::Corrupt("adler-32 no coincide"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::inflate;
    use crate::Error;

    #[test]
    fn bloques_fijos_y_sin_comprimir() {
        // deflateSync("hola hola hola") de node:zlib (Huffman fijo, con repetición).
        let fixed = [
            0x78, 0x9c, 0xcb, 0xc8, 0xcf, 0x49, 0x54, 0xc8, 0x80, 0x11, 0x00, 0x26, 0xfc, 0x05, 0x2d,
        ];
        assert_eq!(inflate(&fixed, 1 << 20).as_deref(), Ok(&b"hola hola hola"[..]));
        // Un bloque sin comprimir: "abc".
        let stored = [
            0x78, 0x01, 0x01, 0x03, 0x00, 0xfc, 0xff, b'a', b'b', b'c', 0x02, 0x4d, 0x01, 0x27,
        ];
        assert_eq!(inflate(&stored, 1 << 20).as_deref(), Ok(&b"abc"[..]));
    }

    #[test]
    fn detecta_datos_rotos() {
        let fixed = [
            0x78, 0x9c, 0xcb, 0xc8, 0xcf, 0x49, 0x54, 0xc8, 0x80, 0x11, 0x00, 0x26, 0xfc, 0x05, 0x2e,
        ];
        assert_eq!(
            inflate(&fixed, 1 << 20),
            Err(Error::Corrupt("adler-32 no coincide"))
        );
        assert_eq!(inflate(&fixed[..8], 1 << 20), Err(Error::Truncated));
        assert_eq!(
            inflate(&[0x78, 0x9d], 1 << 20),
            Err(Error::Corrupt("cabecera zlib inválida"))
        );
    }
}
