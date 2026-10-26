//! # verx-md
//!
//! Markdown a HTML para VERX, en Rust compilado a WebAssembly sin `std`, sin
//! allocator y sin dependencias. Además del HTML devuelve un JSON con el
//! frontmatter, los títulos (con su ancla) y las palabras del texto.
//!
//! Capas (sólo la última toca `unsafe`):
//! - [`out`]: salida en buffers fijos con escape para HTML y JSON.
//! - [`lines`], [`block`] y [`table`]: los bloques.
//! - [`inline`] (y `link`): los elementos en línea, seguros por diseño.
//! - [`highlight`]: resaltado de código en el servidor.
//! - [`front`]: frontmatter y anclas.
//! - [`abi`]: el contrato con JavaScript.

#![cfg_attr(target_arch = "wasm32", no_std)]

pub mod abi;
pub mod block;
pub mod front;
pub mod highlight;
pub mod inline;
pub mod lines;
mod link;
pub mod out;
pub mod table;

use block::Doc;
use out::Out;

/// La memoria con la que se renderiza un documento.
pub struct Buffers<'a> {
    /// Salida HTML.
    pub html: &'a mut [u8],
    /// Salida JSON de metadatos.
    pub meta: &'a mut [u8],
    /// Trabajo: entradas del índice de títulos.
    pub toc: &'a mut [u8],
    /// Trabajo: texto de citas y elementos de lista.
    pub scratch: &'a mut [u8],
    /// Trabajo: texto plano de un título.
    pub plain: &'a mut [u8],
    /// Trabajo: anclas ya usadas (huella, veces).
    pub seen: &'a mut [(u64, u16)],
}

/// Renderiza `src` (con `\n` como salto de línea). Devuelve las longitudes del
/// HTML y del JSON `{"front":{…},"words":N,"headings":[…]}`, o `None` si algo
/// no cupo en la memoria.
#[must_use]
pub fn render(src: &[u8], buffers: Buffers<'_>) -> Option<(usize, usize)> {
    let Buffers {
        html,
        meta,
        toc,
        scratch,
        plain,
        seen,
    } = buffers;
    let (front, body) = front::split(src);
    let mut doc = Doc::new(html, toc, scratch, plain, seen);
    doc.render(body);
    let mut meta = Out::new(meta);
    meta.str("{\"front\":");
    front::json(front, &mut meta);
    meta.str(",\"words\":");
    meta.num(doc.words);
    meta.str(",\"headings\":[");
    meta.raw(doc.toc.as_bytes());
    meta.str("]}");
    let ok = !doc.html.overflowed() && !doc.toc.overflowed() && !meta.overflowed();
    ok.then(|| (doc.html.len(), meta.len()))
}

/// En WebAssembly un pánico es una trampa: sin mensajes ni formateo (binario mínimo).
#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    loop {}
}

#[cfg(test)]
mod tests {
    use super::{Buffers, render};

    fn md(src: &str) -> (std::string::String, std::string::String) {
        let (mut html, mut meta, mut toc) = (
            std::vec![0u8; 1 << 16],
            std::vec![0u8; 1 << 12],
            std::vec![0u8; 1 << 12],
        );
        let (mut scratch, mut plain, mut seen) = (
            std::vec![0u8; 1 << 12],
            std::vec![0u8; 512],
            std::vec![(0u64, 0u16); 64],
        );
        let b = Buffers {
            html: &mut html,
            meta: &mut meta,
            toc: &mut toc,
            scratch: &mut scratch,
            plain: &mut plain,
            seen: &mut seen,
        };
        let Some((h, m)) = render(src.as_bytes(), b) else {
            return ("¡no cupo!".into(), std::string::String::new());
        };
        (
            std::string::String::from_utf8_lossy(&html[..h]).into_owned(),
            std::string::String::from_utf8_lossy(&meta[..m]).into_owned(),
        )
    }

