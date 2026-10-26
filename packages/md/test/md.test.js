// Prueba el contrato JS ↔ Rust con el .wasm real.
import { test, expect } from 'bun:test'
import { createMarkdown, ABI_VERSION } from '../src/index.js'

const bytes = await Bun.file(new URL('../md.wasm', import.meta.url)).arrayBuffer()
const manifest = await Bun.file(new URL('../md.manifest.json', import.meta.url)).json()
const md = await createMarkdown()

test('el manifiesto y el módulo hablan la misma ABI', async () => {
  expect(manifest.abi).toBe(ABI_VERSION)
  expect(manifest.bytes).toBe(bytes.byteLength)
  const fromBytes = await createMarkdown({ source: bytes })
  expect(fromBytes.render('*hola*').html).toBe('<p><em>hola</em></p>\n')
})

test('frontmatter, índice de títulos y palabras', () => {
  const doc = md.render('---\ntitle: "¿Por qué?"\ntags: [bun, rust]\nid: 2\n---\n# Hola\r\n\r\nUn texto con cinco palabras.\n\n## Sección dos\n')
  expect(doc.front).toEqual({ title: '¿Por qué?', tags: ['bun', 'rust'], id: 2 })
  expect(doc.headings).toEqual([
    { level: 1, id: 'hola', text: 'Hola' },
    { level: 2, id: 'seccion-dos', text: 'Sección dos' },
  ])
  expect(doc.words).toBe(8)
  expect(doc.html).toContain('<p>Un texto con cinco palabras.</p>')
})

test('código resaltado en el servidor y HTML siempre escapado', () => {
  const { html } = md.render('```rust title="lib.rs"\nfn main() {}\n```\n\n<img src=x onerror=alert(1)> [x](javascript:alert(1))')
  expect(html).toContain('<figcaption>lib.rs</figcaption><pre data-lang="rust"><code><span class="t-kw">fn</span> <span class="t-fn">main</span>()')
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; x')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('javascript:')
})

test('UTF-8 de verdad: acentos, eñes y emoji', () => {
  const { html, headings } = md.render('## Ñandú ✦ más\n\n¡Hola, señor! 🚀')
  expect(headings[0]).toEqual({ level: 2, id: 'nandu-mas', text: 'Ñandú ✦ más' })
  expect(html).toContain('<p>¡Hola, señor! 🚀</p>')
})

test('documentos que no caben fallan con un mensaje claro', () => {
  expect(() => md.render('a'.repeat(600 * 1024))).toThrow(/no cabe/)
  // Poco Markdown, mucho HTML: cada " se escapa como &quot; (6 bytes): 3 MB no caben en 2.
  expect(() => md.render('"'.repeat(500 * 1024))).toThrow(/no cabe/)
  // Y después sigue funcionando.
  expect(md.render('ok').html).toBe('<p>ok</p>\n')
})

test('una ABI distinta se rechaza con un mensaje claro', async () => {
  const original = WebAssembly.instantiate
  WebAssembly.instantiate = async () => ({ exports: { verx_abi: () => 99 } })
  try {
    await expect(createMarkdown({ source: new WebAssembly.Module(bytes) })).rejects.toThrow(/bun run wasm/)
  } finally {
    WebAssembly.instantiate = original
  }
})
