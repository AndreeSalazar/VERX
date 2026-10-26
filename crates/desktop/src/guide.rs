//! La página guía: lo que enseña la ventana cuando no llega a la app (el
//! servidor no responde, se cayó, se reinicia…). Explica qué pasa, enseña la
//! dirección y vuelve sola en cuanto la app responde. HTML puro, sin red.

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Una cadena de JS entre comillas, segura dentro de un `<script>`.
fn js_string(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '<' => out.push_str("\\u003c"),
            '\n' => out.push_str("\\n"),
            c if u32::from(c) < 0x20 => out.push(' '),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// La página para `url`, con el motivo (`reason`) del fallo.
pub(crate) fn page(url: &str, reason: &str) -> String {
    let shown = html_escape(url.split('?').next().unwrap_or(url));
    format!(
        r#"<!doctype html><html lang="es"><head><meta charset="utf-8"><title>VERX · sin conexión con la app</title>
<style>
  html,body{{margin:0;height:100%;background:#04040a;color:#ececf4;font:15px/1.6 system-ui,'Segoe UI',sans-serif}}
  body{{display:grid;place-items:center;background:radial-gradient(60% 50% at 50% 40%,rgba(255,77,94,.12),transparent 70%),#04040a}}
  main{{max-width:520px;padding:28px;text-align:center}}
  h1{{margin:0 0 8px;font-size:22px}} h1 b{{color:#ff4d5e}}
  p{{margin:6px 0;color:#9a9aab}} code{{color:#ffd56b;font:13px ui-monospace,Consolas,monospace}}
  .why{{color:#ffc2c8}} .wait{{margin-top:18px;color:#ffd56b}} .wait::before{{content:'◌ ';display:inline-block;animation:s 1s linear infinite}}
  @keyframes s{{to{{transform:rotate(360deg)}}}}
  button{{margin-top:16px;padding:8px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;font:inherit;cursor:pointer}}
  button:hover{{border-color:#ffd56b}}
</style></head><body><main>
<h1><b>✖</b> La ventana no llega a la app</h1>
<p class="why">{reason}</p>
<p>Esperaba encontrarla en <code>{shown}</code>.</p>
<p>Si estás en desarrollo, mira la terminal de <code>verx</code> o la ventana de VERX Grafo: ahí está el porqué.</p>
<p class="wait">Reintentando: vuelvo sola en cuanto responda.</p>
<button onclick="location.href=U">Reintentar ahora</button>
</main><script>
const U={js_url};
setInterval(async()=>{{try{{await fetch(U,{{mode:'no-cors',cache:'no-store'}});location.href=U}}catch{{}}}},1500)
</script></body></html>"#,
        reason = html_escape(reason),
        js_url = js_string(url),
    )
}

/// El motivo, en palabras, de un código de error del `WebView`.
pub(crate) fn reason(code: i32) -> &'static str {
    match code {
        6 | 12 => "El servidor no responde: puede que se haya parado o se esté reiniciando.",
        7 => "La app tardó demasiado en contestar.",
        9..=11 => "Se cortó la conexión con la app.",
        13 => "No encuentro esa dirección.",
        _ => "No se pudo cargar la página.",
    }
}

#[cfg(test)]
mod tests {
    use super::{page, reason};

    #[test]
    fn explica_y_vuelve_sola() {
        let html = page("http://127.0.0.1:4000/_verx/desktop?token=secreto", reason(6));
        assert!(html.contains("El servidor no responde"));
        // Enseña la dirección sin el token…
        assert!(html.contains("<code>http://127.0.0.1:4000/_verx/desktop</code>"));
        // …pero vuelve con él (la cookie de entrada lo necesita).
        assert!(html.contains(r#"const U="http://127.0.0.1:4000/_verx/desktop?token=secreto";"#));
        assert!(html.contains("setInterval"));
    }

    #[test]
    fn nada_de_lo_que_llega_se_cuela_como_html_o_js() {
        let html = page(
            "http://127.0.0.1:1/\"</script><b>",
            "<img src=x onerror=alert(1)>",
        );
        assert!(!html.contains("<img src=x"));
        assert!(!html.contains("\"</script><b>"));
        assert!(html.contains("&lt;img"));
        assert!(html.contains(r"</script>"));
    }
}
