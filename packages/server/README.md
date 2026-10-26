# @verx/server

Núcleo HTTP sobre `Bun.serve`. No depende de nada.

- Las rutas se registran en el **router nativo de Bun** (escrito en Zig).
- Los estáticos y las páginas prerenderizadas se comprimen **al arrancar** (brotli 11 + gzip 9), llevan ETag y se sirven desde memoria. Los archivos con huella se cachean un año (`immutable`).
- Middlewares y handlers se componen una sola vez por ruta. Si no hay middlewares globales, un estático se sirve sin crear siquiera un `Context`.
- `response: esquema` proyecta el JSON: solo salen los campos declarados.

```js
import { verx, HttpError } from '@verx/server'

const app = verx({ headers: { 'x-content-type-options': 'nosniff' } })
app.static('./public')
app.prerender('/', () => '<h1>Hola</h1>', { type: 'text/html; charset=utf-8' })
app.get('/users/:id', { response: userSchema }, (ctx) => db.user(ctx.params.id))
app.post('/echo', async (ctx) => ({ recibido: await ctx.body() }))
await app.listen(3000)
```

**Qué puede devolver un handler:** una `Response` se envía tal cual, un string como `text/plain`, un objeto con la marca `Symbol.for('verx.html')` como `text/html`, los bytes como binario y cualquier otra cosa como JSON. `undefined` responde 204.

**`ctx`:** `params`, `query`, `cookies`, `header()`, `body()`, `status()`, `set()`, `cookie()`, `text()`, `html()`, `json()`, `redirect()`, `stream()`, `req`, `server`.

**WebSockets:** usa los nativos de `Bun.serve`, con pub/sub. No pasan por los middlewares HTTP.

```js
app.ws('/sala/:id', {
  upgrade: (req) => ({ usuario: 'ana' }),   // datos extra en ws.data, o false → 403
  open: (ws) => ws.subscribe(ws.data.params.id),
  message: (ws, msg) => ws.send(`eco: ${msg}`),
  close: (ws) => {},
})
app.publish('sala-1', 'a todos')            // a todos los suscritos
```

Un GET sin upgrade recibe 426. Un error dentro de un handler se registra sin tumbar el servidor. `veloz({ wsMaxPayload })` limita el tamaño de los mensajes (16 KB por defecto).

**Sin `Bun.serve` delante** (funciones serverless como las de Vercel): `await app.handle(req)` resuelve la misma tabla de rutas en JS (`router.js`) con la precedencia de Bun: exacta, después parámetros y por último comodines. Llama a los mismos handlers. Sin servidor no hay WebSockets, así que su ruta responde 426.

**Subpath `@verx/server/assets`:** `encode`, `buildAsset`, `loadStatic`, `MIME` y `IMMUTABLE`, para construir respuestas precocinadas fuera del router (por ejemplo, ISR).

Para medirlo: `bun run bench`.
