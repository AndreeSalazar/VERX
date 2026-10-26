// VERX Grafo · «el sitio no arranca». Si el servidor de desarrollo muere al
// arrancar (un import roto, un error de sintaxis…), `verx dev` ocupa su puerto
// con esta página en vez de dejar «no se puede acceder a este sitio»: el aviso
// (aviso.js) explica el porqué con su archivo y su línea, y en cuanto el sitio
// vuelve, la recarga en vivo cambia a la página de verdad.

const DOWN = 'caido' // el id de arranque de esta página: cualquier otro recarga

const page = (grafo) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VERX · el sitio no arranca</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #04040a; color: #ececf4; font: 15px/1.6 system-ui, 'Segoe UI', sans-serif; }
  body { display: grid; place-items: center; min-height: 100vh; background: radial-gradient(60% 50% at 50% 40%, rgba(255, 77, 94, 0.12), transparent 70%), #04040a; }
  main { text-align: center; padding: 24px; }
  h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 0.04em; }
  h1 span { color: #ff4d5e; }
  p { margin: 0; color: #9a9aab; }
</style>
</head>
<body>
<main><h1><span>✖</span> El sitio no arranca</h1><p>Arregla el error y guarda: esta página se recarga sola.</p></main>
${grafo ? `<script type="module" src="${grafo}/aviso.js" data-abierto></script>` : ''}
<script>(()=>{let b;const s=new EventSource('/_verx/dev');s.onmessage=e=>{if(b&&b!==e.data)location.reload();b=e.data}})()</script>
</body>
</html>
`

/** Sirve la página en `port` hasta que se llame a `stop()`. */
export function serveDown({ port, grafo }) {
  const html = page(grafo)
  const encoder = new TextEncoder()
  return Bun.serve({
    port,
    idleTimeout: 0,
    fetch(req) {
      if (new URL(req.url).pathname === '/_verx/dev') {
        const body = new ReadableStream({ start: (c) => c.enqueue(encoder.encode(`retry: 300\ndata: ${DOWN}\n\n`)) })
        return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
      }
      return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
    },
  })
}
