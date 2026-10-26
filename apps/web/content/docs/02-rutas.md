---
title: "Rutas por archivos"
summary: "Las carpetas de app/ son las URLs, con las mismas convenciones que Next.js."
---

Cada carpeta dentro de `app/` es un segmento de la URL y cada `page.jsx` la hace pública. Al arrancar, VERX recorre `app/` una sola vez y registra todo en el router nativo de `Bun.serve`, que está escrito en Zig.

| Archivo | URL | Notas |
|---|---|---|
| `app/page.jsx` | `/` | |
| `app/blog/[slug]/page.jsx` | `/blog/:slug` | `params.slug` |
| `app/docs/[...path]/page.jsx` | `/docs/*` | `params.path`, con las barras |
| `app/(legal)/privacidad/page.jsx` | `/privacidad` | los grupos no cambian la URL |
| `app/_borradores/…` | — | carpeta privada: se ignora |

> [!TIP]
> Las carpetas entre paréntesis agrupan rutas (por ejemplo, para darles un layout común) sin añadir nada a la URL.

```jsx title="app/blog/[slug]/page.jsx"
export default function Post({ params, searchParams }) {
  return <h1>{params.slug}</h1>
}
```

Una URL con barra final redirige con 308 a la versión sin barra, para que cada página tenga una sola URL canónica.
