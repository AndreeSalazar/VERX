//! # verx-guard
//!
//! El guardián de las reglas del repositorio VERX. Sin dependencias.
//!
//! ```text
//! verx-guard check [--quick]   revisa todas las reglas (sale con 1 si alguna falla)
//! verx-guard rules             lista las reglas con su explicación
//! verx-guard wasm              compila crates/sim y lo publica en packages/sim
//! ```

mod hash;
mod json;
mod repo;
mod rules;
mod toml;
mod wasm;

use std::process::ExitCode;

use repo::Repo;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map_or("check", String::as_str);
    let quick = args.iter().any(|a| a == "--quick");

    let Some(root) = std::env::current_dir().ok().and_then(|d| repo::find_root(&d)) else {
        eprintln!("verx-guard: no encuentro la raíz del repo (package.json + crates/Cargo.toml)");
        return ExitCode::from(2);
    };
    let repo = match Repo::open(&root) {
        Ok(repo) => repo,
        Err(e) => {
            eprintln!("verx-guard: {e}");
            return ExitCode::from(2);
        }
    };

    match command {
        "check" => check(&repo, quick),
        "rules" => {
            for r in rules::RULES {
                println!("{:<18} {}\n{:<18} → {}", r.id, r.title, "", r.fix);
            }
            ExitCode::SUCCESS
        }
        "wasm" => match wasm::build(&repo) {
            Ok(summary) => {
                println!("✔ {summary}");
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("✖ {e}");
                ExitCode::FAILURE
            }
        },
        other => {
            eprintln!("verx-guard: comando desconocido \"{other}\" (usa check, rules o wasm)");
            ExitCode::from(2)
        }
    }
}

fn check(repo: &Repo, quick: bool) -> ExitCode {
    let outcomes = rules::run(repo, quick);
    println!(
        "verx-guard · {} reglas · {} archivos{}",
        outcomes.len(),
        repo.files.len(),
        if quick { " · rápido" } else { "" }
    );
    let mut broken = 0;
    for o in &outcomes {
        let mark = if o.skipped {
            "·"
        } else if o.problems.is_empty() {
            "✔"
        } else {
            "✖"
        };
        println!("  {mark} {:<18} {}", o.rule.id, o.rule.title);
        if o.problems.is_empty() {
            continue;
        }
        broken += 1;
        for p in &o.problems {
            println!(
                "      {}{}",
                if p.file.is_empty() {
                    String::new()
                } else {
                    format!("{}: ", p.file)
                },
                p.message
            );
        }
        println!("      → {}", o.rule.fix);
    }
    if broken == 0 {
        println!("\n✔ todo en orden");
        ExitCode::SUCCESS
    } else {
        println!("\n✖ {broken} regla(s) rota(s)");
        ExitCode::FAILURE
    }
}
