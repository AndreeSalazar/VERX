# VERX ✦

**Framework web sobre Bun y Rust.** Inspirado en Next.js, Astro, Solid y Remix, pero con **cero dependencias**, **cero JavaScript por defecto** y un héroe 3D simulado en **Rust → WebAssembly**.

Todo lo que se puede decidir antes de la primera petición se decide al arrancar.

```bash
bun install      # enlaza los paquetes del workspace (sin descargar nada) y activa los hooks de git
bun run dev      # http://localhost:3000 con recarga en vivo
bun run verify   # guardián + tests JS + fmt/clippy/tests de Rust
```

Necesitas [Bun](https://bun.sh) ≥ 1.3 y Rust (la versión exacta la fija `crates/rust-toolchain.toml`). **Sin npm.**

---

## VERX frente a los grandes

Una comparación cualitativa, sin favoritismos: aparece lo que VERX ya hace mejor y lo que todavía le falta. No incluye cifras de los demás frameworks, porque no los hemos medido en la misma máquina.

### De un vistazo

|                              | **VERX**                          | Next.js              | Astro                 | Remix / React Router  | SvelteKit           | SolidStart          | Qwik                | Fresh (Deno)        |
|------------------------------|-----------------------------------|----------------------|-----------------------|-----------------------|---------------------|---------------------|---------------------|---------------------|
| Runtime                      | **Bun**                           | Node (y Edge)        | Node y otros          | Node y otros          | Node y otros        | Node y otros        | Node y otros        | Deno                |
| Dependencias de terceros     | **0**                             | muchas               | muchas                | muchas                | muchas              | muchas              | muchas              | pocas               |
| JS en el navegador por defecto | **0 KB**                        | runtime de React     | **0 KB**              | runtime de React      | runtime pequeño     | runtime pequeño     | casi 0 (resumable)  | **0 KB**            |
| Modelo de UI                 | JSX propio + signals              | React (VDOM, RSC)    | cualquiera (islas)    | React (VDOM)          | compilador Svelte   | signals + JSX       | resumabilidad       | Preact (islas)      |
| Islas / hidratación parcial  | ✅ `client:load/idle/visible`      | componentes cliente  | ✅                     | ❌ (hidrata todo)      | ❌ (hidrata todo)    | ❌ (hidrata todo)    | ✅ (sin hidratar)    | ✅                   |
| Rutas por archivos y layouts | ✅                                 | ✅                    | ✅                     | ✅                     | ✅                   | ✅                   | ✅                   | ✅                   |
| ISR / stale-while-revalidate | ✅                                 | ✅                    | vía adaptadores       | cabeceras HTTP        | vía adaptadores     | vía adaptadores     | vía adaptadores     | ❌                   |
| Formularios sin JS           | ✅ `action`                        | server actions       | parcial               | ✅                     | ✅                   | ✅                   | ✅                   | ✅                   |
| Rust en el producto final    | **✅ (WASM en el navegador)**      | en el tooling (SWC/Turbopack) | ❌            | ❌                     | ❌                   | ❌                   | ❌                   | ❌                   |
| Reglas de arquitectura que bloquean | **✅ guardián + hooks**     | ❌                    | ❌                     | ❌                     | ❌                   | ❌                   | ❌                   | ❌                   |
| Ecosistema y comunidad       | 🌱 recién nacido                  | 🌳 enorme            | 🌳 grande             | 🌳 grande             | 🌳 grande           | 🌿 mediano          | 🌿 mediano          | 🌿 mediano          |

### Dónde VERX ya gana

- **Cero dependencias, de verdad.** El `package.json` de cada paquete y el `Cargo.toml` de cada crate solo apuntan a piezas propias, y una regla del guardián falla si alguien añade una de fuera.
- **Lo mínimo en el navegador.** Una página sin interacción no lleva JS. Toda la portada, con el héroe 3D incluido, transfiere **9,9 KB** de JS más WebAssembly. Solo Three.js ya pesa más.
- **El cálculo pesado en Rust.** La galaxia simula 40 000 partículas en ~1,7 ms por frame, en un `.wasm` de 6 KB, y sus datos pasan a la GPU sin copias.
- **Velocidad del servidor.** Sobre `Bun.serve` y su router nativo. En nuestra máquina rinde entre un 45 y un 60 % más que `node:http` sin nada encima (ver [Benchmarks](#benchmarks)).
- **Arquitectura que no se degrada.** Las fronteras se comprueban automáticamente en cada edición, en cada commit y al terminar cada sesión de Claude Code.

### Dónde los grandes nos ganan hoy (y por dónde crecer)

| Hueco | Quién lo tiene | Plan para VERX | Mundo |
|---|---|---|---|
| **Streaming SSR** (enviar HTML mientras carga) | Next.js, Remix, SolidStart | `renderToStream` en `@verx/ui` con límites `<Suspense>` | Bun |
| **Hidratación que reutiliza el DOM** | Svelte, Solid, Qwik | Recorrer el HTML del servidor en lugar de volver a pintar la isla | Bun |
| **Reactividad automática** (sin `() =>`) | Solid, Svelte | Plugin de Bun que envuelva las expresiones JSX al compilar | Bun |
| ~~**Optimización de imágenes**~~ ✅ | Next.js, Astro | **Hecho:** `verx-img` en Rust, con PNG, DEFLATE y JPEG propios, reducción en luz lineal y placeholder; `<Image>` sin JS (WebP/AVIF, más adelante) | 🦀 Rust |
| **Tipos TypeScript** | todos | `.d.ts` para cada paquete y `tsc --noEmit` dentro de `verify` | Bun |
| **HMR que conserva el estado** | Vite (Astro, SvelteKit…) | `bun --hot` más recarga parcial de islas | Bun |
| **Adaptadores de despliegue** (edge, serverless) | Next.js, Astro, SvelteKit | Adaptadores para Cloudflare y Vercel sobre `fetch` estándar | Bun |
| **i18n en las rutas** | Next.js, Nuxt | Segmento `[lang]` con negociación de idioma en el servidor | Bun |
| ~~**WebSockets y tiempo real**~~ ✅ | SvelteKit (vía adaptador), Fresh | **Hecho:** `app.ws()` y `export const WS` en `route.js`; la galaxia ya es multijugador | Bun |
| ~~**Listas con clave** (`<For>`)~~ ✅ | Solid | **Hecho:** `@verx/ui/for` reconcilia por clave y mueve lo mínimo (subsecuencia creciente más larga) | Bun |
| ~~**Markdown**~~ ✅ | Astro, Next.js | **Hecho:** `verx-md` en Rust: blog y docs en `.md`, con el código resaltado en el servidor y cero JS para pintarlo (MDX con islas, todavía no) | 🦀 Rust |
| ~~**Búsqueda**~~ ✅ | Docusaurus, Astro (plugins) | **Hecho:** `verx-search`, índice invertido con BM25 en Rust; el mismo `.wasm` indexa en el servidor y busca en el navegador | 🦀 Rust |
| **Ecosistema** | todos | Plantillas, ejemplos y documentación pública | — |

Cada fila es un paquete o crate nuevo con su README y sus tests, igual que el resto del repo, y el guardián se asegura de que siga así. La lista completa, en orden y con casillas, está en [ROADMAP.md](ROADMAP.md).

---

## Arquitectura: dos mundos, una frontera

```
crates/          MUNDO RUST (workspace propio, toolchain 1.99.1 fijada)
  sim/           verx-sim     galaxia → .wasm · no_std · 6 KB · unsafe sólo en abi.rs
  search/        verx-search  buscador BM25 → .wasm · no_std · 12 KB · unsafe sólo en abi.rs
  md/            verx-md      Markdown → HTML con resaltado · no_std · en el servidor
  img/           verx-img     PNG, DEFLATE y redimensionado en luz lineal · en el servidor
  guard/         verx-guard   guardián de 15 reglas (std, sin crates)
  desktop/       verx-desktop ventana nativa: WebView2 / WebKitGTK, 140 KB
packages/        MUNDO BUN (workspaces aislados: cada uno ve sólo lo que declara)
  signals/       @verx/signals   reactividad de grano fino            → nada
  server/        @verx/server    HTTP sobre Bun.serve + estáticos      → nada
  ui/            @verx/ui        JSX propio servidor/navegador         → signals
  sim/           @verx/sim       puente con verx-sim (ABI v2)          → nada
  search/        @verx/search    puente con verx-search (ABI v1)       → nada
  md/            @verx/md        puente con verx-md (ABI v1)           → nada
  img/           @verx/img       puente con verx-img (ABI v1)          → nada
  gl/            @verx/gl        motor WebGL2 propio                   → nada
  kit/           @verx/kit       rutas, islas, ISR, CLI (estilo Next)  → server, ui, img
apps/web/        el sitio                                      → kit, ui, sim, search, md, img, gl
```

- **Los puentes:** un crate se declara puente en su `Cargo.toml` (`[package.metadata.verx] bridge = "packages/…"`). `bun run wasm` compila cada uno y publica su `.wasm` en el paquete JS correspondiente, junto con un manifiesto que lleva la huella del código. Solo esos paquetes pueden cargar un `.wasm`, y si alguno no corresponde a su código Rust, la regla `wasm-al-dia` falla.
- **Cada paquete** tiene un único propósito, su README, sus tests y una API pública declarada en `exports`.

## VERX Desktop: la misma app, también como escritorio

```bash
bun run desktop   # abre la app en su propia ventana nativa (la compila la primera vez)
```

Una sola base de código con dos destinos. Las mismas páginas, islas, `.wasm`, APIs y WebSockets sirven a la web y al escritorio. En el escritorio, el servidor es Bun en tu ordenador, así que una página puede usar los recursos del sistema (ver `app/escritorio`). Las páginas saben dónde corren con `isDesktop()`.

| | Electron | Tauri | **VERX Desktop** |
|---|---|---|---|
| Proceso principal | Node (V8) | Rust | **Bun (JavaScriptCore)** |
| Navegador | Chromium incluido | WebView del sistema | **WebView del sistema en una ventana nativa en Rust** (WebView2 en Windows, WebKitGTK en Linux), sin el SDK: 140 KB. Si falta, Edge en modo app |
| Si la app no responde | pantalla en blanco | pantalla en blanco | **una página que explica qué pasa y vuelve sola** |
| Protección del servidor local | depende de la app | permisos declarados | **solo `127.0.0.1` + token → cookie `HttpOnly`/`SameSite=Strict`; sin ella, 403 en todo, WebSockets incluidos** |
| Dependencias | cientos | cientos de crates | **cero** |

El `unsafe` que exige hablar con el sistema vive solo en `crates/desktop/src/ffi/`, con sus propios guardianes: cada `unsafe` con su `// SAFETY:` y las declaraciones del sistema solo ahí. La fase siguiente (un solo ejecutable) está en el [ROADMAP](ROADMAP.md#️-verx-desktop-la-misma-app-como-web-y-como-escritorio).

## VERX Grafo: ver por qué algo está bloqueado

```bash
bun run dev      # el sitio y, en su propia ventana, el grafo (--sin-ventana para no abrirla)
bun run vscode   # una vez: el grafo también dentro de VS Code
```

Todo el repo en nodos: mundos, paquetes, carpetas, archivos, imports y puentes `.wasm`. Cuando el guardián bloquea algo, el archivo culpable late en rojo y sus carpetas llevan la cuenta. Si una regla solo sabe que «apps/web falla», el grafo lee el error y señala el archivo y la línea que importan mal. Al pulsarlo se abre ahí mismo en esa línea, con la regla, el motivo y cómo arreglarlo, y al guardar el rojo se apaga solo.

Y te guía también donde estás trabajando:

- **En el sitio:** un aviso flotante con el bloqueo y dos botones, «Ver en el grafo» y «Abrir en VS Code». Si el sitio ni arranca, en vez de «no se puede acceder» sale una página que explica por qué y se recarga sola en cuanto lo arreglas.
- **Cuando algo falla:** si el sitio no arranca o una página da error, la ventana del grafo se abre sola en el archivo y la línea culpables.
- **En VS Code:** el grafo en un panel, cada bloqueo subrayado en «Problemas» y `VERX ✖ 2` en la barra de estado. Lo que guardas allí se revisa al momento.

Todo va en tiempo real, solo en `127.0.0.1` y con el mismo candado de token que VERX Desktop.

## Todos los navegadores, sin dependencias

Lo que un navegador no trae no se puede hacer nativo en él, pero sí se puede proteger y suplir:

1. **El objetivo:** `browsers: { chrome: 120, safari: 17, firefox: 128 }` en `verx.config.js`.
2. **El guardián sabe qué exige cada carpeta.** La regla `navegadores` busca en el CSS y el JS las funciones de su tabla y bloquea lo que falta en un navegador objetivo sin protección. En VERX Grafo, cada carpeta enseña en ámbar dónde pierde algo, y su panel dice qué, en qué versión y si tiene respaldo.
3. **Respaldos propios** (`@verx/compat`), que solo descarga el navegador que los necesita:
   - las transiciones con el scroll, con `IntersectionObserver`, para Firefox y Safari < 26;
   - la precarga al pasar el ratón, para Safari y Firefox.

   En Chrome no se descarga nada nuevo. Firefox baja 1,4 KB más.

## Reglas que bloquean

Las 15 reglas de `verx-guard` (`bun run rules`) se aplican en tres sitios:

| Dónde | Qué hace |
|---|---|
| **Hooks de git** (`.githooks/`) | `pre-commit`: guardián, tests y, si cambió Rust, fmt/clippy/tests. `commit-msg`: formato `tipo(ámbito): …` |
| **Hooks de Claude Code** (`.claude/settings.json`) | Deniegan npm/yarn/pnpm, `bun add`, `cargo add`, `--no-verify` y `push --force`; revisan cada edición; no dejan terminar con reglas rotas |
| **`bun run verify`** | Todo lo anterior a mano, más clippy pedantic `-D warnings` para el host y para WebAssembly |

La lista completa y el porqué de cada regla están en [CLAUDE.md](CLAUDE.md). Si una regla molesta, se cambia en el guardián, con su test. Nunca se esquiva.

## Qué tomamos de cada casa

| De | Qué | En VERX |
|---|---|---|
| **Next.js** | App Router | `app/blog/[slug]/page.jsx`, `layout.jsx`, `route.js`, grupos `(x)`, `metadata`, `generateStaticParams`, `notFound()` |
| **Vercel** | ISR y CDN | `export const revalidate = 60`, `s-maxage` + `stale-while-revalidate`, exportación precomprimida |
| **Astro** | Islas | Solo los archivos `'use client'` mandan JS, con `client:load / idle / visible / none` |
| **Solid** | Signals | El JSX crea nodos reales y cada signal actualiza solo su nodo |
| **Remix** | Formularios | `export async function action()` con mejora progresiva |
| **Fastify** | Esquemas | `response: esquema`, que filtra campos y serializa |
| **Chrome** | Navegación | Speculation Rules y View Transitions, sin router en JS |
| **Rust** | Disciplina | Toolchain fijada, clippy pedantic y un guardián que vigila todo el repo |

## Benchmarks

Windows 11, Bun 1.3.14, 12 núcleos, 100 conexiones keep-alive, 8 s por escenario (`bun run bench`). Entre ejecuciones hay un ±5 % de variación.

| Escenario | req/s | p99 |
|---|---:|---:|
| node:http puro · texto | 33 845 | 4,43 ms |
| Bun.serve puro · texto | 53 332 | 3,04 ms |
| **VERX · texto** | **49 107** | 3,67 ms |
| **VERX · `/user/:id` con esquema** | **49 150** | 3,31 ms |
| **VERX · página prerenderizada (brotli)** | **47 304** | 3,58 ms |

| Cliente (producción, brotli) | Bytes |
|---|---:|
| Runtime de islas + chunk compartido (JSX + signals) | 2 129 |
| Héroe 3D (motor WebGL2 + escena + puente) | 3 767 |
| `sim.wasm` (Rust) | 2 596 |
| **Todas las islas del sitio + wasm** | **9 904** |

## Comandos

| Comando | Qué hace |
|---|---|
| `bun run dev` · `build` · `start` | desarrollo, exportación estática y producción |
| `bun run check` · `rules` | el guardián y su lista de reglas |
| `bun run wasm` | recompila la simulación Rust y la publica |
| `bun run budget` | JS + WASM por página contra el presupuesto (18 KB por página en el peor navegador, 9 KB por isla) |
| `bun run desktop` | la misma app como programa de escritorio (VERX Desktop) |
| `bun run grafo` | el repo en nodos, con los bloqueos del guardián en tiempo real (VERX Grafo; `bun run dev` ya lo abre) |
| `bun run vscode` | instala la extensión de VS Code: el grafo en un panel y los bloqueos en «Problemas» |
| `bun test` · `bun run test:rust` | 53 tests JS · 16 tests de Rust |
| `bun run verify` | todo junto: pásalo antes de dar algo por terminado |
| `bun run bench` | benchmark del núcleo HTTP |

## Límites actuales

- Las islas se hidratan volviendo a pintar su contenido. Si alguien escribe en un formulario antes de que hidrate, lo pierde.
- En el navegador, una expresión es reactiva solo dentro de una función: `{() => a() + b()}`.
- Las props de una isla viajan como JSON, así que no admiten funciones.
- `--workers` solo reparte la carga en Linux (SO_REUSEPORT).
- No hay HTTP/2 propio. Para TLS y HTTP/2-3, pon Caddy o nginx delante.
