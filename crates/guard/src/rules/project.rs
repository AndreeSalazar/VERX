//! Reglas de estructura del proyecto y del puente Rust → JS.

use std::process::Command;

use super::Problem;
use crate::hash::crate_hash;
use crate::json::{self, Json};
use crate::repo::Repo;
use crate::wasm::bridges;

pub(super) fn completo(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    let mut members: Vec<(String, bool)> = repo
        .members("packages", "package.json")
        .into_iter()
        .map(|d| (d, false))
        .collect();
    members.extend(
        repo.members("crates", "Cargo.toml")
            .into_iter()
            .map(|d| (d, true)),
    );
    for (dir, rust) in members {
        if !repo.exists(&format!("{dir}/README.md")) {
            out.push(Problem::new(&dir, "falta README.md"));
        }
        let prefix = format!("{dir}/");
        let has_tests = if rust {
            repo.with_ext(&[".rs"], &prefix)
                .any(|f| repo.read(f).is_some_and(|t| t.contains("#[test]")))
        } else {
            repo.files
                .iter()
                .any(|f| f.starts_with(&format!("{prefix}test/")) && f.contains(".test."))
        };
        if !has_tests {
            out.push(Problem::new(&dir, "no tiene tests"));
        }
    }
    out
}

/// Cada puente declarado tiene su `.wasm` compilado desde el código actual.
pub(super) fn wasm_al_dia(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for b in bridges(repo) {
        if !repo.exists(&b.wasm_path()) {
            out.push(Problem::new(b.wasm_path(), "no existe"));
            continue;
        }
        let manifest = b.manifest_path();
        let Some(text) = repo.read(&manifest) else {
            out.push(Problem::new(manifest, "no existe"));
            continue;
        };
        let recorded = json::parse(&text)
            .ok()
            .and_then(|m| m.get("sourceHash").and_then(Json::as_str).map(String::from));
        let current = crate_hash(repo, &b.krate);
        if recorded.as_deref() != Some(current.as_str()) {
            let was = recorded.unwrap_or_else(|| "?".into());
            out.push(Problem::new(
                manifest,
                format!("el .wasm se compiló desde otro código (huella {was} ≠ {current})"),
            ));
        }
    }
    out
}

/// Ejecuta `bun <args>` en `dir` y convierte sus líneas `· dónde: qué` en
/// problemas. Así las reglas que necesitan el mundo JS lo delegan en Bun.
fn delegate(repo: &Repo, dir: &str, args: &[&str], origin: &str) -> Vec<Problem> {
    match Command::new("bun")
        .args(args)
        .current_dir(repo.root.join(dir))
        .output()
    {
        Err(e) => vec![Problem::new(origin, format!("no se pudo ejecutar bun: {e}"))],
        Ok(o) if o.status.success() => Vec::new(),
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            let problems = dot_lines(&text);
            if problems.is_empty() {
                let stderr = String::from_utf8_lossy(&o.stderr);
                vec![Problem::new(origin, format!("{}{}", text.trim(), stderr.trim()))]
            } else {
                problems
            }
        }
    }
}

fn dot_lines(text: &str) -> Vec<Problem> {
    text.lines()
        .filter_map(|l| l.trim_start().strip_prefix("· "))
        .map(|l| match l.split_once(": ") {
            Some((place, msg)) => Problem::new(place.replace('\\', "/"), msg),
            None => Problem::new("", l),
        })
        .collect()
}

/// Delegada en scripts/check-architecture.js, que usa el AST real de Bun.
pub(super) fn imports_js(repo: &Repo) -> Vec<Problem> {
    delegate(
        repo,
        "",
        &["scripts/check-architecture.js"],
        "scripts/check-architecture.js",
    )
}

/// Presupuesto de rendimiento: cada app con script `budget` lo ejecuta
/// (`verx budget` mide el JS + WASM que transfiere cada página con brotli).
pub(super) fn presupuesto(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for app in repo.members("apps", "package.json") {
        let pkg = json::parse(&repo.read(&format!("{app}/package.json")).unwrap_or_default());
        let has_budget = pkg
            .ok()
            .and_then(|p| p.get("scripts").and_then(|s| s.get("budget")).cloned())
            .is_some();
        if !has_budget {
            out.push(Problem::new(
                &app,
                "no declara el script \"budget\" (verx budget)",
            ));
            continue;
        }
        out.extend(
            delegate(repo, &app, &["run", "budget"], &app)
                .into_iter()
                .map(|p| {
                    if p.file.is_empty() || p.file == app {
                        p
                    } else {
                        Problem::new(format!("{app} {}", p.file), p.message)
                    }
                }),
        );
    }
    out
}

#[cfg(test)]
mod tests {
    use super::dot_lines;

    #[test]
    fn convierte_lineas_de_bun_en_problemas() {
        let out = "[verx] tabla\n  ✔ /  9.0 KB\n  · /: la página manda 13.0 KB\n  · Galaxy: la isla pesa 9.1 KB\n✖ 2 fuera";
        let problems = dot_lines(out);
        assert_eq!(problems.len(), 2);
        assert_eq!(
            (problems[0].file.as_str(), problems[0].message.as_str()),
            ("/", "la página manda 13.0 KB")
        );
        assert_eq!(problems[1].file, "Galaxy");
    }
}
