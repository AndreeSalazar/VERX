// Documentación del framework como datos: cada página de /docs/[slug] se
// prerenderiza al arrancar gracias a generateStaticParams.
// Bloques: { p } párrafo · { h } subtítulo · { code, title } código · { list } lista

export const docs = [
  {
    slug: 'empezar',
    title: 'Empezar',
    summary: 'Instalar, arrancar el servidor de desarrollo y entender la estructura.',
    body: [
      { p: 'Veloz sólo necesita Bun. No hay dependencias externas: todo el framework son cuatro paquetes del propio monorepo.' },
      { code: 'bun install\nbun run dev', title: 'Desde la raíz del proyecto' },
      { p: 'bun install no descarga nada: sólo enlaza los paquetes del workspace. bun run dev arranca el sitio en http://localhost:3000 y lo recarga solo cuando guardas cualquier archivo, incluido el código del propio framework.' },
      { h: 'Estructura de una app' },
      {
        code: `apps/web/
  app/            rutas: page.jsx, layout.jsx, route.js…
  components/     componentes; los 'use client' son islas
  lib/            datos y lógica de servidor
  public/         estáticos (se sirven precomprimidos)
  veloz.config.js opcional`,
        title: 'Árbol',
      },
    ],
  },
  {
    slug: 'rutas',
    title: 'Rutas por archivos',
    summary: 'Las carpetas de app/ son las URLs, con las mismas convenciones que Next.js.',
    body: [
      { p: 'Cada carpeta dentro de app/ es un segmento de la URL y cada page.jsx la hace pública. Al arrancar, Veloz recorre app/ una sola vez y registra todo en el router nativo de Bun.serve, que está escrito en Zig.' },
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
      { p: 'La metadata se combina desde el layout raíz hasta la página. Para títulos que dependen de los datos, exporta async function generateMetadata({ params }). Veloz genera el título, la descripción, Open Graph, canonical, theme-color y el icono.' },
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
      { p: 'Para mostrar un 404 o redirigir desde cualquier página, usa notFound() o redirect(url) de @veloz/kit.' },
    ],
  },
  {
    slug: 'islas',
    title: 'Componentes cliente (islas)',
    summary: "Sólo los archivos con 'use client' mandan JavaScript, y sólo cuando hace falta.",
    body: [
      { p: "Una página sin islas pesa 0 KB de JavaScript. Si un archivo empieza por 'use client', sus componentes se renderizan en el servidor y además se hidratan en el navegador. Bun.build los empaqueta minificados y con code splitting." },
      {
        code: `'use client'\nimport { signal, computed } from '@veloz/ui'\n\nexport default function Counter({ start }) {\n  const count = signal(start)\n  const double = computed(() => count() * 2)\n  return <button onClick={() => count.set(count() + 1)}>{count} · {double}</button>\n}`,
        title: 'components/Counter.jsx',
      },
      { p: 'La reactividad es de grano fino, como en Solid: el componente se ejecuta una vez y cada signal actualiza sólo el nodo que lo lee. Para que una expresión sea reactiva, envuélvela en una función: {() => count() * 2}.' },
      { code: `<Counter start={5} client:visible />  // por defecto: al entrar en pantalla\n<Counter start={5} client:idle />     // cuando el navegador esté libre\n<Counter start={5} client:load />     // en cuanto cargue\n<Counter start={5} client:none />     // sólo HTML, cero JS`, title: 'Cuándo se carga (como Astro)' },
      { p: 'Las props viajan como JSON, así que no se pueden pasar funciones. Para código que sólo debe correr en el navegador (timers, window…) usa onMount.' },
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
    ],
  },
  {
    slug: 'despliegue',
    title: 'Build y despliegue',
    summary: 'Exportación estática a dist/ o servidor de producción con Bun.',
    body: [
      { code: 'bun run build   # exporta a apps/web/dist\nbun run start   # servidor de producción', title: 'Comandos' },
      { p: 'veloz build escribe cada página como carpeta/index.html junto a sus versiones .br y .gz precomprimidas, más un _headers que cachea un año todo lo que lleva huella. Sirve tal cual en Cloudflare Pages, Netlify, Vercel o detrás de nginx/Caddy.' },
      { p: 'Lo que necesita servidor (SSR, API, acciones, ISR real) se lista al terminar. Para eso está veloz start, que en Linux puede repartir la carga entre varios procesos con --workers auto (SO_REUSEPORT).' },
    ],
  },
  {
    slug: 'arquitectura',
    title: 'Arquitectura aislada',
    summary: 'Un monorepo de paquetes pequeños con fronteras que se comprueban solas.',
    body: [
      { p: 'Para no acabar con un monolito, cada pieza es un paquete con una única responsabilidad y una API pública declarada en exports:' },
      {
        list: [
          '@veloz/signals: reactividad. No depende de nada.',
          '@veloz/server: HTTP sobre Bun.serve. No depende de nada.',
          '@veloz/ui: JSX de servidor y de navegador. Depende de signals.',
          '@veloz/kit: rutas, render, islas y CLI. Depende de server y ui.',
          'apps/web: este sitio. Depende de kit y ui.',
        ],
      },
      { p: 'Bun instala el workspace en modo aislado: un paquete sólo puede importar lo que declara en su package.json. Además, bun run check revisa las fronteras: nada de imports profundos a src/, nada de dependencias no declaradas, nada de ciclos, y los componentes cliente no pueden importar código de servidor.' },
    ],
  },
]

export const findDoc = (slug) => docs.find((d) => d.slug === slug)
