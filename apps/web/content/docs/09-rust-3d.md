---
title: "3D con Rust"
summary: "La galaxia del inicio: física en Rust → WebAssembly, dibujo en WebGL2, sin copias."
---

El héroe del inicio son decenas de miles de partículas con física de verdad. La simulación está escrita en Rust (`crates/`sim) sin std, sin allocator y sin dependencias: el .wasm pesa 6 KB y calcula 40 000 partículas en unos 1,7 ms por frame.

## El recorrido de un frame

- El puntero se convierte en un rayo desde la cámara, que corta el plano de la galaxia (`@verx/gl`, `rayToPlaneY`).
- Rust empuja y arremolina las partículas cercanas; un muelle amortiguado las devuelve a su órbita.
- JS lee las posiciones con una vista Float32Array sobre la memoria del .wasm y la GPU las recibe sin copias intermedias.
- WebGL2 dibuja dos pasadas aditivas (halo y núcleo) sobre un fondo de nebulosa.

```jsx title="apps/web/lib/galaxy-scene.js"
import { createGalaxy } from '@verx/sim'

const galaxy = await createGalaxy({ count: 38_000, seed: 7 })
cloud.update(galaxy.step(dt, [tuPuntero, ...losDeLosDemas])) // Rust → GPU
```

## Multijugador

Todas las personas que tienen la página abierta mueven la misma galaxia. Cada navegador manda su puntero a /api/galaxia (un WebSocket) en 8 bytes, como mucho 20 veces por segundo. El servidor junta todos los punteros y reenvía una sola instantánea, como mucho 15 veces por segundo, así que el tráfico crece con el número de personas y no con su cuadrado. Rust recibe hasta 16 punteros a la vez (ABI v2) y cada visitante se ve como un orbe de su color.

La sala se defiende sola: tiene un aforo máximo, admite un mensaje cada 30 ms por persona, ignora los mensajes inválidos o de fuera de la galaxia y retira los punteros que llevan más de 4 s quietos. Si el WebSocket falla, la galaxia sigue funcionando en modo de un jugador y se reconecta sola.

## Responsable con el equipo

El bucle se pausa si el lienzo no está en pantalla o la pestaña está oculta, dibuja un solo frame si el sistema pide reducir el movimiento, baja la resolución si los frames van lentos y usa menos partículas en móviles. Sin WebGL2, queda un degradado CSS.

```bash title="Al cambiar el código Rust"
bun run wasm   # recompila crates/sim y publica packages/sim/sim.wasm
```

## El agujero negro del fondo

Detrás de cada página hay un agujero negro de Schwarzschild trazado en la GPU. Por cada píxel se lanza un rayo de luz y se integra su órbita en el espacio-tiempo curvo. Todo lo que se ve sale de esa física: la sombra, el anillo de fotones, el lado de atrás del disco curvado por encima y por debajo, las estrellas deformadas en un anillo de Einstein, el Doppler relativista y el corrimiento al rojo gravitacional.

```jsx title="apps/web/lib/blackhole-shader.js"
// Ecuación de los fotones (rs = 1), integrada en cada píxel
dir -= 1.5 * h2 * pos / (r * r * r * r * r) * dt
pos += dir * dt

// Lejos del agujero (b > 15 rs), desviación de Einstein sin integrar
alpha = 2.0 / b + 15.0 * PI / (16.0 * b * b)
```

- Pesa 3,5 KB y se carga cuando el navegador queda libre: el HTML llega con un agujero hecho sólo con CSS, que sigue ahí si no hay WebGL2 o se pide menos movimiento.
- Los rayos que pasan lejos usan la fórmula de Einstein en vez de integrarse: el shader va unas 18 veces más rápido.
- Dibuja a resolución reducida, la baja más si el equipo no llega y, si ni así, se rinde y deja el CSS.
- Usa `@verx/gl/core`: sólo el contexto y el bucle, sin el resto del motor 3D.
