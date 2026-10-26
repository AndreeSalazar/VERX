//! CRC-32 (los trozos del PNG) y Adler-32 (el final de un flujo zlib).

const fn crc_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut n = 0;
    while n < 256 {
        let mut c = n as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 == 1 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
            k += 1;
        }
        table[n] = c;
        n += 1;
    }
    table
}

const CRC: [u32; 256] = crc_table();

/// CRC-32 de varios trozos seguidos (en el PNG: tipo del trozo + datos).
#[must_use]
pub fn crc32(parts: &[&[u8]]) -> u32 {
    let mut c = 0xFFFF_FFFF_u32;
    for part in parts {
        for &b in *part {
            c = CRC[((c ^ u32::from(b)) & 0xFF) as usize] ^ (c >> 8);
        }
    }
    c ^ 0xFFFF_FFFF
}

/// Adler-32 de `data`.
#[must_use]
pub fn adler32(data: &[u8]) -> u32 {
    const MOD: u32 = 65_521;
    let (mut a, mut b) = (1u32, 0u32);
    // 5552 es el mayor bloque que no desborda u32 antes de reducir.
    for chunk in data.chunks(5552) {
        for &x in chunk {
            a += u32::from(x);
            b += a;
        }
        a %= MOD;
        b %= MOD;
    }
    (b << 16) | a
}

#[cfg(test)]
mod tests {
    use super::{adler32, crc32};

    #[test]
    fn valores_conocidos() {
        assert_eq!(crc32(&[b"123456789"]), 0xCBF4_3926);
        assert_eq!(crc32(&[b"1234", b"56789"]), 0xCBF4_3926);
        assert_eq!(crc32(&[b"IEND"]), 0xAE42_6082);
        assert_eq!(adler32(b"Wikipedia"), 0x11E6_0398);
        assert_eq!(adler32(&[]), 1);
    }
}
