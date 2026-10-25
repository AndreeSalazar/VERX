import { veloz, HTML_MARK } from '../../src/index.js'

const app = veloz()
const page = (s) => ({ [HTML_MARK]: true, toString: () => s })

app.get('/', () => 'Hello World')
app.get('/user/:id', { response: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }, (ctx) => ({
  id: ctx.params.id,
  name: 'Ana',
}))
app.prerender('/page', () => page(`<!doctype html><title>Prerender</title><h1>Hola</h1>${'<p>contenido</p>'.repeat(60)}`))
app.static(new URL('../../test/fixtures/public', import.meta.url))

await app.listen(Number(process.env.PORT), { hostname: '127.0.0.1', log: false })
