# @verx/kit

El meta-framework, al estilo Next.js. Depende de `@verx/server` y `@verx/ui`.

```bash
verx dev     # desarrollo con recarga en vivo (vigila también el código del framework)
verx build   # exporta lo estático a dist/ con .br/.gz y _headers
verx start   # producción (--workers auto reparte la carga en Linux)
verx budget  # JS + WASM (brotli) que transfiere cada página, contra `budget` de verx.config.js
verx desktop # la misma app como programa de escritorio (ventana propia, solo 127.0.0.1, con candado)
verx grafo   # verx dev + VERX Grafo en su propia ventana
```

| Archivo | Qué hace |
|---|---|
| `app/**/page.jsx` | página. Exporta `metadata`, `generateMetadata`, `generateStaticParams`, `revalidate`, `dynamic`, `dynamicParams`, `action` |
| `app/**/layout.jsx` | envuelve a su carpeta. Exporta `metadata` y `head` |
| `app/**/route.js` | API: `GET`, `POST`… como función o `{ response, handler }`. Con `export const WS = { open, message, close }` es un WebSocket en tiempo real. Con `export const dynamic = 'force-static'`, el `GET` se ejecuta una vez al arrancar, se sirve precomprimido y `verx build` lo exporta como archivo |
| `app/not-found.jsx`, `app/error.jsx` | páginas de 404 y de error, dentro del layout raíz |
| `app/middleware.js` | middleware global |
| `'use client'` | ese archivo es una isla: se hidrata con `client:load`, `client:idle`, `client:visible` (por defecto) o `client:none` |
| `public/` | estáticos. `asset('/x.css')` devuelve su URL con huella |
| `verx.config.js` | `lang`, `siteUrl`, `speculation`, `headers`, `bodyLimit` |

Desde páginas y layouts: `import { notFound, redirect, asset, HttpError } from '@verx/kit'`.

## Imágenes: `<Image>` e `image()`

```jsx
import { Image, image } from '@verx/kit'

<Image src="/foto.png" alt="…" sizes="(min-width: 900px) 720px, 100vw" priority />
const { src, srcset, width, height, color, placeholder } = image('/foto.png', { widths: [480, 960] })
```

Lee el PNG de `public/` y, con `@verx/img` (Rust → WASM), genera una vez sus variantes (anchos por defecto: 480, 800, 1200 y 1600; nunca agranda), la miniatura del placeholder y el color medio.

- Las variantes son JPEG si la imagen es opaca (unas 7 veces más ligeras) y PNG si tiene transparencia. Se sirven en `/_verx/img/<nombre>-<ancho>.<huella>.jpg|png` con caché inmutable, y `verx build` las exporta.
- El `<img>` sale con `srcset`, `sizes`, `width`/`height` reales, `loading="lazy"` (o `fetchpriority="high"` con `priority`), y el placeholder desenfocado de fondo. Cero JS.
- `alt` es obligatorio; `src` no puede salir de `public/`.

## VERX Grafo: el proyecto en nodos, con los bloqueos en rojo

`verx dev` arranca, además del sitio, **VERX Grafo** en el puerto siguiente (`http://127.0.0.1:3001`) y lo abre solo en su propia ventana (`--sin-ventana` o `VERX_GRAFO_VENTANA=0` lo evitan; la URL con su token sale en la consola). Y te guía en tres sitios a la vez:

| Dónde | Qué ves |
|---|---|
| **La ventana del grafo** | todo el repo en nodos; lo bloqueado late en rojo y se arregla ahí mismo |
| **El propio sitio** (`localhost:3000`) | un aviso flotante con la regla, el archivo:línea, el motivo y el arreglo, con «Ver en el grafo» y «Abrir en VS Code». Si el sitio ni arranca, en vez de «no se puede acceder» sale una página que explica por qué y se recarga sola al arreglarlo |
| **VS Code** (`bun run vscode`, ver `@verx/vscode`) | el grafo en un panel, cada bloqueo subrayado en «Problemas» y la barra de estado `VERX ✖ 2` |

- **Todo el repo en un mapa:** mundos (Rust, Bun, la app), espacios de trabajo, carpetas y archivos, con sus aristas reales: dependencias de `package.json`, imports de JS (con el analizador de Bun), `mod` de Rust y, en dorado, los puentes `.wasm`.
- **Por qué está bloqueado, y quién tiene la culpa:** cada cambio en disco pasa por el guardián (`verx-guard check --json`, primero la revisión rápida y después la completa). Cuando una regla solo sabe que «apps/web falla» (el presupuesto renderiza las páginas, y un import roto lo tumba), `blame.js` lee el error y señala el archivo y la línea que importa mal, con un arreglo concreto: «`postss` no existe en lib/posts.js: ¿quisiste decir `posts`?».
- **Tiempo real y edición ahí mismo:** pulsar algo en rojo abre el editor en la línea culpable. Ctrl+S guarda (un guardado a la vez) y el rojo se apaga solo: «✔ Desbloqueado». Si guardas en VS Code, el editor del grafo se pone al día sin pisar nada.
- **Seguro:** solo escucha en `127.0.0.1`. La ventana entra con el token, que se cambia por una cookie `HttpOnly`/`SameSite=Strict`; VS Code lo manda en la cabecera `x-verx-token`. Cada escritura comprueba el `Origin`, solo se editan archivos de texto del repo (nunca `node_modules`, `target` ni rutas de fuera) y un archivo que cambió en disco no se pisa: responde 409. El aviso del sitio solo lee, y solo responde al origen del sitio.
- **Sin agotar el navegador:** el aviso pregunta cada 1,5 s y no se queda escuchando, porque el navegador solo abre 6 conexiones por host. Si cada pestaña del sitio tuviera un SSE abierto, los guardados del editor se quedarían esperando.
- Corre en el proceso padre de `verx dev`, así que no se reinicia con cada cambio. Deja su dirección en `.verx/grafo.json` (fuera de git) para que VS Code lo encuentre.

## Todos los navegadores

- `browsers` en `verx.config.js` (`{ chrome: 120, safari: 17, firefox: 128 }`) fija el objetivo. La regla `navegadores` del guardián exige que lo que falte en alguno vaya protegido.
- Los respaldos de `@verx/compat` se empaquetan aparte, así que no cambian lo que baja Chrome. Cada página lleva una línea que los importa solo si al navegador le falta lo que suplen:
  - las transiciones con el scroll, si algún CSS de `public/` marca bloques con `--verx-reveal`;
  - la precarga al pasar el ratón, si hay `speculation`.
- `verx budget` los cuenta en cada página (el peor caso, Firefox) y los muestra aparte: «respaldos 1,4 KB (sólo Firefox/Safari)».
- En VERX Grafo, cada carpeta lleva en ámbar los navegadores en los que pierde algo, y su panel lista qué funciones exige, dónde faltan y si están protegidas o tienen respaldo.
- `?verx-compat` en la URL carga los respaldos aunque no hagan falta, para probarlos en Chrome.
