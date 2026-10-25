//! `verx-guard wasm`: el ÚNICO paso que cruza la frontera Rust → JS.
//! Compila crates/sim a WebAssembly, lo copia a packages/sim/sim.wasm y
//! escribe un manifiesto con la huella del código fuente (la regla
//! `wasm-al-dia` la compara para detectar un .wasm desactualizado).

use std::fs;
use std::process::Command;

use crate::hash::sim_hash;
use crate::repo::Repo;

const TARGET: &str = "wasm32-unknown-unknown";

pub(crate) fn build(repo: &Repo) -> Result<String, String> {
    let status = Command::new("cargo")
        .args(["build", "--release", "--target", TARGET, "-p", "verx-sim"])
        .current_dir(repo.root.join("crates"))
        .status()
        .map_err(|e| format!("no se pudo ejecutar cargo: {e}"))?;
    if !status.success() {
        return Err("cargo build falló".into());
    }

    let built = repo
        .root
        .join("crates/target")
        .join(TARGET)
        .join("release/verx_sim.wasm");
    let bytes = fs::read(&built).map_err(|e| format!("no encuentro {}: {e}", built.display()))?;
    let dest = repo.root.join("packages/sim");
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    fs::write(dest.join("sim.wasm"), &bytes).map_err(|e| e.to_string())?;

    let abi = abi_version(repo).ok_or("no encuentro ABI_VERSION en crates/sim/src/abi.rs")?;
    let hash = sim_hash(repo);
    let manifest = format!(
        "{{\n  \"abi\": {abi},\n  \"bytes\": {},\n  \"sourceHash\": \"{hash}\"\n}}\n",
        bytes.len()
    );
    fs::write(dest.join("sim.manifest.json"), manifest).map_err(|e| e.to_string())?;
    Ok(format!(
        "packages/sim/sim.wasm · {} bytes · ABI {abi} · huella {hash}",
        bytes.len()
    ))
}

fn abi_version(repo: &Repo) -> Option<u32> {
    repo.read("crates/sim/src/abi.rs")?
        .lines()
        .find_map(|l| l.trim().strip_prefix("pub const ABI_VERSION: u32 = "))
        .and_then(|rest| rest.trim_end_matches(';').trim().parse().ok())
}
