import { test, expect, afterEach } from 'bun:test'
import { signal, raw } from '@verx/ui'
import { For } from '@verx/ui/for'
import { renderToString, registerIsland, clearIslands, onIsland } from '@verx/ui/server'

afterEach(() => {
  clearIslands()
  onIsland(null)
})

test('escapa texto y atributos; raw() deja pasar HTML de confianza', async () => {
  const evil = '<img src=x onerror="alert(1)">'
  const html = await renderToString(
    <p title={evil} class="a">
      {evil}
      {raw('<hr>')}
    </p>,
  )
  expect(html).toBe('<p title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;" class="a">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;<hr></p>')
})

test('booleanos, null, style, className, void y fragmentos', async () => {
  const html = await renderToString(
    <>
      <input disabled={true} hidden={false} value={null} className="c" style={{ marginTop: '4px', '--x': 1 }} />
      {false}
      {null}
      {[1, 2].map((n) => <b>{n}</b>)}
    </>,
  )
  expect(html).toBe('<input disabled class="c" style="margin-top:4px;--x:1;"><b>1</b><b>2</b>')
})

test('signals pintan su valor actual y los eventos se omiten', async () => {
  const count = signal(3)
  const html = await renderToString(<button onClick={() => count.set(4)}>{count}</button>)
  expect(html).toBe('<button>3</button>')
})

test('componentes async (como Server Components)', async () => {
  const Slow = async ({ name }) => {
    await Bun.sleep(1)
    return <em>{name}</em>
  }
  const html = await renderToString(
    <div>
      antes <Slow name="Ana" /> después
    </div>,
  )
  expect(html).toBe('<div>antes <em>Ana</em> después</div>')
})

test('islas: envoltorio con props serializadas y directivas client:*', async () => {
  const Counter = ({ start }) => <button>{start}</button>
  registerIsland(Counter, { src: '/_verx/c.js', exportName: 'default' })
  const used = []
  onIsland((meta) => used.push(meta.src))
  const html = await renderToString(
    <main>
      <Counter start={5} client:idle />
      <Counter start={6} client:none />
    </main>,
  )
  expect(html).toBe(
    '<main><verx-island data-src="/_verx/c.js" data-export="default" data-load="idle" data-props="{&quot;start&quot;:5}"><button>5</button></verx-island><button>6</button></main>',
  )
  expect(used).toEqual(['/_verx/c.js'])
})

test('islas: pasar funciones como props es un error claro', async () => {
  const Btn = () => <button />
  registerIsland(Btn, { src: '/b.js', exportName: 'default' })
  expect(() => <Btn onPress={() => {}} />).toThrow(/no se pueden pasar funciones/)
})

test('<For> en el servidor: un map con índice, signal o array, y fallback', async () => {
  const items = signal([{ id: 1, name: 'Ana' }, { id: 2, name: 'Luis' }])
  const list = (each) => (
    <ul>
      <For each={each} key={(p) => p.id} fallback={<li>nadie</li>}>
        {(p, i) => <li>{i() + 1}. {p.name}</li>}
      </For>
    </ul>
  )
  expect(await renderToString(list(items))).toBe('<ul><li>1. Ana</li><li>2. Luis</li></ul>')
  expect(await renderToString(list(['x'].map((name, id) => ({ id, name }))))).toBe('<ul><li>1. x</li></ul>')
  expect(await renderToString(list([]))).toBe('<ul><li>nadie</li></ul>')
})
