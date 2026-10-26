//! La tabla de compatibilidad: una ficha por función del navegador que usa
//! VERX, cada una en su carpeta, `packages/compat/features/<id>/feature.json`
//! (con su README y, si lo tiene, su respaldo). Añadir una función es crear
//! una carpeta; aquí sólo se leen.
//!
//! ```json
//! { "id": "has", "title": "Selector :has()", "kind": "css", "tokens": [":has("],
//!   "since": { "chrome": "105", "safari": "15.4", "firefox": "121" },
//!   "policy": "degrada", "guards": [], "respaldo": null, "sin": "…" }
//! ```
//!
//! Las versiones son la primera de cada navegador que la trae activada por
//! defecto (`null`: ninguna). Chrome vale también para Edge y Brave.

use crate::json::{self, Json};
use crate::repo::Repo;

/// Dónde está la carpeta de cada función.
pub(crate) const FEATURES_DIR: &str = "packages/compat/features/";

/// Dónde se busca la función: en CSS (también el que va dentro de HTML o JS) o en JS.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Kind {
    Css,
    Js,
}

/// Qué pasa en un navegador que no la tiene.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Policy {
    /// Se ignora sin romper nada: sólo se pierde un detalle (se informa).
    Degrada,
    /// Sin protección, falla o se ve mal: hay que comprobar antes si existe
    /// (`@supports` en CSS, `'x' in window` en JS). Si no, la regla bloquea.
    Proteger,
}

#[derive(Debug)]
pub(crate) struct Feature {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) kind: Kind,
    /// Texto que delata su uso en el código.
    pub(crate) tokens: Vec<String>,
    /// Primera versión con la función, por navegador (ver `BROWSERS`); `None`, ninguna.
    pub(crate) since: [Option<u32>; 3],
    pub(crate) policy: Policy,
    /// JS: comprobaciones que cuentan como protección (en el mismo archivo).
    /// CSS: alternativas que cubren a los navegadores que no la tienen
    /// (p. ej. el prefijo -webkit-). La de `@supports` se detecta siempre.
    pub(crate) guards: Vec<String>,
    /// Qué ofrece VERX donde falta, si ofrece algo.
    pub(crate) respaldo: Option<String>,
}

/// Los navegadores, en el orden de `Feature::since`.
pub(crate) const BROWSERS: [&str; 3] = ["chrome", "safari", "firefox"];
/// Su nombre para las personas.
pub(crate) const NAMES: [&str; 3] = ["Chrome/Edge", "Safari", "Firefox"];

/// Versión `mayor.menor` como un número comparable: 17.4 → 1704.
pub(crate) const fn v(major: u32, minor: u32) -> u32 {
    major * 100 + minor
}

/// «17.4» → 1704, «120» → 12000.
pub(crate) fn version(s: &str) -> Option<u32> {
    let mut parts = s.trim().split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().map_or(Some(0), |m| m.parse().ok())?;
    Some(v(major, minor))
}

fn strings(doc: &Json, key: &str) -> Result<Vec<String>, String> {
    match doc.get(key) {
        Some(Json::Arr(items)) => items
            .iter()
            .map(|i| {
                i.as_str()
                    .map(String::from)
                    .ok_or_else(|| format!("«{key}» sólo admite textos"))
            })
            .collect(),
        _ => Err(format!("falta «{key}» (una lista)")),
    }
}

fn text(doc: &Json, key: &str) -> Result<String, String> {
    doc.get(key)
        .and_then(Json::as_str)
        .map(String::from)
        .ok_or_else(|| format!("falta «{key}»"))
}

/// Una ficha `feature.json`, o por qué no vale.
pub(crate) fn parse_feature(source: &str) -> Result<Feature, String> {
    let doc = json::parse(source)?;
    let kind = match text(&doc, "kind")?.as_str() {
        "css" => Kind::Css,
        "js" => Kind::Js,
        other => return Err(format!("«kind» es css o js, no «{other}»")),
    };
    let policy = match text(&doc, "policy")?.as_str() {
        "proteger" => Policy::Proteger,
        "degrada" => Policy::Degrada,
        other => return Err(format!("«policy» es proteger o degrada, no «{other}»")),
    };
    let since_doc = doc.get("since").ok_or("falta «since»")?;
    let mut since = [None; 3];
    for (slot, browser) in since.iter_mut().zip(BROWSERS) {
        *slot = match since_doc.get(browser) {
            Some(Json::Null) => None,
            Some(Json::Str(s)) => {
                Some(version(s).ok_or_else(|| format!("versión de {browser} ilegible: «{s}»"))?)
            }
            _ => {
                return Err(format!(
                    "falta la versión de {browser} en «since» (un texto o null)"
                ));
            }
        };
    }
    let tokens = strings(&doc, "tokens")?;
    if tokens.is_empty() {
        return Err("«tokens» no puede ir vacío".into());
    }
    Ok(Feature {
        id: text(&doc, "id")?,
        title: text(&doc, "title")?,
        kind,
        tokens,
        since,
        policy,
        guards: strings(&doc, "guards")?,
        respaldo: doc.get("respaldo").and_then(Json::as_str).map(String::from),
    })
}

