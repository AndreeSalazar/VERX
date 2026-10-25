//! Reglas de estructura del proyecto y del puente Rust → JS.

use std::process::Command;

use super::Problem;
use crate::hash::sim_hash;
use crate::json::{self, Json};
use crate::repo::Repo;

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

pub(super) fn wasm_al_dia(repo: &Repo) -> Vec<Problem> {
    const MANIFEST: &str = "packages/sim/sim.manifest.json";
    if !repo.exists("packages/sim/sim.wasm") {
        return vec![Problem::new("packages/sim/sim.wasm", "no existe")];
    }
    let Some(text) = repo.read(MANIFEST) else {
        return vec![Problem::new(MANIFEST, "no existe")];
    };
    let recorded = json::parse(&text)
        .ok()
        .and_then(|m| m.get("sourceHash").and_then(Json::as_str).map(String::from));
    let current = sim_hash(repo);
    if recorded.as_deref() == Some(current.as_str()) {
        Vec::new()
    } else {
        vec![Problem::new(
            MANIFEST,
            format!(
                "el .wasm se compiló desde otro código (huella {} ≠ {current})",
                recorded.unwrap_or_else(|| "?".into())
            ),
        )]
    }
}

/// Delegada en scripts/check-architecture.js, que usa el AST real de Bun.
pub(super) fn imports_js(repo: &Repo) -> Vec<Problem> {
    let output = Command::new("bun")
        .arg("scripts/check-architecture.js")
        .current_dir(&repo.root)
        .output();
    match output {
        Err(e) => vec![Problem::new(
            "scripts/check-architecture.js",
            format!("no se pudo ejecutar bun: {e}"),
        )],
        Ok(o) if o.status.success() => Vec::new(),
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            let problems: Vec<Problem> = text
                .lines()
                .filter_map(|l| l.trim_start().strip_prefix("· "))
                .map(|l| match l.split_once(": ") {
                    Some((file, msg)) => Problem::new(file.replace('\\', "/"), msg),
                    None => Problem::new("", l),
                })
                .collect();
            if problems.is_empty() {
                vec![Problem::new(
                    "scripts/check-architecture.js",
                    text.trim().to_string(),
                )]
            } else {
                problems
            }
        }
    }
}
