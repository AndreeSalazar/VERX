# @verx/search

**Puente JS ↔ Rust del buscador.** Carga `search.wasm`, compilado desde [`crates/search`](../../crates/search/README.md), que construye y consulta un índice invertido. El mismo `.wasm` sirve en el servidor y en el navegador.

```js
import { createSearch } from '@verx/search'

// Servidor (al exportar): indexa y devuelve el paquete que viaja por la red.
const search = await createSearch()
const pack = search.build([
  { title: 'Islas', body: 'Componentes que se hidratan…', data: { href: '/docs/islas' } },
])

// Navegador: descarga el paquete y busca mientras escribes.
const browser = await createSearch()
browser.load(await (await fetch('/api/buscar')).arrayBuffer())
browser.query('isl')  // [{ href: '/docs/islas', score: 96 }]
```

- **Búsqueda en español:** sin acentos ni mayúsculas, sin palabras vacías y con plurales sencillos. Cada palabra es un prefijo y deben aparecer **todas**.
- **`data`** es lo que devuelve cada resultado (por defecto, `{ title }`). Viaja en el paquete como JSON, así que el navegador no necesita nada más.
- **Paquete `VXSP`:** `"VXSP"`, la longitud de los datos, los datos JSON y el índice `VXS1`. `load` rechaza un paquete truncado, corrupto o de otra versión.
- `search.wasm` y `search.manifest.json` los genera `bun run wasm`. **No se editan a mano.** La regla `wasm-al-dia` comprueba que corresponden al código de `crates/search`.
- La ABI está versionada (`ABI_VERSION`): si el `.wasm` no coincide, `createSearch` lo rechaza con un error claro.

| Límite | |
|---|---|
| corpus | 512 KB de texto |
| índice | 512 KB |
| documentos | 4096 |
| resultados | 64 por consulta |
