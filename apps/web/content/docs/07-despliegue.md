---
title: "Build y despliegue"
summary: "Exportación estática a dist/ o servidor de producción con Bun."
---

```bash title="Comandos"
bun run build   # exporta a apps/web/dist
bun run start   # servidor de producción
```

`verx build` escribe cada página como carpeta/index.html junto a sus versiones .br y .gz precomprimidas, más un \_headers que cachea un año todo lo que lleva huella. Sirve tal cual en Cloudflare Pages, Netlify, Vercel o detrás de nginx/Caddy.

Lo que necesita servidor (SSR, API, acciones, ISR real) se lista al terminar. Para eso está `verx start`, que en Linux puede repartir la carga entre varios procesos con `--workers` auto (SO\_REUSEPORT).

## VERX Desktop

```bash title="Escritorio"
bun run desktop   # la misma app, en su propia ventana de escritorio
```

Inspirado en Electron y Tauri, pero sin meter un navegador entero. El servidor arranca solo en 127.0.0.1, en un puerto aleatorio, y la ventana entra con un token secreto que se cambia por una cookie HttpOnly y SameSite=Strict. Sin esa cookie, todo responde 403, WebSockets incluidos: ninguna otra web ni programa de tu ordenador puede usar las APIs del escritorio. Al cerrar la ventana, el servidor se apaga.

```jsx title="Una página que usa los recursos del ordenador"
import { isDesktop, notFound } from '@verx/kit'
import { cpus } from 'node:os'

export default function Page() {
  if (!isDesktop()) notFound() // en la web normal no existe
  return <p>{cpus().length} núcleos</p>
}
```
