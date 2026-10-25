# @verx/sim

**El único puente entre JS y Rust.** Carga `sim.wasm`, compilado desde [`crates/sim`](../../crates/sim/README.md), y expone la galaxia del héroe 3D.

```js
import { createGalaxy } from '@verx/sim'

const galaxy = await createGalaxy({ count: 40_000, seed: 7 })
galaxy.colors                          // Float32Array r, g, b por partícula (fijo)
galaxy.step(dt, [[x, y, z], [x2, y2, z2]])  // Float32Array x, y, z, brillo por partícula
galaxy.maxPointers                     // 16: punteros simultáneos (el tuyo y los de otros visitantes)
```

**ABI v2:** `step` recibe una lista de punteros, que se escriben en un buffer del `.wasm` (`verx_pointers`). La v1 solo admitía uno. Si sobran punteros, se usan los primeros `maxPointers`.

- `sim.wasm` y `sim.manifest.json` los genera `bun run wasm` (el guardián en Rust). **No se editan a mano.**
- La regla `wasm-al-dia` compara la huella del manifiesto con el código de `crates/sim`. Si cambias el Rust y no recompilas, `bun run check` falla.
- La ABI está versionada (`ABI_VERSION`): si el `.wasm` no coincide, `createGalaxy` lo rechaza con un error claro.
- La memoria del `.wasm` es estática (65 536 partículas como máximo, unos 5 MB), así que las vistas `Float32Array` nunca se invalidan.
