# verx-desktop

VERX Desktop en una **ventana nativa**: el motor web que ya trae el sistema, con la app que sirve Bun en `127.0.0.1`. Sin Chromium propio y sin dependencias. El ejecutable pesa unos **140 KB** (Electron ronda los 150 MB).

| Sistema | Motor | Cómo se carga |
|---|---|---|
| Windows 10/11 | WebView2 (el Edge del sistema) | sin su SDK ni su `WebView2Loader.dll`: el registro dice dónde está el runtime y su `EmbeddedBrowserWebView.dll` se carga a mano |
| Linux | WebKitGTK 4.1 (o 4.0) + GTK 3 | con `dlopen` al arrancar: compila en cualquier Linux, aunque no tenga instalados los paquetes de desarrollo |
| macOS | — | sale con el código 3 y se abre la ventana de siempre |

```text
verx-desktop --url http://127.0.0.1:4123/_verx/desktop?token=… [--title VERX] [--profile <carpeta>] [--width 1200] [--height 800]
```

No hace falta llamarlo a mano: `bun run desktop` lo compila la primera vez y lo abre, y `bun run dev` lo usa para la ventana de VERX Grafo si ya está compilado.

## Qué hace

- **Ventana cuidada:** nítida en cada monitor, barra de título oscura, centrada y con el fondo del color del cosmos, sin el destello blanco al abrir. El título sigue al de la página.
- **Si la app no responde** (el servidor se paró o se está reiniciando), la ventana enseña una página que explica qué pasa y **vuelve sola** en cuanto la app responde (`src/guide.rs`).
- **Solo abre la app local:** rechaza cualquier URL que no sea `127.0.0.1` o `localhost`.
- **Códigos de salida:**
  - 0: se cerró la ventana;
  - 2: los argumentos están mal;
  - 3: falta el motor web del sistema, y Bun abre entonces la ventana de Edge o el navegador;
  - 1: cualquier otro fallo.

## El `unsafe`, con sus propios guardianes

Hablar con el sistema exige `unsafe`, así que va aislado en `src/ffi/` (com, loader, webview2, win32 y windows para Windows; linux para Linux). Lo vigilan dos reglas del guardián:

- **`unsafe-acotado`:** `unsafe` solo en `crates/*/src/abi.rs` y en `crates/desktop/src/ffi/`. Fuera de esa carpeta, el crate es Rust seguro.
- **`ffi-aislada`:**
  - cada `unsafe` lleva su `// SAFETY:` (o el `/// # Safety` de su función) justo encima;
  - las declaraciones que hablan con el sistema (`extern "…" { … }`, `#[link]`, `LoadLibraryW`, `GetProcAddress`, `dlopen`, `dlsym`) solo pueden vivir en `ffi/`.

El crate no es un puente: no compila a `.wasm` ni toca JS. Bun lo lanza como un programa aparte (`packages/kit/src/desktop.js`), así que entre los dos mundos no hay nada compartido que pueda chocar.

## Probar

```bash
cargo test -p verx-desktop                                          # argumentos y página guía
cargo clippy -p verx-desktop --target x86_64-unknown-linux-gnu      # que Linux compile (también en bun run verify)
```

En Linux está probado que compila, pero aún no se ha ejecutado en un Linux de verdad.