    #[test]
    fn documento_completo_con_frontmatter_e_indice() {
        let (html, meta) = md(
            "---\ntitle: Hola\n---\n# Título *uno*\n\nUn párrafo\ncon dos líneas.\n\n## Otra sección\n\n---\n",
        );
        assert_eq!(
            html,
            "<h1 id=\"titulo-uno\">Título <em>uno</em><a class=\"anchor\" href=\"#titulo-uno\" aria-label=\"Enlace a esta sección\">#</a></h1>\n\
             <p>Un párrafo\ncon dos líneas.</p>\n\
             <h2 id=\"otra-seccion\">Otra sección<a class=\"anchor\" href=\"#otra-seccion\" aria-label=\"Enlace a esta sección\">#</a></h2>\n<hr>\n"
        );
        assert_eq!(
            meta,
            r#"{"front":{"title":"Hola"},"words":9,"headings":[{"level":1,"id":"titulo-uno","text":"Título uno"},{"level":2,"id":"otra-seccion","text":"Otra sección"}]}"#
        );
    }

    #[test]
    fn codigo_resaltado_con_titulo() {
        let (html, _) = md("```js title=\"app/a.js\"\nconst a = 1\n```\n");
        assert_eq!(
            html,
            "<figure class=\"code\"><figcaption>app/a.js</figcaption><pre data-lang=\"js\"><code><span class=\"t-kw\">const</span> a = <span class=\"t-num\">1</span></code></pre></figure>\n"
        );
        let (html, _) = md("~~~\n<sin cerrar>\n");
        assert_eq!(
            html,
            "<figure class=\"code\"><pre data-lang=\"\"><code>&lt;sin cerrar&gt;</code></pre></figure>\n"
        );
    }

    #[test]
    fn listas_anidadas_tareas_y_ordenadas() {
        let (html, _) = md("- uno\n  - dentro\n  - [x] hecho\n- dos\n  sigue\n\n3. tres\n4. cuatro\n");
        assert_eq!(
            html,
            "<ul>\n<li>uno<ul>\n<li>dentro</li>\n<li class=\"task\"><input type=\"checkbox\" disabled checked> hecho</li>\n</ul>\n</li>\n<li>dos\nsigue</li>\n</ul>\n\
             <ol start=\"3\">\n<li>tres</li>\n<li>cuatro</li>\n</ol>\n"
        );
    }

    #[test]
    fn citas_avisos_y_tablas() {
        let (html, _) = md("> [!TIP]\n> Usa **Bun**.\n>\n> Siempre.\n\n> cita\n");
        assert_eq!(
            html,
            "<aside class=\"callout tip\" role=\"note\"><p class=\"callout-title\">Consejo</p>\n<p>Usa <strong>Bun</strong>.</p>\n<p>Siempre.</p>\n</aside>\n<blockquote>\n<p>cita</p>\n</blockquote>\n"
        );
        let (html, _) = md("| a | b |\n|:-|-:|\n| `x` | 2 |\n| solo |\n");
        assert_eq!(
            html,
            "<div class=\"table-wrap\"><table>\n<thead><tr><th>a</th><th style=\"text-align:right\">b</th></tr>\n</thead>\n<tbody>\n\
             <tr><td><code>x</code></td><td style=\"text-align:right\">2</td></tr>\n<tr><td>solo</td><td></td></tr>\n</tbody>\n</table></div>\n"
        );
    }

    #[test]
    fn titulos_repetidos_y_html_crudo() {
        let (html, meta) = md("## A\n## A\n<div onclick=\"x\">hola</div>\n");
        assert!(html.contains("id=\"a\"") && html.contains("id=\"a-2\""));
        assert!(html.contains("<p>&lt;div onclick=&quot;x&quot;&gt;hola&lt;/div&gt;</p>"));
        assert!(meta.contains(r#"{"level":2,"id":"a-2","text":"A"}"#));
    }

    #[test]
    fn avisa_si_no_cabe() {
        let (mut html, mut meta, mut toc) = (std::vec![0u8; 8], std::vec![0u8; 256], std::vec![0u8; 256]);
        let (mut scratch, mut plain, mut seen) =
            (std::vec![0u8; 64], std::vec![0u8; 64], std::vec![(0u64, 0u16); 4]);
        let b = Buffers {
            html: &mut html,
            meta: &mut meta,
            toc: &mut toc,
            scratch: &mut scratch,
            plain: &mut plain,
            seen: &mut seen,
        };
        assert_eq!(render(b"un parrafo largo que no cabe", b), None);
    }
}
