# @verx/md

**Puente JS ↔ Rust del Markdown.** Carga `md.wasm`, compilado desde [`crates/md`](../../crates/md/README.md), y convierte Markdown en HTML **con el código ya resaltado**. Se usa en el servidor: el navegador recibe HTML hecho y cero JS.

```js
import { createMarkdown } from '@verx/md'

const md = await createMarkdown()
const { html, front, headings, words } = md.render(await Bun.file('post.md').text())
// front:    { title: '¿Por qué?', tags: ['bun', 'rust'] }   ← el frontmatter
// headings: [{ level: 2, id: 'estructura', text: 'Estructura' }]
// words:    412                                          ← para el tiempo de lectura
```

- Normaliza los saltos de línea (`\r\n` → `\n`) y los tabuladores antes de convertir.
- **Seguro:** el HTML del texto siempre se escapa y los enlaces `javascript:` pierden su `href`, así que el resultado se puede pintar con `raw()` sin miedo.
- Si un documento no cabe en la memoria del `.wasm` (512 KB de Markdown, 2 MB de HTML), lanza un error claro.
- `md.wasm` y `md.manifest.json` los genera `bun run wasm`. **No se editan a mano.**
- La ABI está versionada (`ABI_VERSION`): si el `.wasm` no coincide, `createMarkdown` lo rechaza con un error claro.
