# @verx/img

**Puente JS ↔ Rust de las imágenes.** Carga `img.wasm`, compilado desde [`crates/img`](../../crates/img/README.md): reduce PNG con calidad (luz lineal, alfa premultiplicado) y genera placeholders. Se usa en el servidor; el kit lo envuelve en `image()` y `<Image>`.

```js
import { createImages } from '@verx/img'

const img = await createImages()
const out = img.process(await Bun.file('portada.png').bytes(), { widths: [480, 960, 1600], format: 'auto', quality: 82 })
// { width: 1600, height: 900, alpha: false, color: '#2a1d3f',
//   variants: [{ type: 'image/jpeg', width: 480, height: 270, bytes }, …],
//   placeholder: { width: 24, height: 14, bytes } }

const png = img.encode(rgba, 1200, 630) // RGBA en bruto → PNG
```

- **`format: 'auto'`** (por defecto): JPEG si la imagen es opaca y PNG si tiene transparencia, porque el JPEG no la guarda. También `'jpeg'` o `'png'`, y `quality` de 1 a 100 (82 por defecto).
- **Nunca agranda:** un ancho mayor que el original se queda en el original, y los repetidos se generan una vez.
- **Sin estado para quien llama:** `process` devuelve todo de una vez y copia los PNG fuera de la memoria del `.wasm`.
- La memoria del `.wasm` crece con las imágenes. El puente reserva antes de crear sus vistas, porque al crecer la memoria las vistas antiguas quedan inservibles.
- `img.wasm` y `img.manifest.json` los genera `bun run wasm`. **No se editan a mano.**
