//! Regla `navegadores`: qué funciones del navegador usa cada archivo, en cuáles
//! de los navegadores objetivo faltan y si el código lo comprueba antes.
//!
//! El objetivo sale de `browsers` en cada `apps/*/verx.config.js`
//! (`browsers: { chrome: 120, safari: 17, firefox: 128 }`); con varias apps
//! manda la más exigente. Bloquea sólo lo que se rompería: una función
//! `Proteger` que falta en algún objetivo y no va protegida. Lo demás (lo que
//! sólo se pierde, `Degrada`) se informa: lo enseña VERX Grafo en cada carpeta.

mod scan;
mod table;

use std::fmt::Write;

use crate::repo::Repo;
use crate::rules::Problem;
pub(crate) use scan::Use;
use table::{BROWSERS, FEATURES, NAMES, Policy, v};

/// Sin `browsers` en ninguna app: los dos últimos años de cada navegador.
const DEFAULT_TARGET: [u32; 3] = [v(120, 0), v(17, 0), v(128, 0)];

/// Código que llega al navegador: CSS, HTML y JS de apps/ y packages/, sin
/// tests. La extensión de VS Code corre en el propio editor, no en una web.
fn in_scope(path: &str) -> bool {
    let code = [".css", ".html", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]
        .iter()
        .any(|e| path.ends_with(e));
    code && (path.starts_with("apps/") || path.starts_with("packages/"))
        && !path.starts_with("packages/vscode/")
        && !path.contains("/test/")
        && !path.contains(".test.")
        && !path.ends_with("verx.config.js")
}

/// «17.4» → 1704, «120» → 12000.
fn version(s: &str) -> Option<u32> {
    let mut parts = s.trim().split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().map_or(Some(0), |m| m.parse().ok())?;
    Some(v(major, minor))
}

fn show(version: u32) -> String {
    if version.is_multiple_of(100) {
        format!("{}", version / 100)
    } else {
        format!("{}.{}", version / 100, version % 100)
    }
}

/// Lee `browsers: { chrome: 120, … }` de un verx.config.js (texto, sin ejecutarlo).
pub(crate) fn parse_target(config: &str) -> [Option<u32>; 3] {
    let mut out = [None; 3];
    let Some(at) = config.find("browsers") else {
        return out;
    };
    let rest = &config[at..];
    let (Some(open), Some(close)) = (rest.find('{'), rest.find('}')) else {
        return out;
    };
    for pair in rest[open + 1..close].split(',') {
        if let Some((name, value)) = pair.split_once(':')
            && let Some(i) = BROWSERS
                .iter()
                .position(|b| *b == name.trim().trim_matches(['\'', '"']))
        {
            out[i] = version(value);
        }
    }
    out
}

fn target(repo: &Repo) -> [u32; 3] {
    let mut out: [Option<u32>; 3] = [None; 3];
    for app in repo.members("apps", "verx.config.js") {
        let Some(text) = repo.read(&format!("{app}/verx.config.js")) else {
            continue;
        };
        for (slot, found) in out.iter_mut().zip(parse_target(&text)) {
            if let Some(found) = found {
                *slot = Some(slot.map_or(found, |s| s.min(found)));
            }
        }
    }
    let mut result = DEFAULT_TARGET;
    for (r, o) in result.iter_mut().zip(out) {
        if let Some(o) = o {
            *r = o;
        }
    }
    result
}

/// Los navegadores del objetivo (índices) en los que falta la función.
fn missing(feature: usize, target: [u32; 3]) -> Vec<usize> {
    (0..3)
        .filter(|&b| FEATURES[feature].since[b].is_none_or(|since| since > target[b]))
        .collect()
}

fn names(browsers: &[usize], target: [u32; 3]) -> String {
    browsers
        .iter()
        .map(|&b| format!("{} {}", NAMES[b], show(target[b])))
        .collect::<Vec<_>>()
        .join(", ")
}

fn analyze(repo: &Repo) -> Vec<(&String, Vec<Use>)> {
    repo.files
        .iter()
        .filter(|f| in_scope(f))
        .filter_map(|f| {
            let found = scan::uses(f, &repo.read(f)?);
            (!found.is_empty()).then_some((f, found))
        })
        .collect()
}

pub(crate) fn rule(repo: &Repo) -> Vec<Problem> {
    let target = target(repo);
    let mut out = Vec::new();
    for (file, found) in analyze(repo) {
        for u in found {
            let f = &FEATURES[u.feature];
            let lacking = missing(u.feature, target);
            if f.policy == Policy::Proteger && !u.guarded && !lacking.is_empty() {
                let help = f.respaldo.map_or(String::new(), |r| format!(" (respaldo: {r})"));
                out.push(Problem::new(
                    format!("{file}:{}", u.line),
                    format!(
                        "usa {} sin comprobar antes si existe, y falta en {}{help}",
                        f.title,
                        names(&lacking, target)
                    ),
                ));
            }
        }
    }
    out
}

