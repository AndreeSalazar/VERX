# verx-search

Buscador de texto completo para VERX, en Rust y compilado a WebAssembly. El **mismo** `.wasm` construye el índice en el servidor (al exportar el sitio) y lo consulta en el navegador, así que el formato del índice se define en un solo sitio.

- `no_std`, sin allocator y sin dependencias. La memoria es estática y el binario ocupa pocos KB.
- **Español de verdad:** sin acentos ni mayúsculas (`Función` → `funcion`), ignora las palabras vacías (`de`, `la`, `los`…) y entiende plurales sencillos (`reglas` → `regla`, `funciones` → `funcion`).
- **Mientras escribes:** cada palabra es un prefijo (`isl` encuentra «islas»), y un documento solo aparece si contiene **todas** las palabras.
- **Relevancia BM25**, el estándar de los buscadores de texto: las palabras raras pesan más, la repetición se satura y un documento largo no gana solo por tener más texto. Estar en el título multiplica por 3 (como BM25F), y un prefijo vale menos que la palabra exacta. El logaritmo es propio, porque `no_std` no trae `ln`.

| Archivo | Responsabilidad | `unsafe` |
|---|---|---|
| `src/text.rs` | normalización, términos, palabras vacías y plurales | no |
| `src/index.rs` | formato `VXS1`: construir y leer el índice invertido | no |
| `src/query.rs` | prefijos, semántica AND y puntuación BM25 | no |
| `src/abi.rs` | contrato con JS: funciones `verx_*` y memoria estática | **solo aquí** |

## Formato `VXS1`

Little-endian y sin alineación: una cabecera (`"VXS1"`, documentos, términos, entradas), la longitud de cada documento (para BM25), dos tablas de desplazamientos, los términos ordenados y las entradas `(doc u16, tf u16)`, donde el bit alto de `tf` marca que el término está en el título. Como los términos están ordenados, buscar un prefijo es una búsqueda binaria. `Index::parse` valida todos los tamaños antes de leer, así que un índice corrupto se rechaza sin pánico.

## Límites (memoria estática)

| | |
|---|---|
| texto de entrada | 512 KB |
| índice | 512 KB |
| apariciones al indexar | 65 536 |
| documentos | 4096 |
| resultados por consulta | 64 |

```bash
cargo test -p verx-search   # tests nativos
bun run wasm                # compila y publica en packages/search (desde la raíz)
```

Si cambias la ABI o el formato `VXS1`, sube `ABI_VERSION` aquí y en `packages/search/src/index.js`.
