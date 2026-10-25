// Referencia: node:http a pelo, escrito como lo escribiría cualquiera.
import { createServer } from 'node:http'

createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Hello World')
  } else if (req.url.startsWith('/user/')) {
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ id: req.url.slice(6), name: 'Ana' }))
  } else {
    res.statusCode = 404
    res.end('Not Found')
  }
}).listen(Number(process.env.PORT), '127.0.0.1')
