//! La línea de órdenes de `verx-desktop`:
//!
//! ```text
//! verx-desktop --url http://127.0.0.1:4123/… [--title VERX] [--profile <carpeta>]
//!              [--width 1200] [--height 800]
//! ```
//!
//! Sólo acepta direcciones de esta misma máquina (`127.0.0.1` / `localhost`):
//! la ventana es para la app local que sirve Bun, no un navegador.

/// Lo que pide quien abre la ventana.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Options {
    pub(crate) url: String,
    pub(crate) title: String,
    /// Carpeta de datos del `WebView` (cookies, caché): una por app.
    pub(crate) profile: Option<String>,
    pub(crate) width: i32,
    pub(crate) height: i32,
}

fn local(url: &str) -> bool {
    [
        "http://127.0.0.1:",
        "http://localhost:",
        "http://127.0.0.1/",
        "http://localhost/",
    ]
    .iter()
    .any(|p| url.starts_with(p))
}

/// Lee los argumentos (sin el nombre del programa).
pub(crate) fn parse(args: &[String]) -> Result<Options, String> {
    let mut url = None;
    let mut title = String::from("VERX");
    let mut profile = None;
    let mut width = 1200;
    let mut height = 800;
    let mut it = args.iter();
    while let Some(flag) = it.next() {
        let mut value = || {
            it.next()
                .cloned()
                .ok_or_else(|| format!("{flag} necesita un valor"))
        };
        match flag.as_str() {
            "--url" => url = Some(value()?),
            "--title" => title = value()?,
            "--profile" => profile = Some(value()?),
            "--width" => width = value()?.parse().map_err(|_| "--width es un número".to_string())?,
            "--height" => {
                height = value()?
                    .parse()
                    .map_err(|_| "--height es un número".to_string())?;
            }
            other => return Err(format!("no conozco «{other}»")),
        }
    }
    let url = url.ok_or("falta --url")?;
    if !local(&url) {
        return Err(format!(
            "sólo abro la app local (http://127.0.0.1 o localhost), no «{url}»"
        ));
    }
    Ok(Options {
        url,
        title,
        profile,
        width: width.clamp(320, 7680),
        height: height.clamp(240, 4320),
    })
}

#[cfg(test)]
mod tests {
    use super::{Options, parse};

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn lee_todo() {
        let o = parse(&args(&[
            "--url",
            "http://127.0.0.1:4000/_verx/desktop?token=x",
            "--title",
            "Mi app",
            "--profile",
            "C:\\datos",
            "--width",
            "900",
            "--height",
            "600",
        ]));
        assert_eq!(
            o,
            Ok(Options {
                url: "http://127.0.0.1:4000/_verx/desktop?token=x".into(),
                title: "Mi app".into(),
                profile: Some("C:\\datos".into()),
                width: 900,
                height: 600,
            })
        );
    }

    #[test]
    fn valores_por_defecto_y_limites() {
        let o = parse(&args(&["--url", "http://localhost:3001/", "--width", "50"]));
        assert!(matches!(
            o,
            Ok(Options {
                width: 320,
                height: 800,
                profile: None,
                ..
            })
        ));
    }

    #[test]
    fn rechaza_lo_que_no_es_local_o_esta_mal() {
        assert!(parse(&args(&["--url", "https://otra.web/"])).is_err());
        assert!(parse(&args(&["--url", "http://127.0.0.1.otra.web/"])).is_err());
        assert!(parse(&args(&["--title", "x"])).is_err()); // falta --url
        assert!(parse(&args(&["--url"])).is_err()); // sin valor
        assert!(parse(&args(&["--url", "http://127.0.0.1:1/", "--rara"])).is_err());
        assert!(parse(&args(&["--url", "http://127.0.0.1:1/", "--width", "ancho"])).is_err());
    }
}
