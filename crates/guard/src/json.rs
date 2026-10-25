//! Parser JSON mínimo (sólo lo necesario para leer `package.json` y manifiestos).

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub(crate) fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(pairs) => pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub(crate) fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }

    pub(crate) fn entries(&self) -> &[(String, Json)] {
        match self {
            Json::Obj(pairs) => pairs,
            _ => &[],
        }
    }
}

pub(crate) fn parse(text: &str) -> Result<Json, String> {
    let mut p = Parser {
        s: text.as_bytes(),
        i: 0,
    };
    let value = p.value()?;
    p.ws();
    if p.i == p.s.len() {
        Ok(value)
    } else {
        Err(format!("texto sobrante en la posición {}", p.i))
    }
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.s.len() && self.s[self.i].is_ascii_whitespace() {
            self.i += 1;
        }
    }

    fn eat(&mut self, c: u8) -> Result<(), String> {
        self.ws();
        if self.s.get(self.i) == Some(&c) {
            self.i += 1;
            Ok(())
        } else {
            Err(format!("se esperaba '{}' en la posición {}", c as char, self.i))
        }
    }

    fn value(&mut self) -> Result<Json, String> {
        self.ws();
        match self.s.get(self.i) {
            Some(b'{') => self.object(),
            Some(b'[') => self.array(),
            Some(b'"') => self.string().map(Json::Str),
            Some(b't') => self.word("true", Json::Bool(true)),
            Some(b'f') => self.word("false", Json::Bool(false)),
            Some(b'n') => self.word("null", Json::Null),
            Some(c) if *c == b'-' || c.is_ascii_digit() => self.number(),
            _ => Err(format!("valor inesperado en la posición {}", self.i)),
        }
    }

    fn word(&mut self, w: &str, v: Json) -> Result<Json, String> {
        if self.s[self.i..].starts_with(w.as_bytes()) {
            self.i += w.len();
            Ok(v)
        } else {
            Err(format!("palabra inválida en la posición {}", self.i))
        }
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.i;
        while self.i < self.s.len()
            && matches!(self.s[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')
        {
            self.i += 1;
        }
        let text = std::str::from_utf8(&self.s[start..self.i]).map_err(|e| e.to_string())?;
        text.parse()
            .map(Json::Num)
            .map_err(|_| format!("número inválido: {text}"))
    }

    fn string(&mut self) -> Result<String, String> {
        self.eat(b'"')?;
        let mut out = Vec::new();
        while let Some(&c) = self.s.get(self.i) {
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(out).map_err(|e| e.to_string()),
                b'\\' => self.escape(&mut out)?,
                _ => out.push(c),
            }
        }
        Err("cadena sin cerrar".into())
    }

    fn escape(&mut self, out: &mut Vec<u8>) -> Result<(), String> {
        let esc = *self.s.get(self.i).ok_or("escape incompleto")?;
        self.i += 1;
        match esc {
            b'n' => out.push(b'\n'),
            b't' => out.push(b'\t'),
            b'r' => out.push(b'\r'),
            b'u' => {
                let hex = self.s.get(self.i..self.i + 4).ok_or("\\u incompleto")?;
                let hex = std::str::from_utf8(hex).map_err(|e| e.to_string())?;
                let code = u32::from_str_radix(hex, 16).map_err(|e| e.to_string())?;
                let ch = char::from_u32(code).unwrap_or('\u{fffd}');
                out.extend_from_slice(ch.to_string().as_bytes());
                self.i += 4;
            }
            other => out.push(other),
        }
        Ok(())
    }

    fn array(&mut self) -> Result<Json, String> {
        self.eat(b'[')?;
        let mut items = Vec::new();
        self.ws();
        if self.s.get(self.i) == Some(&b']') {
            self.i += 1;
            return Ok(Json::Arr(items));
        }
        loop {
            items.push(self.value()?);
            self.ws();
            match self.s.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b']') => {
                    self.i += 1;
                    return Ok(Json::Arr(items));
                }
                _ => return Err(format!("se esperaba ',' o ']' en la posición {}", self.i)),
            }
        }
    }

    fn object(&mut self) -> Result<Json, String> {
        self.eat(b'{')?;
        let mut pairs = Vec::new();
        self.ws();
        if self.s.get(self.i) == Some(&b'}') {
            self.i += 1;
            return Ok(Json::Obj(pairs));
        }
        loop {
            self.ws();
            let key = self.string()?;
            self.eat(b':')?;
            pairs.push((key, self.value()?));
            self.ws();
            match self.s.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    return Ok(Json::Obj(pairs));
                }
                _ => return Err(format!("se esperaba ',' o '}}' en la posición {}", self.i)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_un_package_json() {
        let text = r#"{ "name": "@verx/ui", "deps": { "a": "workspace:*" }, "n": -1.5e2, "ok": true, "l": [1, null] }"#;
        let j = parse(text).unwrap_or(Json::Null);
        assert_eq!(j.get("name").and_then(Json::as_str), Some("@verx/ui"));
        assert_eq!(j.get("deps").map(|d| d.entries().len()), Some(1));
        assert_eq!(j.get("n"), Some(&Json::Num(-150.0)));
        assert_eq!(j.get("l"), Some(&Json::Arr(vec![Json::Num(1.0), Json::Null])));
    }

    #[test]
    fn escapes_y_errores() {
        assert_eq!(parse(r#""a\"bé""#), Ok(Json::Str("a\"bé".into())));
        assert!(parse("{ \"a\": 1 ").is_err());
        assert!(parse("[1, 2] x").is_err());
    }
}
