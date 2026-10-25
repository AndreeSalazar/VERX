# @veloz/kit

El meta-framework, al estilo Next.js. Depende de `@veloz/server` y `@veloz/ui`.

```bash
veloz dev     # desarrollo con recarga en vivo (vigila también el código del framework)
veloz build   # exporta lo estático a dist/ con .br/.gz y _headers
veloz start   # producción (--workers auto reparte la carga en Linux)
```

| Archivo | Qué hace |
|---|---|
| `app/**/page.jsx` | página. Exporta `metadata`, `generateMetadata`, `generateStaticParams`, `revalidate`, `dynamic`, `dynamicParams`, `action` |
| `app/**/layout.jsx` | envuelve a su carpeta. Exporta `metadata` y `head` |
| `app/**/route.js` | API: `GET`, `POST`… como función o `{ response, handler }` |
| `app/not-found.jsx`, `app/error.jsx` | páginas de 404 y de error, dentro del layout raíz |
| `app/middleware.js` | middleware global |
| `'use client'` | ese archivo es una isla: se hidrata con `client:load`, `client:idle`, `client:visible` (por defecto) o `client:none` |
| `public/` | estáticos. `asset('/x.css')` devuelve su URL con huella |
| `veloz.config.js` | `lang`, `siteUrl`, `speculation`, `headers`, `bodyLimit` |

Desde páginas y layouts: `import { notFound, redirect, asset, HttpError } from '@veloz/kit'`.
