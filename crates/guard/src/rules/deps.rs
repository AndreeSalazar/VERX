//! Reglas de dependencias y nombres.

use super::Problem;
use crate::json::{self, Json};
use crate::repo::Repo;
use crate::toml;

const FOREIGN_TOOLS: [&str; 8] = [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".npmrc",
    ".yarnrc",
    ".yarnrc.yml",
    ".pnpmfile.cjs",
];
const DEP_FIELDS: [&str; 4] = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
];

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

pub(super) fn solo_bun(repo: &Repo) -> Vec<Problem> {
    repo.files
        .iter()
        .filter(|f| FOREIGN_TOOLS.contains(&file_name(f)))
        .map(|f| Problem::new(f, "archivo de otro gestor de paquetes"))
        .collect()
}

fn package_jsons(repo: &Repo) -> impl Iterator<Item = &String> {
    repo.files
        .iter()
        .filter(|f| file_name(f) == "package.json" && !f.contains("/fixtures/"))
}

pub(super) fn cero_deps_js(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for file in package_jsons(repo) {
        let pkg = match json::parse(&repo.read(file).unwrap_or_default()) {
            Ok(pkg) => pkg,
            Err(e) => {
                out.push(Problem::new(file, format!("JSON inválido: {e}")));
                continue;
            }
        };
        for field in DEP_FIELDS {
            for (name, version) in pkg.get(field).map(Json::entries).unwrap_or_default() {
                if !(name.starts_with("@verx/") && version.as_str() == Some("workspace:*")) {
                    out.push(Problem::new(
                        file,
                        format!(
                            "{field}: \"{name}\" no es un paquete del workspace (@verx/* con workspace:*)"
                        ),
                    ));
                }
            }
        }
    }
    out
}

fn is_dep_section(section: &str) -> bool {
    let last = section.rsplit('.').next().unwrap_or(section);
    let base = section.split('.').next().unwrap_or(section);
    ["dependencies", "dev-dependencies", "build-dependencies"]
        .iter()
        .any(|d| last == *d || base == *d || section.contains(&format!(".{d}")))
}

pub(super) fn cero_deps_rust(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    for file in repo
        .files
        .iter()
        .filter(|f| f.starts_with("crates/") && file_name(f) == "Cargo.toml")
    {
        for e in toml::parse(&repo.read(file).unwrap_or_default()) {
            if !is_dep_section(&e.section) {
                continue;
            }
            let local = e.value.contains("path") || e.value.contains("workspace = true") || e.key == "path";
            if !local {
                out.push(Problem::new(
                    file,
                    format!("[{}] {} = {} no es un crate local", e.section, e.key, e.value),
                ));
            }
        }
    }
    out
}

pub(super) fn nombres(repo: &Repo) -> Vec<Problem> {
    let mut out = Vec::new();
    let mut expect = |file: String, actual: Option<String>, wanted: String| {
        if actual.as_deref() != Some(wanted.as_str()) {
            out.push(Problem::new(
                file,
                format!(
                    "se llama {} y debería llamarse \"{wanted}\"",
                    actual.unwrap_or_else(|| "(sin nombre)".into())
                ),
            ));
        }
    };
    for (group, prefix) in [("packages", "@verx/"), ("apps", "")] {
        for dir in repo.members(group, "package.json") {
            let file = format!("{dir}/package.json");
            let name = json::parse(&repo.read(&file).unwrap_or_default())
                .ok()
                .and_then(|p| p.get("name").and_then(Json::as_str).map(String::from));
            let short = dir.rsplit('/').next().unwrap_or(&dir);
            expect(file, name, format!("{prefix}{short}"));
        }
    }
    for dir in repo.members("crates", "Cargo.toml") {
        let file = format!("{dir}/Cargo.toml");
        let name = toml::parse(&repo.read(&file).unwrap_or_default())
            .into_iter()
            .find(|e| e.section == "package" && e.key == "name")
            .map(|e| toml::unquote(&e.value).to_string());
        let short = dir.rsplit('/').next().unwrap_or(&dir);
        expect(file, name, format!("verx-{short}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::is_dep_section;

    #[test]
    fn detecta_secciones_de_dependencias() {
        assert!(is_dep_section("dependencies"));
        assert!(is_dep_section("dev-dependencies"));
        assert!(is_dep_section("target.'cfg(unix)'.dependencies"));
        assert!(is_dep_section("dependencies.serde"));
        assert!(!is_dep_section("package"));
        assert!(!is_dep_section("workspace.lints.clippy"));
    }
}
