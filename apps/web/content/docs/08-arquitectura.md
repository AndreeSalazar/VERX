---
title: "Arquitectura aislada"
summary: "Dos mundos (Rust y Bun) y paquetes pequeños con fronteras que se comprueban solas."
---

Para no acabar con un monolito, cada pieza es un paquete con una única responsabilidad y una API pública declarada en exports. Rust y JavaScript viven en carpetas separadas y sólo se comunican a través de archivos .wasm, cada uno con su paquete puente.

```text title="Mapa del repositorio"
crates/          MUNDO RUST (workspace propio, toolchain fijada)
  sim/           verx-sim    galaxia → .wasm (no_std, 6 KB)
  search/        verx-search buscador BM25 → .wasm (no_std, 12 KB)
  md/            verx-md     Markdown → HTML con resaltado (servidor)
  guard/         verx-guard  guardián de las reglas
packages/        MUNDO BUN (workspaces en modo aislado)
  signals/       reactividad                     → nada
  server/        HTTP sobre Bun.serve            → nada
  ui/            JSX servidor + navegador        → signals
  sim/           puente con verx-sim             → nada
  search/        puente con verx-search          → nada
  md/            puente con verx-md              → nada
  gl/            motor WebGL2                    → nada
  kit/           meta-framework y CLI            → server, ui
apps/web/        este sitio                      → kit, ui, sim, search, md, gl
```

Bun instala el workspace en modo aislado: un paquete sólo puede importar lo que declara en su `package.json`. El guardián comprueba el resto: nada de imports profundos a src/, nada de dependencias no declaradas, nada de ciclos, y ningún componente cliente puede llegar a código de servidor.

## Buscador en Rust

El buscador de esta documentación es verx-search: un índice invertido con BM25, el estándar de los buscadores de texto, escrito en Rust sin std ni dependencias. El mismo .wasm construye el índice en el servidor y lo consulta en tu navegador, así que el formato vive en un solo sitio.

- Entiende el español: sin acentos ni mayúsculas, sin palabras vacías y con plurales sencillos.
- Busca mientras escribes: cada palabra es un prefijo y deben aparecer todas.
- Llega hasta cada sección: los resultados enlazan al apartado exacto.
- El motor y el índice sólo se descargan al tocar el buscador.
