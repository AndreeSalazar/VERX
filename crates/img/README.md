# verx-img

Imágenes para VERX, en Rust compilado a WebAssembly y **sin una sola dependencia**: el PNG, el DEFLATE y el redimensionado están escritos aquí. Se usa en el servidor (al arrancar y al exportar), así que usa `std`; el navegador sólo recibe la imagen ya hecha.

- **PNG completo:** decodifica gris, gris + alfa, RGB, RGBA y paleta con transparencia (`tRNS`), de 1, 2, 4, 8 y 16 bits. Codifica en RGB si la imagen es opaca y en RGBA si no, con el mejor filtro para cada fila.
- **DEFLATE propio:**
  - El descompresor admite bloques sin comprimir, fijos y dinámicos, y comprueba el Adler-32.
  - El compresor usa LZ77 con cadenas de hash, evaluación perezosa y códigos de Huffman dinámicos de longitud limitada. Comprime casi como zlib.
- **Redimensionado de calidad:** promedio por área, en **luz lineal** y con **alfa premultiplicado**. Promediar en sRGB oscurece los bordes claros (blanco + negro da 128 en vez de 188), y sin premultiplicar los bordes transparentes sueltan halos de color. Trabaja por filas: la memoria crece con el ancho de salida.
- **Placeholder:** una miniatura de pocos píxeles y el color medio, para que la página pinte algo antes de que llegue la imagen.
- **A salvo de archivos hostiles:** comprueba todos los CRC y no admite imágenes de más de 16 384 px de lado ni de 64 megapíxeles. La descompresión se corta en cuanto pasa del tamaño esperado.

- **JPEG para las fotos:** codificador «baseline» (YCbCr 4:2:0, DCT, cuantización por calidad con las tablas del anexo K y Huffman estándar). Un test lo decodifica de vuelta y mide la PSNR. En las portadas del sitio pesa unas 7 veces menos que el PNG.

No admite PNG entrelazado (Adam7) ni decodifica JPEG. WebP y AVIF quedan para más adelante.

| Archivo | Responsabilidad | `unsafe` |
|---|---|---|
| `src/checksum.rs` | CRC-32 y Adler-32 | no |
| `src/inflate.rs` | descompresión DEFLATE / zlib | no |
| `src/huffman.rs` · `src/deflate.rs` | compresión DEFLATE / zlib | no |
| `src/png.rs` | decodificar y codificar PNG | no |
| `src/jpeg.rs` (+ `jpeg_check.rs`, sólo tests) | codificador JPEG y su comprobación | no |
| `src/resize.rs` | redimensionado, miniatura y color medio | no |
| `src/abi.rs` | contrato con JS: funciones `verx_*` | **solo aquí** |

```bash
cargo test -p verx-img   # tests nativos
bun run wasm             # compila y publica en packages/img (desde la raíz)
```

Si cambias la ABI, sube `ABI_VERSION` aquí y en `packages/img/src/index.js`.
