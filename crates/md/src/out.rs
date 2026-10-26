//! Salida en un buffer de tamaño fijo. Si no cabe, se marca el desbordamiento y
//! se deja de escribir (sin pánico): quien llama lo comprueba al final.

/// Un buffer de salida con escape para HTML y para cadenas JSON.
pub struct Out<'a> {
    buf: &'a mut [u8],
    len: usize,
    overflow: bool,
}

impl<'a> Out<'a> {
    /// Escribe en `buf` desde el principio.
    pub fn new(buf: &'a mut [u8]) -> Self {
        Self {
            buf,
            len: 0,
            overflow: false,
        }
    }

    /// Bytes escritos.
    #[must_use]
    pub fn len(&self) -> usize {
        self.len
    }

    /// ¿Aún no se ha escrito nada?
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// ¿Algo no cupo?
    #[must_use]
    pub fn overflowed(&self) -> bool {
        self.overflow
    }

    /// Lo escrito hasta ahora.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.buf[..self.len]
    }

    /// Vuelve a una longitud anterior (para descartar lo último).
    pub fn truncate(&mut self, len: usize) {
        self.len = self.len.min(len);
    }

    /// Bytes tal cual (marcado de confianza).
    pub fn raw(&mut self, s: &[u8]) {
        if self.overflow {
            return;
        }
        match self.buf.get_mut(self.len..self.len + s.len()) {
            Some(dst) => {
                dst.copy_from_slice(s);
                self.len += s.len();
            }
            None => self.overflow = true,
        }
    }

    /// Texto de confianza.
    pub fn str(&mut self, s: &str) {
        self.raw(s.as_bytes());
    }

    /// Un número en decimal.
    pub fn num(&mut self, mut n: usize) {
        let mut digits = [0u8; 20];
        let mut i = digits.len();
        loop {
            i -= 1;
            digits[i] = b'0' + (n % 10) as u8;
            n /= 10;
            if n == 0 {
                break;
            }
        }
        self.raw(&digits[i..]);
    }

    /// Texto escapado para HTML (contenido y atributos entre comillas dobles).
    pub fn text(&mut self, s: &[u8]) {
        let mut from = 0;
        for (i, &b) in s.iter().enumerate() {
            let entity: &[u8] = match b {
                b'&' => b"&amp;",
                b'<' => b"&lt;",
                b'>' => b"&gt;",
                b'"' => b"&quot;",
                b'\'' => b"&#39;",
                _ => continue,
            };
            self.raw(&s[from..i]);
            self.raw(entity);
            from = i + 1;
        }
        self.raw(&s[from..]);
    }

    /// Contenido de una cadena JSON (sin las comillas).
    pub fn json(&mut self, s: &[u8]) {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut from = 0;
        for (i, &b) in s.iter().enumerate() {
            if b != b'"' && b != b'\\' && b >= 0x20 {
                continue;
            }
            self.raw(&s[from..i]);
            match b {
                b'"' => self.raw(b"\\\""),
                b'\\' => self.raw(b"\\\\"),
                b'\n' => self.raw(b"\\n"),
                b'\t' => self.raw(b"\\t"),
                _ => self.raw(&[
                    b'\\',
                    b'u',
                    b'0',
                    b'0',
                    HEX[usize::from(b >> 4)],
                    HEX[usize::from(b & 15)],
                ]),
            }
            from = i + 1;
        }
        self.raw(&s[from..]);
    }
}

#[cfg(test)]
mod tests {
    use super::Out;

    #[test]
    fn escapa_html_y_json() {
        let mut buf = [0u8; 128];
        let mut out = Out::new(&mut buf);
        out.text(b"<a href=\"x\">'&'</a>");
        assert_eq!(
            out.as_bytes(),
            b"&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
        );
        let mut buf = [0u8; 64];
        let mut out = Out::new(&mut buf);
        out.json(b"di \"hola\"\\\n\x01");
        assert_eq!(out.as_bytes(), b"di \\\"hola\\\"\\\\\\n\\u0001");
    }

    #[test]
    fn marca_el_desbordamiento_sin_panico() {
        let mut buf = [0u8; 4];
        let mut out = Out::new(&mut buf);
        out.str("abc");
        out.str("de");
        assert!(out.overflowed());
        assert_eq!(out.as_bytes(), b"abc");
        out.num(7);
        assert_eq!(out.len(), 3);
    }

    #[test]
    fn numeros() {
        let mut buf = [0u8; 32];
        let mut out = Out::new(&mut buf);
        out.num(0);
        out.raw(b",");
        out.num(1_234_567);
        assert_eq!(out.as_bytes(), b"0,1234567");
    }
}
