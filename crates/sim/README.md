# verx-sim

Galaxia espiral interactiva para el héroe 3D de VERX, en Rust y compilada a WebAssembly.

- `no_std`, sin allocator y sin dependencias: **6 KB** de `.wasm`, cero imports.
- 40 000 partículas en unos 1,7 ms por frame.
- Física: rotación diferencial (el centro gira más rápido) más un muelle amortiguado. El puntero empuja y arremolina las partículas, y estas vuelven solas a su órbita.

| Archivo | Responsabilidad | `unsafe` |
|---|---|---|
| `src/math.rs` | seno, raíz y azar sin `std` | no |
| `src/galaxy.rs` | la física, sobre slices (testeable en nativo) | no |
| `src/abi.rs` | contrato con JS: funciones `verx_*` y memoria estática | **solo aquí** |

```bash
cargo test -p verx-sim   # tests nativos
bun run wasm             # compila y publica en packages/sim (desde la raíz)
```

Si cambias la ABI (firmas o formato de memoria), sube `ABI_VERSION` aquí y en `packages/sim/src/index.js`.
