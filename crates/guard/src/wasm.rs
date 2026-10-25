//! Puentes Rust → JS. Un crate es puente si lo declara en su `Cargo.toml`:
//!
//! ```toml
//! [package.metadata.verx]
//! bridge = "packages/sim"   # paquete JS que lo envuelve
//! wasm = "sim.wasm"         # nombre del archivo dentro de ese paquete
//! ```
//!
//! `verx-guard wasm` es el ÚNICO paso que cruza la frontera: compila cada
//! puente a WebAssembly, lo copia a su paquete y escribe un manifiesto con la
//! huella del código fuente (la regla `wasm-al-dia` la compara).

use std::fs;
use std::process::Command;

use crate::hash::crate_hash;
use crate::repo::Repo;
use crate::toml;

const TARGET: &str = "wasm32-unknown-unknown";

#[derive(Debug, PartialEq)]
pub(crate) struct Bridge {
    /// "crates/sim"
    pub(crate) krate: String,
    /// "verx-sim"
    pub(crate) name: String,
    /// "packages/sim"
    pub(crate) dir: String,
    /// "sim.wasm"
    pub(crate) wasm: String,
}

impl Bridge {
    pub(crate) fn wasm_path(&self) -> String {
        format!("{}/{}", self.dir, self.wasm)
    }

    pub(crate) fn manifest_path(&self) -> String {
        format!(
            "{}/{}.manifest.json",
            self.dir,
            self.wasm.trim_end_matches(".wasm")
        )
    }
}

/// Lee la declaración de puente de un `Cargo.toml` (si la tiene).
pub(crate) fn bridge_from_toml(krate: &str, text: &str) -> Option<Bridge> {
    let entries = toml::parse(text);
    let value = |section: &str, key: &str| {
        entries
            .iter()
            .find(|e| e.section == section && e.key == key)
            .map(|e| toml::unquote(&e.value).to_string())
    };
    Some(Bridge {
        krate: krate.to_string(),
        name: value("package", "name")?,
        dir: value("package.metadata.verx", "bridge")?,
        wasm: value("package.metadata.verx", "wasm")?,
    })
}

pub(crate) fn bridges(repo: &Repo) -> Vec<Bridge> {
    repo.members("crates", "Cargo.toml")
        .into_iter()
        .filter_map(|k| bridge_from_toml(&k, &repo.read(&format!("{k}/Cargo.toml")).unwrap_or_default()))
        .collect()
}

pub(crate) fn build(repo: &Repo) -> Result<Vec<String>, String> {
    bridges(repo).iter().map(|b| build_one(repo, b)).collect()
}

fn build_one(repo: &Repo, b: &Bridge) -> Result<String, String> {
    let status = Command::new("cargo")
        .args(["build", "--release", "--target", TARGET, "-p", &b.name])
        .current_dir(repo.root.join("crates"))
        .status()
        .map_err(|e| format!("no se pudo ejecutar cargo: {e}"))?;
    if !status.success() {
        return Err(format!("cargo build de {} falló", b.name));
    }

    let artifact = format!("{}.wasm", b.name.replace('-', "_"));
    let built = repo
        .root
        .join("crates/target")
        .join(TARGET)
        .join("release")
        .join(artifact);
    let bytes = fs::read(&built).map_err(|e| format!("no encuentro {}: {e}", built.display()))?;
    fs::create_dir_all(repo.root.join(&b.dir)).map_err(|e| e.to_string())?;
    fs::write(repo.root.join(b.wasm_path()), &bytes).map_err(|e| e.to_string())?;

    let abi = abi_version(repo, b).ok_or(format!("no encuentro ABI_VERSION en {}/src/abi.rs", b.krate))?;
    let hash = crate_hash(repo, &b.krate);
    let manifest = format!(
        "{{\n  \"abi\": {abi},\n  \"bytes\": {},\n  \"sourceHash\": \"{hash}\"\n}}\n",
        bytes.len()
    );
    fs::write(repo.root.join(b.manifest_path()), manifest).map_err(|e| e.to_string())?;
    Ok(format!(
        "{} · {} bytes · ABI {abi} · huella {hash}",
        b.wasm_path(),
        bytes.len()
    ))
}

fn abi_version(repo: &Repo, b: &Bridge) -> Option<u32> {
    repo.read(&format!("{}/src/abi.rs", b.krate))?
        .lines()
        .find_map(|l| l.trim().strip_prefix("pub const ABI_VERSION: u32 = "))
        .and_then(|rest| rest.trim_end_matches(';').trim().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_la_declaracion_de_puente() {
        let toml = "[package]\nname = \"verx-search\"\n\n[package.metadata.verx]\nbridge = \"packages/search\"\nwasm = \"search.wasm\"\n";
        let b = bridge_from_toml("crates/search", toml);
        assert_eq!(
            b.as_ref().map(Bridge::wasm_path).as_deref(),
            Some("packages/search/search.wasm")
        );
        assert_eq!(
            b.map(|b| b.manifest_path()).as_deref(),
            Some("packages/search/search.manifest.json")
        );
        assert!(bridge_from_toml("crates/guard", "[package]\nname = \"verx-guard\"\n").is_none());
    }
}
