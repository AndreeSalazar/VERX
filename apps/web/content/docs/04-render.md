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
