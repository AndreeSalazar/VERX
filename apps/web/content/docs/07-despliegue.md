---
title: "Build y despliegue"
summary: "Exportación estática a dist/, Vercel con GitHub o servidor de producción con Bun."
---

```bash title="Comandos"
bun run build          # exporta a apps/web/dist
bun run build:vercel   # .vercel/output para Vercel
bun run start          # servidor de producción
```

`verx build` escribe cada página como carpeta/index.html junto a sus versiones .br y .gz precomprimidas, más un \_headers que cachea un año todo lo que lleva huella. Sirve tal cual en Cloudflare Pages, Netlify, Vercel o detrás de nginx/Caddy.

Lo que necesita servidor (SSR, API, acciones, ISR real) se lista al terminar. Para eso está `verx start`, que en Linux puede repartir la carga entre varios procesos con `--workers` auto (SO\_REUSEPORT).

## Vercel

```bash title="Build para Vercel"
bun run build:vercel   # verx build --vercel → .vercel/output
```

`verx build --vercel` genera el formato que Vercel despliega sin más (Build Output API v3):

- `static/`: lo mismo que `verx build`, pero sin .br ni .gz, porque Vercel comprime él. Lo sirve su CDN.
- `config.json`: las rutas.
  - Las cabeceras de `verx.config.js` van en todo, y lo que lleva huella se cachea un año.
  - `/blog/` redirige a `/blog`.
  - Lo desconocido da la 404 del sitio.
- `functions/_verx.func`: una función con el runtime de Bun para lo dinámico (páginas SSR, slugs sin prerenderizar, API, acciones de formulario).
  - Es el mismo kit, con el cliente ya empaquetado: no prerenderiza nada ni vuelve a llamar a Bun.build, así que arranca en unos 60 ms.
  - Sus URLs con huella coinciden con las de `static/`.

El orden importa: el POST de `/contacto` va a la función antes de mirar los archivos, aunque `/contacto` sea una página estática.

> [!WARNING]
> Las funciones de Vercel no aceptan WebSockets. `/api/galaxia` no se despliega, así que la galaxia queda en modo de un jugador.

Dos diferencias más con `verx start`: el ISR se exporta como estático y se renueva con cada despliegue, y el middleware solo corre en lo que pasa por la función.

### Conectarlo con GitHub

1. **Sube el repo a GitHub.** Cada `git push` dispara un despliegue.
2. En vercel.com, **Add New → Project → Import Git Repository**. Dale acceso a la app de Vercel en GitHub y elige el repositorio.
3. **Root Directory: la raíz del repo**, no `apps/web`, porque el build necesita los paquetes de `packages/`. **Framework Preset: Other.**
   El `vercel.json` de la raíz ya dice el resto: `bun install`, `bun run build:vercel` y Bun 1.x para las funciones. No toques los comandos en el panel.
4. **Deploy.**
   - `main` va a producción.
   - Cada rama y cada pull request tiene su URL de vista previa.
5. **Opcional:**
   - el dominio, en *Settings → Domains*; cambia también `siteUrl` en `verx.config.js`;
   - las variables de entorno, en *Settings → Environment Variables*; se leen con `process.env` en `route.js` o en las páginas.

```json title="vercel.json"
{
  "framework": null,
  "installCommand": "bun install",
  "buildCommand": "bun run build:vercel",
  "bunVersion": "1.x"
}
```

> [!TIP]
> Vercel no necesita Rust: los `.wasm` están en el repo y el guardián vigila que correspondan al código. Antes de hacer push, `bun run verify`. Los hooks de git ya no dejan entrar nada roto.

En `verx.config.js`, `vercel.function` añade opciones a la función: `memory`, `maxDuration` o `regions`.

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
