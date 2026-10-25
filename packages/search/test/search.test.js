// Prueba el contrato JS ↔ Rust con el .wasm real.
import { test, expect } from 'bun:test'
import { createSearch, ABI_VERSION } from '../src/index.js'

const bytes = await Bun.file(new URL('../search.wasm', import.meta.url)).arrayBuffer()
const manifest = await Bun.file(new URL('../search.manifest.json', import.meta.url)).json()

const DOCS = [
  { title: 'Rutas', body: 'Rutas por archivos, layouts y grupos.', data: { slug: 'rutas' } },
  { title: 'Islas', body: 'Componentes que se hidratan en el navegador con client:visible.', data: { slug: 'islas' } },
  { title: 'Rust y WebAssembly', body: 'La galaxia corre en Rust; las rutas de memoria son estáticas.', data: { slug: 'rust' } },
  { title: 'Despliegue', body: 'Exportación estática de las islas y del índice de búsqueda.', data: { slug: 'despliegue' } },
]
const slugs = (hits) => hits.map((h) => h.slug)

test('el manifiesto y el módulo hablan la misma ABI', async () => {
  expect(manifest.abi).toBe(ABI_VERSION)
  expect(manifest.bytes).toBe(bytes.byteLength)
  const search = await createSearch({ source: bytes })
  search.build(DOCS)
  expect(search.size).toBe(4)
})

test('relevancia: el título pesa más; prefijos, acentos y AND', async () => {
  const search = await createSearch({ source: bytes })
  search.build(DOCS)
  expect(slugs(search.query('rutas'))).toEqual(['rutas', 'rust'])
  expect(slugs(search.query('ISL'))).toEqual(['islas', 'despliegue'])
  expect(slugs(search.query('exportacion ESTÁTICA'))).toEqual(['despliegue'])
  expect(slugs(search.query('rust rutas'))).toEqual(['rust'])
  expect(search.query('islas galaxia')).toEqual([])
  expect(search.query('de la y')).toEqual([])
  expect(search.query('')).toEqual([])
  expect(search.query('rutas')[0].score).toBeGreaterThan(search.query('rutas')[1].score)
})

test('el paquete viaja: se construye en un lado y se consulta en otro', async () => {
  const server = await createSearch({ source: bytes })
  const pack = server.build(DOCS)
  expect([...pack.subarray(0, 4)]).toEqual([86, 88, 83, 80])
  const browser = await createSearch({ source: new WebAssembly.Module(bytes) })
  expect(browser.load(pack.buffer)).toBe(4)
  expect(browser.query('hidratan')).toEqual([{ slug: 'islas', score: expect.any(Number) }])
  expect(browser.query('a', 1)).toEqual([])
  expect(browser.query('rutas', 1)).toHaveLength(1)
})

test('datos por defecto: el título', async () => {
  const search = await createSearch({ source: bytes })
  search.build([{ title: 'Señales', body: 'reactividad fina' }])
  expect(search.query('senal')).toEqual([{ title: 'Señales', score: expect.any(Number) }])
})

test('rechaza paquetes corruptos, de otro formato o demasiado grandes', async () => {
  const search = await createSearch({ source: bytes })
  const pack = search.build(DOCS)
  expect(() => search.load(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]))).toThrow(/VXSP/)
  expect(() => search.load(pack.subarray(0, pack.length - 3))).toThrow(/corrupto/)
  const broken = pack.slice()
  new DataView(broken.buffer).setUint32(4, 1e9, true)
  expect(() => search.load(broken)).toThrow(/truncado/)
  expect(() => search.build([{ title: 'x', body: 'a'.repeat(600 * 1024) }])).toThrow(/no cabe/)
})

test('una ABI distinta se rechaza con un mensaje claro', async () => {
  const original = WebAssembly.instantiate
  WebAssembly.instantiate = async () => ({ exports: { verx_abi: () => 99 } })
  try {
    await expect(createSearch({ source: new WebAssembly.Module(bytes) })).rejects.toThrow(/bun run wasm/)
  } finally {
    WebAssembly.instantiate = original
  }
})

test('sin argumentos carga search.wasm desde el disco (servidor)', async () => {
  const search = await createSearch()
  search.build(DOCS)
  expect(slugs(search.query('galaxia'))).toEqual(['rust'])
})