/// El mapa para VERX Grafo: el objetivo, las funciones usadas (con dónde
/// faltan y su respaldo) y, por archivo, `[id, línea, protegida]`.
pub(crate) fn json(repo: &Repo) -> String {
    let target = target(repo);
    let analysis = analyze(repo);
    let mut used = [false; FEATURES.len()];
    for (_, found) in &analysis {
        for u in found {
            used[u.feature] = true;
        }
    }
    let mut out = String::from("{\"target\":{");
    for (i, b) in BROWSERS.iter().enumerate() {
        let _ = write!(
            out,
            "{}\"{b}\":\"{}\"",
            if i > 0 { "," } else { "" },
            show(target[i])
        );
    }
    out.push_str("},\"features\":[");
    let mut first = true;
    for (i, f) in FEATURES.iter().enumerate().filter(|(i, _)| used[*i]) {
        let lacking: Vec<String> = missing(i, target)
            .iter()
            .map(|&b| format!("\"{}\"", BROWSERS[b]))
            .collect();
        let _ = write!(
            out,
            "{}{{\"id\":\"{}\",\"title\":{},\"policy\":\"{}\",\"missing\":[{}],\"respaldo\":{}}}",
            if first { "" } else { "," },
            f.id,
            crate::report::quote(f.title),
            if f.policy == Policy::Proteger {
                "proteger"
            } else {
                "degrada"
            },
            lacking.join(","),
            f.respaldo.map_or("null".into(), crate::report::quote),
        );
        first = false;
    }
    out.push_str("],\"files\":{");
    for (n, (file, found)) in analysis.iter().enumerate() {
        let items: Vec<String> = found
            .iter()
            .map(|u| format!("[\"{}\",{},{}]", FEATURES[u.feature].id, u.line, u.guarded))
            .collect();
        let _ = write!(
            out,
            "{}{}:[{}]",
            if n > 0 { "," } else { "" },
            crate::report::quote(file),
            items.join(",")
        );
    }
    out.push_str("}}");
    out
}

#[cfg(test)]
mod tests {
    use super::table::{FEATURES, v};
    use super::{DEFAULT_TARGET, in_scope, missing, parse_target, show, version};

    fn index(id: &str) -> usize {
        FEATURES.iter().position(|f| f.id == id).unwrap_or(usize::MAX)
    }

    #[test]
    fn lee_el_objetivo_del_config() {
        let config =
            "export default defineConfig({\n  browsers: { chrome: 120, safari: 17.4, 'firefox': 128 },\n})";
        assert_eq!(
            parse_target(config),
            [Some(v(120, 0)), Some(v(17, 4)), Some(v(128, 0))]
        );
        assert_eq!(parse_target("export default {}"), [None, None, None]);
        assert_eq!(version("18.2"), Some(1802));
        assert_eq!(show(1802), "18.2");
        assert_eq!(show(12800), "128");
    }

    #[test]
    fn falta_donde_no_llega_la_version() {
        // Las animaciones con scroll: Chrome 115 y Safari 26 sí; Firefox nunca.
        let scroll = index("animaciones-con-scroll");
        assert_eq!(missing(scroll, DEFAULT_TARGET), vec![1, 2]); // Safari 17 y Firefox
        assert_eq!(missing(scroll, [v(130, 0), v(26, 0), v(140, 0)]), vec![2]);
        assert_eq!(missing(index("has"), DEFAULT_TARGET), Vec::<usize>::new());
        assert_eq!(missing(index("request-idle-callback"), DEFAULT_TARGET), vec![1]);
    }

    #[test]
    fn la_tabla_es_coherente() {
        let mut ids: Vec<_> = FEATURES.iter().map(|f| f.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), FEATURES.len(), "ids repetidos");
        for f in FEATURES {
            assert!(!f.tokens.is_empty(), "{} sin tokens", f.id);
            assert!(
                f.since.iter().any(Option::is_some),
                "{} no existe en ningún navegador",
                f.id
            );
        }
    }

    #[test]
    fn solo_el_codigo_que_va_al_navegador() {
        assert!(in_scope("apps/web/public/cosmos.css"));
        assert!(in_scope("packages/kit/client/runtime.js"));
        assert!(!in_scope("packages/kit/test/kit.test.js"));
        assert!(!in_scope("packages/vscode/src/extension.cjs"));
        assert!(!in_scope("crates/guard/src/main.rs"));
        assert!(!in_scope("apps/web/content/docs/01-empezar.md"));
    }
}
