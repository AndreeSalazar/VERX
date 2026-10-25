// Documentación del framework como datos: cada página de /docs/[slug] se
// prerenderiza al arrancar gracias a generateStaticParams.
// Bloques: { p } párrafo · { h } subtítulo · { code, title } código · { list } lista

export const docs = [
  {
    slug: 'empezar',
    title: 'Empezar',
    summary: 'Instalar, arrancar el servidor de desarrollo y entender la estructura.',
    body: [
      { p: 'VERX sólo necesita Bun. No hay dependencias externas: todo el framework son cuatro paquetes del propio monorepo.' },
      { code: 'bun install\nbun run dev', title: 'Desde la raíz del proyecto' },
      { p: 'bun install no descarga nada: sólo enlaza los paquetes del workspace. bun run dev arranca el sitio en http://localhost:3000 y lo recarga solo cuando guardas cualquier archivo, incluido el código del propio framework.' },
      { h: 'Estructura de una app' },
      {
        code: `apps/web/
  app/            rutas: page.jsx, layout.jsx, route.js…
  components/     componentes; los 'use client' son islas
  lib/            datos y lógica de servidor
  public/         estáticos (se sirven precomprimidos)
  verx.config.js opcional`,
        title: 'Árbol',
      },
    ],
  },
  {
    slug: 'rutas',
    title: 'Rutas por archivos',
    summary: 'Las carpetas de app/ son las URLs, con las mismas convenciones que Next.js.',
    body: [
      { p: 'Cada carpeta dentro de app/ es un segmento de la URL y cada page.jsx la hace pública. Al arrancar, VERX recorre app/ una sola vez y registra todo en el router nativo de Bun.serve, que está escrito en Zig.' },
      {
        list: [
          'app/page.jsx → /',
          'app/blog/[slug]/page.jsx → /blog/:slug (params.slug)',
          'app/docs/[...path]/page.jsx → /docs/* (params.path con las barras)',
          'app/(legal)/privacidad/page.jsx → /privacidad (los grupos no cambian la URL)',
          'app/_borradores/… → ignorado (carpeta privada)',
        ],
      },
      { code: `export default function Post({ params, searchParams }) {\n  return <h1>{params.slug}</h1>\n}`, title: 'app/blog/[slug]/page.jsx' },
      { p: 'Una URL con barra final redirige con 308 a la versión sin barra, para que cada página tenga una sola URL canónica.' },
    ],
  },
  {
    slug: 'layouts',
    title: 'Layouts y metadata',
    summary: 'Layouts anidados, títulos con plantilla y <head> generado.',
    body: [
      { p: 'Un layout.jsx envuelve todas las páginas de su carpeta y subcarpetas. Recibe children y los mismos params que la página.' },
      {
        code: `export const metadata = {\n  title: { default: 'Mi sitio', template: '%s · Mi sitio' },\n  description: 'Lo que sale en Google',\n}\n\nexport const head = () => <link rel="stylesheet" href={asset('/styles.css')} />\n\nexport default function Layout({ children }) {\n  return <main>{children}</main>\n}`,
        title: 'app/layout.jsx',
      },
      { p: 'La metadata se combina desde el layout raíz hasta la página. Para títulos que dependen de los datos, exporta async function generateMetadata({ params }). VERX genera el título, la descripción, Open Graph, canonical, theme-color y el icono.' },
    ],
  },
  {
    slug: 'render',
    title: 'Estática, ISR y dinámica',
    summary: 'Cada página elige cómo se sirve; por defecto, estática y precomprimida.',
    body: [
      { p: 'Por defecto una página se renderiza UNA vez al arrancar, se comprime con brotli 11 y gzip 9 y se sirve desde memoria con ETag. Responder no cuesta más que servir un CSS.' },
      { code: `export const revalidate = 60 // ISR: se regenera en segundo plano cada 60 s`, title: 'ISR' },
      { code: `export const dynamic = 'force-dynamic' // SSR en cada petición (lee searchParams)`, title: 'Dinámica' },
      { code: `export async function generateStaticParams() {\n  return posts.map((p) => ({ slug: p.slug }))\n}`, title: 'Rutas con parámetros prerenderizadas' },
      { p: 'Los componentes pueden ser async, como los Server Components de Next: haz await de tus datos dentro de la página. Sólo esa rama espera; el resto del árbol se convierte en texto directamente, sin DOM virtual.' },
      { p: 'Para mostrar un 404 o redirigir desde cualquier página, usa notFound() o redirect(url) de @verx/kit.' },
    ],
  },
  {
    slug: 'islas',
    title: 'Componentes cliente (islas)',
    summary: "Sólo los archivos con 'use client' mandan JavaScript, y sólo cuando hace falta.",
    body: [
      { p: "Una página sin islas pesa 0 KB de JavaScript. Si un archivo empieza por 'use client', sus componentes se renderizan en el servidor y además se hidratan en el navegador. Bun.build los empaqueta minificados y con code splitting." },
      {
        code: `'use client'\nimport { signal, computed } from '@verx/ui'\n\nexport default function Counter({ start }) {\n  const count = signal(start)\n  const double = computed(() => count() * 2)\n  return <button onClick={() => count.set(count() + 1)}>{count} · {double}</button>\n}`,
        title: 'components/Counter.jsx',
      },
      { p: 'La reactividad es de grano fino, como en Solid: el componente se ejecuta una vez y cada signal actualiza sólo el nodo que lo lee. Para que una expresión sea reactiva, envuélvela en una función: {() => count() * 2}.' },
      { code: `<Counter start={5} client:visible />  // por defecto: al entrar en pantalla\n<Counter start={5} client:idle />     // cuando el navegador esté libre\n<Counter start={5} client:load />     // en cuanto cargue\n<Counter start={5} client:none />     // sólo HTML, cero JS`, title: 'Cuándo se carga (como Astro)' },
      { p: 'Las props viajan como JSON, así que no se pueden pasar funciones. Para código que sólo debe correr en el navegador (timers, window…) usa onMount.' },
      { h: 'Listas con <For>' },
      { code: `import { For } from '@verx/ui/for'

<ul>
  <For each={todos} key={(t) => t.id} fallback={<li>Nada pendiente</li>}>
    {(t, i) => <li>{() => i() + 1}. {t.text}</li>}
  </For>
</ul>`, title: 'Lista con claves (como Solid)' },
      { p: 'Cuando la lista cambia, For sólo crea las filas nuevas, quita las que desaparecen y mueve las mínimas: calcula la subsecuencia creciente más larga, así que pasar la última fila al principio es un único movimiento. Cada fila tiene su propio ámbito, e i es un signal que sigue a la fila. Va en su propio import (@verx/ui/for) para que sólo lo paguen las islas que lo usan.' },
    ],
  },
  {
    slug: 'api',
    title: 'API y formularios',
    summary: 'Endpoints con route.js y acciones de formulario que funcionan sin JavaScript.',
    body: [
      { code: `export const GET = {\n  response: { type: 'array', items: { type: 'object', properties: { id: {}, title: {} } } },\n  handler: () => db.posts(), // los campos no declarados no salen nunca\n}\n\nexport async function POST(ctx) {\n  const data = await ctx.body()\n  return ctx.status(201).json({ ok: true })\n}`, title: 'app/api/posts/route.js' },
      { p: 'El esquema de response funciona como lista blanca: aunque la base de datos devuelva password o email, sólo salen los campos declarados.' },
      { code: `export async function action({ form }) {\n  if (!form.email) return { error: 'Falta el email' }\n  redirect('/gracias')\n}\n\nexport default function Page({ actionData }) {\n  return <form method="post">…{actionData?.error}</form>\n}`, title: 'Acción de formulario (estilo Remix)' },
      { h: 'Tiempo real' },
      { code: `export const WS = {\n  open: (ws) => ws.subscribe('chat'),\n  message: (ws, msg) => ws.publish('chat', msg),\n  close: (ws) => {},\n}`, title: 'app/api/chat/route.js → ws://…/api/chat' },
      { p: 'Un route.js que exporta WS es un WebSocket sobre el soporte nativo de Bun.serve, con pub/sub incluido. Así funciona la galaxia multijugador del inicio.' },
      { h: 'Rutas estáticas' },
      { code: `export const dynamic = 'force-static'

export async function GET() {
  return new Response(await crearIndice(), { headers: { 'content-type': 'application/x-verx-search' } })
}`, title: 'app/api/buscar/route.js' },
      { p: 'Con dynamic = force-static, el GET se ejecuta una sola vez al arrancar, se sirve precomprimido desde memoria y verx build lo exporta como un archivo más. Así viaja el índice del buscador: también funciona en un hosting estático.' },
    ],
  },
  {
    slug: 'despliegue',
    title: 'Build y despliegue',
    summary: 'Exportación estática a dist/ o servidor de producción con Bun.',
    body: [
      { code: 'bun run build   # exporta a apps/web/dist\nbun run start   # servidor de producción', title: 'Comandos' },
      { p: 'verx build escribe cada página como carpeta/index.html junto a sus versiones .br y .gz precomprimidas, más un _headers que cachea un año todo lo que lleva huella. Sirve tal cual en Cloudflare Pages, Netlify, Vercel o detrás de nginx/Caddy.' },
      { p: 'Lo que necesita servidor (SSR, API, acciones, ISR real) se lista al terminar. Para eso está verx start, que en Linux puede repartir la carga entre varios procesos con --workers auto (SO_REUSEPORT).' },
      { h: 'VERX Desktop' },
      { code: 'bun run desktop   # la misma app, en su propia ventana de escritorio', title: 'Escritorio' },
      { p: 'Inspirado en Electron y Tauri, pero sin meter un navegador entero. El servidor arranca solo en 127.0.0.1, en un puerto aleatorio, y la ventana entra con un token secreto que se cambia por una cookie HttpOnly y SameSite=Strict. Sin esa cookie, todo responde 403, WebSockets incluidos: ninguna otra web ni programa de tu ordenador puede usar las APIs del escritorio. Al cerrar la ventana, el servidor se apaga.' },
      { code: `import { isDesktop, notFound } from '@verx/kit'\nimport { cpus } from 'node:os'\n\nexport default function Page() {\n  if (!isDesktop()) notFound() // en la web normal no existe\n  return <p>{cpus().length} núcleos</p>\n}`, title: 'Una página que usa los recursos del ordenador' },
    ],
  },
  {
    slug: 'arquitectura',
    title: 'Arquitectura aislada',
    summary: 'Dos mundos (Rust y Bun) y paquetes pequeños con fronteras que se comprueban solas.',
    body: [
      { p: 'Para no acabar con un monolito, cada pieza es un paquete con una única responsabilidad y una API pública declarada en exports. Rust y JavaScript viven en carpetas separadas y sólo se comunican a través de archivos .wasm, cada uno con su paquete puente.' },
      {
        code: `crates/          MUNDO RUST (workspace propio, toolchain fijada)
  sim/           verx-sim    galaxia → .wasm (no_std, 6 KB)
  search/        verx-search buscador BM25 → .wasm (no_std, 12 KB)
  guard/         verx-guard  guardián de las reglas
packages/        MUNDO BUN (workspaces en modo aislado)
  signals/       reactividad                     → nada
  server/        HTTP sobre Bun.serve            → nada
  ui/            JSX servidor + navegador        → signals
  sim/           puente con verx-sim             → nada
  search/        puente con verx-search          → nada
  gl/            motor WebGL2                    → nada
  kit/           meta-framework y CLI            → server, ui
apps/web/        este sitio                      → kit, ui, sim, search, gl`,
        title: 'Mapa del repositorio',
      },
      { p: 'Bun instala el workspace en modo aislado: un paquete sólo puede importar lo que declara en su package.json. El guardián comprueba el resto: nada de imports profundos a src/, nada de dependencias no declaradas, nada de ciclos, y ningún componente cliente puede llegar a código de servidor.' },
      { h: 'Buscador en Rust' },
      { p: 'El buscador de esta documentación es verx-search: un índice invertido con BM25, el estándar de los buscadores de texto, escrito en Rust sin std ni dependencias. El mismo .wasm construye el índice en el servidor y lo consulta en tu navegador, así que el formato vive en un solo sitio.' },
      { list: ['Entiende el español: sin acentos ni mayúsculas, sin palabras vacías y con plurales sencillos.', 'Busca mientras escribes: cada palabra es un prefijo y deben aparecer todas.', 'Llega hasta cada sección: los resultados enlazan al apartado exacto.', 'El motor y el índice sólo se descargan al tocar el buscador.'] },
    ],
  },
  {
    slug: 'rust-3d',
    title: '3D con Rust',
    summary: 'La galaxia del inicio: física en Rust → WebAssembly, dibujo en WebGL2, sin copias.',
    body: [
      { p: 'El héroe del inicio son decenas de miles de partículas con física de verdad. La simulación está escrita en Rust (crates/sim) sin std, sin allocator y sin dependencias: el .wasm pesa 6 KB y calcula 40 000 partículas en unos 1,7 ms por frame.' },
      { h: 'El recorrido de un frame' },
      {
        list: [
          'El puntero se convierte en un rayo desde la cámara, que corta el plano de la galaxia (@verx/gl, rayToPlaneY).',
          'Rust empuja y arremolina las partículas cercanas; un muelle amortiguado las devuelve a su órbita.',
          'JS lee las posiciones con una vista Float32Array sobre la memoria del .wasm y la GPU las recibe sin copias intermedias.',
          'WebGL2 dibuja dos pasadas aditivas (halo y núcleo) sobre un fondo de nebulosa.',
        ],
      },
      { code: `import { createGalaxy } from '@verx/sim'\n\nconst galaxy = await createGalaxy({ count: 38_000, seed: 7 })\ncloud.update(galaxy.step(dt, [tuPuntero, ...losDeLosDemas])) // Rust → GPU`, title: 'apps/web/lib/galaxy-scene.js' },
      { h: 'Multijugador' },
      { p: 'Todas las personas que tienen la página abierta mueven la misma galaxia. Cada navegador manda su puntero a /api/galaxia (un WebSocket) en 8 bytes, como mucho 20 veces por segundo. El servidor junta todos los punteros y reenvía una sola instantánea, como mucho 15 veces por segundo, así que el tráfico crece con el número de personas y no con su cuadrado. Rust recibe hasta 16 punteros a la vez (ABI v2) y cada visitante se ve como un orbe de su color.' },
      { p: 'La sala se defiende sola: tiene un aforo máximo, admite un mensaje cada 30 ms por persona, ignora los mensajes inválidos o de fuera de la galaxia y retira los punteros que llevan más de 4 s quietos. Si el WebSocket falla, la galaxia sigue funcionando en modo de un jugador y se reconecta sola.' },
      { h: 'Responsable con el equipo' },
      { p: 'El bucle se pausa si el lienzo no está en pantalla o la pestaña está oculta, dibuja un solo frame si el sistema pide reducir el movimiento, baja la resolución si los frames van lentos y usa menos partículas en móviles. Sin WebGL2, queda un degradado CSS.' },
      { code: 'bun run wasm   # recompila crates/sim y publica packages/sim/sim.wasm', title: 'Al cambiar el código Rust' },
      { h: 'El agujero negro del fondo' },
      { p: 'Detrás de cada página hay un agujero negro de Schwarzschild trazado en la GPU. Por cada píxel se lanza un rayo de luz y se integra su órbita en el espacio-tiempo curvo. Todo lo que se ve sale de esa física: la sombra, el anillo de fotones, el lado de atrás del disco curvado por encima y por debajo, las estrellas deformadas en un anillo de Einstein, el Doppler relativista y el corrimiento al rojo gravitacional.' },
      { code: `// Ecuación de los fotones (rs = 1), integrada en cada píxel\ndir -= 1.5 * h2 * pos / (r * r * r * r * r) * dt\npos += dir * dt\n\n// Lejos del agujero (b > 15 rs), desviación de Einstein sin integrar\nalpha = 2.0 / b + 15.0 * PI / (16.0 * b * b)`, title: 'apps/web/lib/blackhole-shader.js' },
      { list: ['Pesa 3,5 KB y se carga cuando el navegador queda libre: el HTML llega con un agujero hecho sólo con CSS, que sigue ahí si no hay WebGL2 o se pide menos movimiento.', 'Los rayos que pasan lejos usan la fórmula de Einstein en vez de integrarse: el shader va unas 18 veces más rápido.', 'Dibuja a resolución reducida, la baja más si el equipo no llega y, si ni así, se rinde y deja el CSS.', 'Usa @verx/gl/core: sólo el contexto y el bucle, sin el resto del motor 3D.'] },
    ],
  },
  {
    slug: 'reglas',
    title: 'Reglas y guardián',
    summary: 'Las 13 reglas del repo y los tres sitios donde se hacen cumplir.',
    body: [
      { p: 'verx-guard es un binario en Rust, sin dependencias, que revisa todo el repositorio. Cada regla tiene un id estable y una indicación de cómo arreglarla.' },
      {
        list: [
          'solo-bun · cero-deps-js · cero-deps-rust: Bun es el único gestor y no hay dependencias de terceros.',
          'nombres · paquete-completo: packages/x se llama @verx/x y todo tiene README y tests.',
          'frontera-rust-js · wasm-al-dia: Rust y JS sólo se hablan mediante @verx/sim, y el .wasm siempre corresponde al código.',
          'unsafe-acotado: unsafe sólo en crates/sim/src/abi.rs.',
          'sin-restos · tamano · lf: nada de test.only ni dbg!, archivos de 400 líneas como máximo, saltos de línea LF.',
          'imports-js: las fronteras de los imports, analizadas con el AST de Bun.',
          'presupuesto: ninguna página transfiere más JS + WASM del límite fijado en verx.config.js (12 KB en este sitio).',
        ],
      },
      { h: 'Presupuesto de rendimiento' },
      { p: 'verx budget renderiza cada página, mira qué islas usa y suma lo que descargaría el navegador: el runtime, cada isla, sus chunks compartidos y el .wasm, todo comprimido con brotli. Si una página o una isla pasa del límite, el commit no entra.' },
      { code: `budget: {\n  page: 12 * 1024,   // por página\n  island: 8 * 1024,  // por isla (sin contar el runtime)\n}`, title: 'verx.config.js' },
      { h: 'Dónde bloquea' },
      {
        list: [
          'Hooks de git: pre-commit (guardián + tests) y commit-msg (mensajes convencionales).',
          'Hooks de Claude Code: deniegan npm, bun add, cargo add y --no-verify; revisan cada edición; no dejan terminar con reglas rotas.',
          'bun run verify: lo mismo a mano, más clippy pedantic y rustfmt.',
        ],
      },
      { code: 'bun run check    # el guardián\nbun run rules    # la lista con explicaciones\nbun run budget   # tabla de JS + WASM por página', title: 'Comandos' },
    ],
  },
]

export const findDoc = (slug) => docs.find((d) => d.slug === slug)

// Ancla de un título de sección: «Estructura de una app» → «estructura-de-una-app».
export const anchor = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
