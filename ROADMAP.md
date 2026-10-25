# Hoja de ruta de VERX

Cada plan es un paquete (`packages/`) o un crate (`crates/`) nuevo, con su README y sus tests, y vigilado por el guardián. Se marcan con `[x]` al terminar.

**Orden recomendado:** 1 → 2 → 6 → el resto según apetezca.

## 🚀 Victorias rápidas

- [x] **1. Presupuesto de rendimiento en el guardián.** ✅ `bun run budget` + regla `presupuesto`. Una regla que hace fallar el commit si una página manda más de X KB de JS o si una isla crece de más. Protege la velocidad para siempre.
- [x] **2. Galaxia multijugador.** ✅ `app.ws()`, `WS` en `route.js`, ABI v2 con 16 punteros y sala con protocolo binario. `app.ws()` sobre los WebSockets nativos de `Bun.serve`: los cursores de todos los visitantes mueven la misma galaxia en tiempo real.
- [ ] **3. Tipos TypeScript** (`.d.ts`) en todos los paquetes y `tsc --noEmit` dentro de `bun run verify`.
- [ ] **4. `<For>` con claves** en `@verx/ui`: las listas solo tocan las filas que cambian.

## 🦀 Más Rust

- [ ] **5. `verx-md`**: de Markdown a HTML en Rust, para que blog y docs sean archivos `.md`.
- [ ] **6. `verx-search`**: índice de búsqueda generado en `verx build` y consultado con WASM en el navegador, en microsegundos.
- [ ] **7. `verx-img`**: redimensionado y placeholders borrosos. Primero PNG; los codificadores WebP y AVIF desde cero son un proyecto grande.

## 🧠 Acercarse a los grandes

- [ ] **8. Streaming SSR** con `<Suspense>`: el HTML se envía por trozos mientras cargan los datos.
- [ ] **9. Hidratación que reutiliza el DOM** del servidor en lugar de volver a pintar la isla.
- [ ] **10. Compilador de reactividad**: un plugin de Bun para escribir `{a() + b()}` sin `() =>`.

## ✨ Más 3D

- [ ] **11. `@verx/gpu`**: WebGPU con *compute shaders* y WebGL2 como respaldo, para pasar de 40 mil a millones de partículas.
- [ ] **12. Transiciones 3D entre páginas**: View Transitions más shaders; la galaxia se transforma al navegar.

## 🌍 Ecosistema

- [ ] **13. `bun create verx`**: un proyecto nuevo con un comando, con las reglas ya incluidas.
- [ ] **14. Panel de desarrollo**: en modo dev, una capa que muestra cada isla, su peso y cuándo se hidrató.
- [ ] **15. Adaptadores** para desplegar en Cloudflare y Vercel.
