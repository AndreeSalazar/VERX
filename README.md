# Veloz ⚡

Framework web para **Bun**, inspirado en Next.js, Vercel, Astro, Solid y Remix.
**Cero dependencias, cero JavaScript en el navegador por defecto**, y todo lo que
se puede decidir antes de la primera petición se decide al arrancar.

```bash
bun install      # solo enlaza los paquetes del workspace: no descarga nada
bun run dev      # http://localhost:3000 con recarga en vivo
bun test         # 43 tests de todos los paquetes
bun run check    # verifica las fronteras entre paquetes
bun run build    # exporta el sitio estático a apps/web/dist
bun run start    # servidor de producción
bun run bench    # benchmark del núcleo HTTP
```

Solo hace falta [Bun](https://bun.sh) ≥ 1.3, sin npm.

## Arquitectura: paquetes aislados, no un monolito

```
packages/
  signals/   @veloz/signals   reactividad (signal, computed, effect)    → no depende de nada
  server/    @veloz/server    HTTP sobre Bun.serve, estáticos, prerender → no depende de nada
  ui/        @veloz/ui        JSX propio: string en servidor, DOM real   → signals
  kit/       @veloz/kit       rutas por archivos, render, islas, CLI     → server, ui
apps/
  web/                        el sitio (la web del propio framework)    → kit, ui
scripts/check-architecture.js las fronteras se comprueban, no se prometen
```

Tres mecanismos mantienen el aislamiento:

1. **Bun en modo `isolated`** (`bunfig.toml`): cada paquete solo puede importar lo que declara en su `package.json`. Lo que no está declarado falla al importarlo, en vez de funcionar de casualidad.
2. **`exports`** en cada `package.json`: solo se puede usar la API pública, nunca `src/` por dentro.
3. **`bun run check`** analiza los imports reales (con el AST de Bun) y falla si encuentra:
   - imports relativos que salen del paquete,
   - dependencias no declaradas o de terceros,
   - ciclos entre paquetes,
   - módulos de Node sin el prefijo `node:`,
   - componentes `'use client'` que lleguen a código de servidor, aunque sea indirectamente.

Cada paquete tiene su README, sus tests y su `tsconfig.json`, y se puede entender sin abrir los demás.

## Qué se tomó de cada framework

| De | Qué | Cómo se usa aquí |
|---|---|---|
| **Next.js** | App Router | `app/blog/[slug]/page.jsx`, `layout.jsx`, `route.js`, grupos `(x)`, carpetas `_privadas` |
| | Metadata | `metadata`, `generateMetadata`, plantillas de título, Open Graph |
| | Datos | componentes `async`, `generateStaticParams`, `notFound()`, `redirect()` |
| **Vercel** | ISR | `export const revalidate = 60` con stale-while-revalidate y `s-maxage` para CDN |
| | Despliegue | `veloz build` → `dist/` precomprimido y `_headers` |
| **Astro** | Islas | solo los archivos `'use client'` mandan JS, con `client:load / idle / visible / none` |
| **Solid** | Reactividad | signals de grano fino; el JSX crea nodos reales, sin DOM virtual |
| **Remix** | Formularios | `export async function action()`, que funciona sin JavaScript |
| **Fastify** | Esquemas | `response: esquema`, que filtra campos y serializa |
| **Chrome** | Navegación | Speculation Rules (prerender al pasar el ratón) y View Transitions, sin router en JS |

## Por qué es rápido

| Técnica | Efecto |
|---|---|
| Router nativo de `Bun.serve` (Zig) | sin regex ni recorrido de rutas en JS |
| Páginas estáticas por defecto | se renderizan una vez y se sirven como un archivo |
| Brotli 11 + gzip 9 al arrancar | entre un 15 y un 25 % menos bytes que gzip, sin coste por petición |
| URLs con huella + `immutable` | el navegador no vuelve a preguntar nunca |
| Islas | una página sin interacción pesa 0 KB de JS |
| Runtime compartido | JSX + signals ≈ 3 KB minificado, en un chunk que comparten todas las islas |
| `modulepreload` | el runtime y su chunk se piden en paralelo |
| ISR | nadie espera un render salvo el primer visitante |
| Componentes `async` | solo espera la rama que lo necesita |

## Benchmarks

Windows 11, Bun 1.3.14, 12 núcleos, 100 conexiones keep-alive, 4 hilos de carga en la
misma máquina, 8 s por escenario (`bun run bench`). Entre una ejecución y otra hay un ±5 % de variación.

| Escenario | req/s | p99 |
|---|---:|---:|
| node:http puro · texto | 33 845 | 4,43 ms |
| Bun.serve puro · texto | 53 332 | 3,04 ms |
| **Veloz · texto** | **49 107** | 3,67 ms |
| node:http puro · JSON | 30 966 | 6,38 ms |
| Bun.serve puro · JSON | 55 242 | 2,90 ms |
| **Veloz · `/user/:id` con esquema** | **49 150** | 3,31 ms |
| **Veloz · página prerenderizada (brotli)** | **47 304** | 3,58 ms |
| **Veloz · CSS estático (brotli)** | **45 830** | 3,60 ms |

**Cómo leerlo:** Veloz cuesta entre un 3 y un 11 % respecto a `Bun.serve` sin nada encima
(que es su techo) y rinde entre un 45 y un 60 % más que `node:http` sin nada encima. Hay que
tenerlo en cuenta: en un sitio real casi todo son páginas prerenderizadas y archivos con huella,
así que la mayoría de visitas repetidas ni siquiera llegan al servidor.

En una versión anterior sobre Node, el serializador JSON "compilado" (estilo fast-json-stringify)
salió **más lento** que `JSON.stringify` nativo, así que se cambió por una proyección. Y servir los
cuerpos como strings latin1 dio entre un 8 y un 18 % más en `node:http`. Las optimizaciones se miden;
no se suponen.

## Límites conocidos

- Las islas se hidratan **re-renderizando** su contenido (no reaprovechan el DOM del servidor). Para islas pequeñas no se nota, pero un formulario a medio escribir antes de hidratar perdería lo escrito.
- En el navegador, una expresión es reactiva solo si va dentro de una función: `{() => a() + b()}`. Sin compilador no hay forma de detectarlo sola.
- Las props de una isla viajan como JSON: no se pueden pasar funciones ni `children` del servidor.
- `--workers` solo reparte carga en Linux (SO_REUSEPORT). En Windows y macOS arranca un único proceso.
- No hay streaming SSR (`Suspense`), optimización de imágenes ni HTTP/2 propio. Para TLS y HTTP/2-3, pon Caddy o nginx delante.
