//! Las reglas del repositorio. Cada una tiene un id estable (para citarla en
//! commits y en CLAUDE.md), una explicación y una pista para arreglarla.

mod code;
mod deps;
mod project;

use crate::repo::Repo;

pub(crate) struct Problem {
    pub(crate) file: String,
    pub(crate) message: String,
}

impl Problem {
    pub(crate) fn new(file: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            file: file.into(),
            message: message.into(),
        }
    }
}

pub(crate) struct Rule {
    pub(crate) id: &'static str,
    pub(crate) title: &'static str,
    pub(crate) fix: &'static str,
    pub(crate) check: fn(&Repo) -> Vec<Problem>,
    /// Las reglas lentas o que necesitan otras herramientas se pueden saltar con --quick.
    pub(crate) quick: bool,
}

pub(crate) const RULES: &[Rule] = &[
    Rule {
        id: "solo-bun",
        title: "Bun es el único gestor de paquetes (nada de npm, yarn ni pnpm)",
        fix: "borra ese archivo y usa `bun install`",
        check: deps::solo_bun,
        quick: true,
    },
    Rule {
        id: "cero-deps-js",
        title: "Sin dependencias JS de terceros: sólo @verx/* con workspace:*",
        fix: "quita la dependencia o conviértela en un paquete propio en packages/",
        check: deps::cero_deps_js,
        quick: true,
    },
    Rule {
        id: "cero-deps-rust",
        title: "Sin crates de terceros: sólo dependencias por path dentro de crates/",
        fix: "quita la dependencia o crea un crate propio en crates/",
        check: deps::cero_deps_rust,
        quick: true,
    },
    Rule {
        id: "nombres",
        title: "packages/x → @verx/x · crates/x → verx-x · apps/x → x",
        fix: "renombra el campo name para que coincida con la carpeta",
        check: deps::nombres,
        quick: true,
    },
    Rule {
        id: "frontera-rust-js",
        title: "JS y Rust no se tocan: sólo los paquetes puente cargan .wasm",
        fix: "importa el paquete puente (@verx/sim, @verx/search…) en vez de crates/ o un .wasm",
        check: code::frontera,
        quick: true,
    },
    Rule {
        id: "unsafe-acotado",
        title: "`unsafe` sólo en crates/*/src/abi.rs",
        fix: "mueve la operación insegura a abi.rs y expón una API segura",
        check: code::unsafe_acotado,
        quick: true,
    },
    Rule {
        id: "sin-restos",
        title: "Sin test.only, debugger, dbg!, todo! ni unimplemented!",
        fix: "quita el resto de depuración antes de seguir",
        check: code::sin_restos,
        quick: true,
    },
    Rule {
        id: "tamano",
        title: "Ningún archivo de código pasa de 400 líneas",
        fix: "divídelo en módulos con una sola responsabilidad",
        check: code::tamano,
        quick: true,
    },
    Rule {
        id: "lf",
        title: "Saltos de línea LF en todos los archivos de texto",
        fix: "guarda el archivo con LF (lo fuerza .gitattributes)",
        check: code::lf,
        quick: true,
    },
    Rule {
        id: "paquete-completo",
        title: "Cada paquete y crate tiene README.md y tests",
        fix: "añade README.md y al menos un test",
        check: project::completo,
        quick: true,
    },
    Rule {
        id: "wasm-al-dia",
        title: "cada .wasm puente corresponde al código actual de su crate",
        fix: "ejecuta `bun run wasm`",
        check: project::wasm_al_dia,
        quick: true,
    },
    Rule {
        id: "imports-js",
        title: "Imports JS dentro de sus fronteras (análisis con el AST de Bun)",
        fix: "lee el detalle: dependencia no declarada, import profundo, ciclo o isla con código de servidor",
        check: project::imports_js,
        quick: false,
    },
    Rule {
        id: "presupuesto",
        title: "Cada página transfiere poco JS + WASM (límite en verx.config.js → budget)",
        fix: "adelgaza la isla, cárgala con client:visible/idle o sube el límite si está justificado",
        check: project::presupuesto,
        quick: false,
    },
];

pub(crate) struct Outcome<'a> {
    pub(crate) rule: &'a Rule,
    pub(crate) problems: Vec<Problem>,
    pub(crate) skipped: bool,
}

pub(crate) fn run(repo: &Repo, quick: bool) -> Vec<Outcome<'static>> {
    RULES
        .iter()
        .map(|rule| {
            let skipped = quick && !rule.quick;
            let problems = if skipped { Vec::new() } else { (rule.check)(repo) };
            Outcome {
                rule,
                problems,
                skipped,
            }
        })
        .collect()
}
