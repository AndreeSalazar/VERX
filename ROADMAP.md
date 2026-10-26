# Hoja de ruta de VERX

Cada plan es un paquete (`packages/`) o un crate (`crates/`) nuevo, con su README y sus tests, y vigilado por el guardián. Se marcan con `[x]` al terminar.

**Orden recomendado:** 1 → 2 → 6 → el resto según apetezca.

## 🚀 Victorias rápidas

- [x] **1. Presupuesto de rendimiento en el guardián.** ✅ `bun run budget` + regla `presupuesto`. Una regla que hace fallar el commit si una página manda más de X KB de JS o si una isla crece de más. Protege la velocidad para siempre.
- [x] **2. Galaxia multijugador.** ✅ `app.ws()`, `WS` en `route.js`, ABI v2 con 16 punteros y sala con protocolo binario. `app.ws()` sobre los WebSockets nativos de `Bun.serve`: los cursores de todos los visitantes mueven la misma galaxia en tiempo real.
- [ ] **3. Tipos TypeScript** (`.d.ts`) en todos los paquetes y `tsc --noEmit` dentro de `bun run verify`.
- [x] **4. `<For>` con claves** en `@verx/ui`: ✅ `@verx/ui/for`, con movimientos mínimos (subsecuencia creciente más larga), un ámbito por fila, `index` como signal y `fallback`. Las listas solo tocan las filas que cambian. Además, las zonas reactivas se delimitan con dos marcas, así que las anidadas ya no dejan nodos sueltos.

## 🦀 Más Rust

- [x] **5. `verx-md`**: ✅ crate `no_std` con frontmatter, títulos con ancla, listas con tareas, tablas, avisos `> [!NOTE]`, **resaltado de código en el servidor** y enlaces seguros; puente `@verx/md`. El blog y la documentación ya son archivos `.md` en `content/`, con índice «En esta página» y tiempo de lectura.
- [x] **6. `verx-search`**: ✅ crate `no_std` con índice invertido `VXS1` y BM25, puente `@verx/search` y rutas GET estáticas en el kit (`dynamic = 'force-static'`). Índice de búsqueda generado en `verx build` y consultado con WASM en el navegador, en microsegundos. Busca por prefijos, ignora los acentos y llega hasta cada sección.
- [x] **7. `verx-img`**: ✅ PNG completo (decodificar y codificar) con inflate/deflate propios (LZ77 + Huffman dinámico), redimensionado en luz lineal con alfa premultiplicado, placeholder desenfocado y color medio; `<Image>` e `image()` en el kit, sin JS. También JPEG «baseline» para las imágenes opacas: unas 7 veces más ligeras que el PNG. Siguiente: WebP/AVIF.

## 🧠 Acercarse a los grandes

- [ ] **8. Streaming SSR** con `<Suspense>`: el HTML se envía por trozos mientras cargan los datos.
- [ ] **9. Hidratación que reutiliza el DOM** del servidor en lugar de volver a pintar la isla.
- [ ] **10. Compilador de reactividad**: un plugin de Bun para escribir `{a() + b()}` sin `() =>`.

## ✨ Más 3D

- [ ] **11. `@verx/gpu`**: WebGPU con *compute shaders* y WebGL2 como respaldo, para pasar de 40 mil a millones de partículas.
- [ ] **12. Transiciones 3D entre páginas**: View Transitions más shaders; la galaxia se transforma al navegar. Ya hay transiciones en todo el sitio, sin JS: cada bloque emerge al entrar y se disuelve al salir con el scroll, y la página vieja se hunde al navegar. Falta que el 3D también se transforme.
- [x] **17. Sistema triple de agujeros negros** ✅: el fondo de todas las páginas es un gigante y dos compañeros trazados en la GPU, con discos inclinados, chorros relativistas, filamentos magnéticos y lentes entre ellos; la cámara lo rodea al bajar. Mantiene la calidad del agujero único gracias a `blackhole-system.js`, que calcula una vez por frame lo que es igual para todos los píxeles.

## 🌍 Ecosistema

- [ ] **13. `bun create verx`**: un proyecto nuevo con un comando, con las reglas ya incluidas.
- [ ] **14. Panel de desarrollo**: en modo dev, una capa que muestra cada isla, su peso y cuándo se hidrató.
- [ ] **15. Adaptadores** para desplegar en Cloudflare y Vercel.
- [x] **16. VERX Grafo** ✅: con `verx dev`, una segunda ventana con todo el repo en nodos (mundos, paquetes, carpetas, archivos, imports y puentes `.wasm`). Lo que bloquea el guardián late en rojo con su regla, su motivo y su línea. Todo se actualiza en tiempo real y se arregla ahí mismo. Además señala al culpable exacto, aunque la regla solo sepa «apps/web falla», y guía donde trabajas: con un aviso en el propio sitio, con una página que explica por qué el sitio no arranca y desde VS Code (`@verx/vscode`: panel, «Problemas» y barra de estado). Siguiente: el peso de cada isla sobre el grafo (une con el punto 14).

## 🖥️ VERX Desktop: la misma app como web y como escritorio

**16.** Inspirado en Electron (un proceso principal con acceso al sistema: aquí, Bun) y en Tauri (sin meter un navegador entero, y con permisos protegidos). Una sola base de código: las mismas páginas, islas, `.wasm` y APIs sirven a la web y al escritorio.

- [x] **Fase 1. `verx desktop`** ✅: servidor solo en `127.0.0.1` con un puerto aleatorio, una ventana de app propia y un candado de seguridad (token y cookie `HttpOnly`/`SameSite=Strict`) para que ninguna otra web ni programa local pueda usar las APIs del escritorio. Las páginas saben si están en escritorio con `isDesktop()`.
- [ ] **Fase 2. `crates/desktop`**: ventana nativa en Rust con el WebView del sistema (WebKit en macOS, WebKitGTK en Linux, WebView2 en Windows). El `unsafe` de FFI quedaría confinado a su propio `ffi.rs`, cambiando la regla en el guardián con su test.
- [ ] **Fase 3. Un solo ejecutable**: `bun build --compile` con el runtime de Bun incluido; pocos MB frente a los 80–150 MB de Electron.
- [ ] **Fase 4 (opcional). Sin Chromium también en Windows**: incluir Servo, el motor en Rust. Rompe la regla de cero dependencias, así que haría falta una excepción decidida por escrito.