/// Todas las fichas del repo; las que no se pueden leer van en `errors`
/// (ruta, motivo), para que la regla las enseñe en vez de ignorarlas.
pub(crate) fn load(repo: &Repo) -> (Vec<Feature>, Vec<(String, String)>) {
    let mut features = Vec::new();
    let mut errors = Vec::new();
    for file in repo
        .files
        .iter()
        .filter(|f| f.starts_with(FEATURES_DIR) && f.ends_with("/feature.json"))
    {
        let folder = &file[FEATURES_DIR.len()..file.len() - "/feature.json".len()];
        match repo
            .read(file)
            .ok_or_else(|| "no se puede leer".to_string())
            .and_then(|s| parse_feature(&s))
        {
            Ok(f) if f.id == folder => features.push(f),
            Ok(f) => errors.push((
                file.clone(),
                format!("el id «{}» no coincide con su carpeta «{folder}»", f.id),
            )),
            Err(e) => errors.push((file.clone(), e)),
        }
    }
    (features, errors)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::{Feature, Kind, Policy, parse_feature, v};

    /// Fichas de ejemplo para los tests (las mismas que en el repo, abreviadas).
    pub(crate) fn sample() -> Vec<Feature> {
        [
            r#"{"id":"animaciones-con-scroll","title":"Animaciones con scroll","kind":"css","tokens":["animation-timeline"],"since":{"chrome":"115","safari":"26","firefox":null},"policy":"proteger","guards":[],"respaldo":"@verx/compat/reveal","sin":"…"}"#,
            r#"{"id":"backdrop-filter","title":"Cristal","kind":"css","tokens":["backdrop-filter"],"since":{"chrome":"76","safari":"18","firefox":"103"},"policy":"degrada","guards":["-webkit-backdrop-filter"],"respaldo":null,"sin":"…"}"#,
            r#"{"id":"has","title":":has()","kind":"css","tokens":[":has("],"since":{"chrome":"105","safari":"15.4","firefox":"121"},"policy":"degrada","guards":[],"respaldo":null,"sin":"…"}"#,
            r#"{"id":"speculation-rules","title":"Prerender","kind":"js","tokens":["speculationrules"],"since":{"chrome":"109","safari":null,"firefox":null},"policy":"degrada","guards":[],"respaldo":"@verx/compat/prefetch","sin":"…"}"#,
            r#"{"id":"request-idle-callback","title":"Idle","kind":"js","tokens":["requestIdleCallback"],"since":{"chrome":"47","safari":null,"firefox":"55"},"policy":"proteger","guards":["'requestIdleCallback' in"],"respaldo":null,"sin":"…"}"#,
        ]
        .iter()
        .filter_map(|s| parse_feature(s).ok())
        .collect()
    }

    #[test]
    fn lee_una_ficha() {
        let all = sample();
        assert_eq!(all.len(), 5, "alguna ficha de ejemplo no se lee");
        let scroll = &all[0];
        assert_eq!(scroll.kind, Kind::Css);
        assert_eq!(scroll.policy, Policy::Proteger);
        assert_eq!(scroll.since, [Some(v(115, 0)), Some(v(26, 0)), None]);
        assert_eq!(all[2].since[1], Some(v(15, 4)));
    }

    #[test]
    fn explica_lo_que_falla() {
        let bad = |s: &str| parse_feature(s).err().unwrap_or_default();
        assert!(bad(r#"{"id":"x","title":"x","kind":"wasm"}"#).contains("kind"));
        assert!(
            bad(r#"{"id":"x","title":"x","kind":"css","policy":"degrada","since":{"chrome":"1","safari":"1"},"tokens":["a"],"guards":[]}"#)
                .contains("firefox")
        );
        assert!(
            bad(r#"{"id":"x","title":"x","kind":"css","policy":"degrada","since":{"chrome":"1","safari":"1","firefox":"1"},"tokens":[],"guards":[]}"#)
                .contains("vacío")
        );
    }
}
