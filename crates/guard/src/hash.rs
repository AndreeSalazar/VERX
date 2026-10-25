//! FNV-1a de 64 bits: huella estable del código fuente de un crate puente.

use std::path::Path;

use crate::repo::Repo;

pub(crate) struct Fnv(u64);

impl Fnv {
    pub(crate) fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }

    pub(crate) fn write(&mut self, bytes: &[u8]) {
        for b in bytes {
            self.0 ^= u64::from(*b);
            self.0 = self.0.wrapping_mul(0x0100_0000_01b3);
        }
    }

    pub(crate) fn hex(&self) -> String {
        format!("{:016x}", self.0)
    }
}

/// Archivos que determinan el `.wasm` de un crate (`krate` = "crates/sim"):
/// si cambia cualquiera, hay que recompilar.
pub(crate) fn crate_sources<'a>(repo: &'a Repo, krate: &str) -> Vec<&'a String> {
    let manifest = format!("{krate}/Cargo.toml");
    let src = format!("{krate}/src/");
    repo.files
        .iter()
        .filter(|f| {
            matches!(f.as_str(), "crates/Cargo.toml" | "crates/rust-toolchain.toml")
                || **f == manifest
                || (f.starts_with(&src) && Path::new(f.as_str()).extension().is_some_and(|e| e == "rs"))
        })
        .collect()
}

/// Huella del código de un crate (independiente de CRLF/LF).
pub(crate) fn crate_hash(repo: &Repo, krate: &str) -> String {
    let mut h = Fnv::new();
    for f in crate_sources(repo, krate) {
        h.write(f.as_bytes());
        h.write(&[0]);
        h.write(repo.read(f).unwrap_or_default().replace('\r', "").as_bytes());
        h.write(&[0]);
    }
    h.hex()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv_conocido() {
        let mut h = Fnv::new();
        h.write(b"a");
        assert_eq!(h.hex(), "af63dc4c8601ec8c");
    }
}
