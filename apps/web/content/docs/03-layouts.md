---
title: "Layouts y metadata"
summary: "Layouts anidados, títulos con plantilla y <head> generado."
---

Un `layout.jsx` envuelve todas las páginas de su carpeta y subcarpetas. Recibe children y los mismos params que la página.

```jsx title="app/layout.jsx"
export const metadata = {
  title: { default: 'Mi sitio', template: '%s · Mi sitio' },
  description: 'Lo que sale en Google',
}

export const head = () => <link rel="stylesheet" href={asset('/styles.css')} />

export default function Layout({ children }) {
  return <main>{children}</main>
}
```

La metadata se combina desde el layout raíz hasta la página. Para títulos que dependen de los datos, exporta async function `generateMetadata({ params })`. VERX genera el título, la descripción, Open Graph, canonical, theme-color y el icono.
