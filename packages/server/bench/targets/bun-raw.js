// Techo: Bun.serve a pelo, sin framework.
const headers = { 'content-type': 'text/plain; charset=utf-8' }

Bun.serve({
  port: Number(process.env.PORT),
  hostname: '127.0.0.1',
  routes: {
    '/': () => new Response('Hello World', { headers }),
    '/user/:id': (req) => Response.json({ id: req.params.id, name: 'Ana' }),
  },
})
