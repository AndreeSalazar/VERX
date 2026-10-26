# verx-md

Markdown a HTML para VERX, en Rust compilado a WebAssembly. Se usa en el servidor: el blog y la documentación del sitio son archivos `.md`, y el navegador recibe HTML ya hecho, **código resaltado incluido**, con cero JS.

- `no_std`, sin allocator y sin dependencias. La memoria es estática.
- **Seguro por diseño:**
  - El HTML del texto **siempre** se escapa (no hay HTML crudo).
  - Un enlace solo conserva su `href` si es relativo, un ancla o usa `http`, `https` o `mailto`. Un `javascript:` se queda en texto.
- Además del HTML devuelve un JSON con el **frontmatter**, los **títulos con su ancla** (para índices y buscador) y las **palabras** (para el tiempo de lectura).

## Qué entiende

| Bloques | En línea |
|---|---|
| `#` … `######` con ancla única (`estructura-de-una-app`, `…-2`) | `*énfasis*`, `**fuerte**`, `***ambos***`, `~~tachado~~` |
| párrafos, `---` | `` `código` `` |
| ```` ```js title="app/a.js" ```` con **resaltado** | `[texto](url "título")`, `![alt](img.png)` |
| `>` citas y avisos `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` | `<https://autoenlace>` |
| listas `-` y `1.`, anidadas, con tareas `- [x]` | `\` escapes, dos espacios o `\` al final = `<br>` |
| tablas con alineación `:-:` | |

No soporta títulos subrayados (`===`) ni código con sangría de 4 espacios: con vallas y `#` es más claro.

**Resaltado** (`t-kw`, `t-str`, `t-com`, `t-num`, `t-fn`, `t-ty`, `t-attr`): JS/TS/JSX, Rust, shell, TOML, JSON y CSS.

| Archivo | Responsabilidad | `unsafe` |
|---|---|---|
| `src/out.rs` | salida en buffers fijos, escape HTML y JSON | no |
| `src/lines.rs` | líneas y reconocimiento de bloques | no |
| `src/block.rs` · `src/table.rs` | bloques e índice de títulos | no |
| `src/inline.rs` · `src/link.rs` | en línea, URLs seguras | no |
| `src/highlight.rs` | resaltado de código | no |
| `src/front.rs` | frontmatter y anclas | no |
| `src/abi.rs` | contrato con JS: funciones `verx_*` y memoria estática | **solo aquí** |

```bash
cargo test -p verx-md   # tests nativos
bun run wasm            # compila y publica en packages/md (desde la raíz)
```

Si cambias la ABI o el formato de salida, sube `ABI_VERSION` aquí y en `packages/md/src/index.js`.
