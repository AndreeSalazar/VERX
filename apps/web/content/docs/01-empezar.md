---
title: "Empezar"
summary: "Instalar, arrancar el servidor de desarrollo y entender la estructura."
---

VERX sólo necesita Bun. No hay dependencias externas: todo el framework son paquetes pequeños del propio monorepo, más tres crates de Rust compilados a WebAssembly.

> [!NOTE]
> Esta documentación está escrita en Markdown y la convierte `verx-md`, en Rust, al arrancar el servidor. El código ya llega resaltado: el navegador no ejecuta nada para pintarlo.

```bash title="Desde la raíz del proyecto"
bun install
bun run dev
```

`bun install` no descarga nada: sólo enlaza los paquetes del workspace. `bun run dev` arranca el sitio en `http://localhost:3000` y lo recarga solo cuando guardas cualquier archivo, incluido el código del propio framework.

## Estructura de una app

```text title="Árbol"
apps/web/
  app/            rutas: page.jsx, layout.jsx, route.js…
  components/     componentes; los 'use client' son islas
  lib/            datos y lógica de servidor
  public/         estáticos (se sirven precomprimidos)
  verx.config.js opcional
```
