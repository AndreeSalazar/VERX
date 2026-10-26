//! La tabla de compatibilidad: sólo las funciones del navegador que usa VERX,
//! con la primera versión de cada navegador que las trae activadas por defecto.
//!
//! Está escrita a mano (cero dependencias, tampoco de datos): cuando se use
//! algo nuevo, se añade aquí con sus versiones, comprobadas en caniuse.com o
//! en la documentación de cada navegador. Chrome vale también para Edge.

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

pub(crate) struct Feature {
    pub(crate) id: &'static str,
    pub(crate) title: &'static str,
    pub(crate) kind: Kind,
    /// Texto que delata su uso en el código.
    pub(crate) tokens: &'static [&'static str],
    /// Primera versión con la función, por navegador (ver `BROWSERS`); `None`, ninguna.
    pub(crate) since: [Option<u32>; 3],
    pub(crate) policy: Policy,
    /// JS: comprobaciones que cuentan como protección (en el mismo archivo).
    /// CSS: alternativas que cubren a los navegadores que no la tienen
    /// (p. ej. el prefijo -webkit-). La de `@supports` se detecta siempre.
    pub(crate) guards: &'static [&'static str],
    /// Qué ofrece VERX donde falta, si ofrece algo.
    pub(crate) respaldo: Option<&'static str>,
}

/// Los navegadores, en el orden de `Feature::since`.
pub(crate) const BROWSERS: [&str; 3] = ["chrome", "safari", "firefox"];
/// Su nombre para las personas.
pub(crate) const NAMES: [&str; 3] = ["Chrome/Edge", "Safari", "Firefox"];

/// Versión `mayor.menor` como un número comparable: 17.4 → 1704.
pub(crate) const fn v(major: u32, minor: u32) -> u32 {
    major * 100 + minor
}

pub(crate) const FEATURES: &[Feature] = &[
    Feature {
        id: "animaciones-con-scroll",
        title: "Animaciones ligadas al scroll (animation-timeline)",
        kind: Kind::Css,
        tokens: &["animation-timeline"],
        since: [Some(v(115, 0)), Some(v(26, 0)), None],
        policy: Policy::Proteger,
        guards: &[],
        respaldo: Some("@verx/compat/reveal: las mismas entradas y salidas con IntersectionObserver"),
    },
    Feature {
        id: "transiciones-entre-paginas",
        title: "Transiciones entre páginas (@view-transition)",
        kind: Kind::Css,
        tokens: &["@view-transition"],
        since: [Some(v(126, 0)), Some(v(18, 2)), None],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: None,
    },
    Feature {
        id: "nombres-de-transicion",
        title: "Elementos que viajan entre páginas (view-transition-name)",
        kind: Kind::Css,
        tokens: &["view-transition-name"],
        since: [Some(v(111, 0)), Some(v(18, 0)), Some(v(144, 0))],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: None,
    },
    Feature {
        id: "speculation-rules",
        title: "Prerender al pasar el ratón (Speculation Rules)",
        kind: Kind::Js,
        tokens: &["speculationrules"],
        since: [Some(v(109, 0)), None, None],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: Some("@verx/compat/prefetch: precarga la página al pasar el ratón por el enlace"),
    },
    Feature {
        id: "has",
        title: "Selector :has()",
        kind: Kind::Css,
        tokens: &[":has("],
        since: [Some(v(105, 0)), Some(v(15, 4)), Some(v(121, 0))],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: None,
    },
    Feature {
        id: "color-mix",
        title: "Mezcla de colores (color-mix())",
        kind: Kind::Css,
        tokens: &["color-mix("],
        since: [Some(v(111, 0)), Some(v(16, 2)), Some(v(113, 0))],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: None,
    },
    Feature {
        id: "backdrop-filter",
        title: "Cristal desenfocado (backdrop-filter)",
        kind: Kind::Css,
        tokens: &["backdrop-filter"],
        since: [Some(v(76, 0)), Some(v(18, 0)), Some(v(103, 0))],
        policy: Policy::Degrada,
        guards: &["-webkit-backdrop-filter"],
        respaldo: None,
    },
    Feature {
        id: "property",
        title: "Propiedades CSS animables (@property)",
        kind: Kind::Css,
        tokens: &["@property"],
        since: [Some(v(85, 0)), Some(v(16, 4)), Some(v(128, 0))],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: None,
    },
    Feature {
        id: "text-wrap",
        title: "Títulos equilibrados (text-wrap: balance)",
        kind: Kind::Css,
        tokens: &["text-wrap"],
        since: [Some(v(114, 0)), Some(v(17, 5)), Some(v(121, 0))],
        policy: Policy::Degrada,
        guards: &[],
        respaldo: None,
    },
    Feature {
        id: "request-idle-callback",
        title: "Esperar a que el navegador quede libre (requestIdleCallback)",
        kind: Kind::Js,
        tokens: &["requestIdleCallback"],
        since: [Some(v(47, 0)), None, Some(v(55, 0))],
        policy: Policy::Proteger,
        guards: &[
            "'requestIdleCallback' in",
            "\"requestIdleCallback\" in",
            "typeof requestIdleCallback",
        ],
        respaldo: None,
    },
    Feature {
        id: "intersection-observer",
        title: "Saber qué se ve en pantalla (IntersectionObserver)",
        kind: Kind::Js,
        tokens: &["IntersectionObserver"],
        since: [Some(v(58, 0)), Some(v(12, 1)), Some(v(55, 0))],
        policy: Policy::Proteger,
        guards: &["'IntersectionObserver' in", "typeof IntersectionObserver"],
        respaldo: None,
    },
    Feature {
        id: "webgl2",
        title: "Gráficos 3D (WebGL2)",
        kind: Kind::Js,
        tokens: &["'webgl2'", "\"webgl2\""],
        since: [Some(v(56, 0)), Some(v(15, 0)), Some(v(51, 0))],
        policy: Policy::Proteger,
        guards: &["if (!gl)"],
        respaldo: Some("el agujero negro y la galaxia hechos sólo con CSS"),
    },
    Feature {
        id: "portapapeles",
        title: "Copiar al portapapeles (navigator.clipboard)",
        kind: Kind::Js,
        tokens: &["navigator.clipboard"],
        since: [Some(v(66, 0)), Some(v(13, 1)), Some(v(63, 0))],
        policy: Policy::Proteger,
        guards: &["navigator.clipboard?.", "'clipboard' in navigator"],
        respaldo: None,
    },
];
