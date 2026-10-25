# @verx/kit

El meta-framework, al estilo Next.js. Depende de `@verx/server` y `@verx/ui`.

```bash
verx dev     # desarrollo con recarga en vivo (vigila también el código del framework)
verx build   # exporta lo estático a dist/ con .br/.gz y _headers
verx start   # producción (--workers auto reparte la carga en Linux)
verx budget  # JS + WASM (brotli) que transfiere cada página, contra `budget` de verx.config.js
verx desktop # la misma app como programa de escritorio (ventana propia, solo 127.0.0.1, con candado)
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
