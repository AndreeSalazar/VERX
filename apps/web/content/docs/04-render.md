---
title: "Estática, ISR y dinámica"
summary: "Cada página elige cómo se sirve; por defecto, estática y precomprimida."
---

Por defecto una página se renderiza UNA vez al arrancar, se comprime con brotli 11 y gzip 9 y se sirve desde memoria con ETag. Responder no cuesta más que servir un CSS.

```jsx title="ISR"
export const revalidate = 60 // ISR: se regenera en segundo plano cada 60 s
```

```jsx title="Dinámica"
export const dynamic = 'force-dynamic' // SSR en cada petición (lee searchParams)
```

```jsx title="Rutas con parámetros prerenderizadas"
export async function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }))
}
```

Los componentes pueden ser async, como los Server Components de Next: haz await de tus datos dentro de la página. Sólo esa rama espera; el resto del árbol se convierte en texto directamente, sin DOM virtual.

Para mostrar un 404 o redirigir desde cualquier página, usa `notFound()` o `redirect(url)` de `@verx/kit`.

## Imágenes

`<Image>` es como `next/image`, pero sin JavaScript en el navegador. `verx-img` (Rust → WASM) prepara cada PNG de `public/` **una vez**, al arrancar:

- las variantes de cada ancho, reducidas en luz lineal y con alfa premultiplicado;
- una miniatura desenfocada para el placeholder;
- el color medio.

```jsx title="app/blog/[slug]/page.jsx"
import { Image } from '@verx/kit'

<Image src="/portadas/post.png" alt="Un agujero negro sobre una nebulosa"
       sizes="(min-width: 900px) 720px, 100vw" priority />
```

| Qué hace | Por qué |
|---|---|
| `srcset` con cada variante y `sizes` | el navegador descarga sólo la que necesita |
| `width` y `height` reales | el hueco se reserva y la página no salta |
| el placeholder como fondo del propio `<img>` | se ve algo al instante, sin JS |
| `/_verx/img/…` con huella y caché de un año | se descarga una sola vez; `verx build` lo exporta |
| `alt` obligatorio | usa `alt=""` si la imagen es decorativa |

> [!NOTE]
> Por ahora sólo PNG. Para fotos, un formato con pérdida (JPEG o WebP) pesaría bastante menos: es el siguiente paso de `verx-img`.
