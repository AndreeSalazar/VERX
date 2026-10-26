---
title: "API y formularios"
summary: "Endpoints con route.js y acciones de formulario que funcionan sin JavaScript."
---

```jsx title="app/api/posts/route.js"
export const GET = {
  response: { type: 'array', items: { type: 'object', properties: { id: {}, title: {} } } },
  handler: () => db.posts(), // los campos no declarados no salen nunca
}

export async function POST(ctx) {
  const data = await ctx.body()
  return ctx.status(201).json({ ok: true })
}
```

El esquema de response funciona como lista blanca: aunque la base de datos devuelva password o email, sólo salen los campos declarados.

```jsx title="Acción de formulario (estilo Remix)"
export async function action({ form }) {
  if (!form.email) return { error: 'Falta el email' }
  redirect('/gracias')
}

export default function Page({ actionData }) {
  return <form method="post">…{actionData?.error}</form>
}
```

## Tiempo real

```jsx title="app/api/chat/route.js → ws://…/api/chat"
export const WS = {
  open: (ws) => ws.subscribe('chat'),
  message: (ws, msg) => ws.publish('chat', msg),
  close: (ws) => {},
}
```

Un `route.js` que exporta WS es un WebSocket sobre el soporte nativo de `Bun.serve`, con pub/sub incluido. Así funciona la galaxia multijugador del inicio.

## Rutas estáticas

```jsx title="app/api/buscar/route.js"
export const dynamic = 'force-static'

export async function GET() {
  return new Response(await crearIndice(), { headers: { 'content-type': 'application/x-verx-search' } })
}
```

Con dynamic = force-static, el GET se ejecuta una sola vez al arrancar, se sirve precomprimido desde memoria y `verx build` lo exporta como un archivo más. Así viaja el índice del buscador: también funciona en un hosting estático.
