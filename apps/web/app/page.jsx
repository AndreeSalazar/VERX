import Counter from '../components/Counter.jsx'
import Code from '../components/Code.jsx'
import { posts } from '../lib/posts.js'

export const metadata = { title: { absolute: 'Veloz · Rápido por diseño' } }

const features = [
  ['Rutas por archivos', 'app/blog/[slug]/page.jsx → /blog/:slug, con layouts anidados y metadata. Como Next.js.'],
  ['Estática por defecto', 'Cada página se renderiza una vez, se comprime con brotli 11 y se sirve desde memoria.'],
  ['ISR', 'export const revalidate = 60 y la página se regenera en segundo plano. Como en Vercel.'],
  ['Islas', "Sólo los componentes 'use client' mandan JS, y cuando se ven en pantalla. Como Astro."],
  ['Signals', 'Reactividad de grano fino sin DOM virtual: se actualiza sólo el nodo que cambia. Como Solid.'],
  ['Formularios sin JS', 'Acciones en la propia página que funcionan aunque el JavaScript falle. Como Remix.'],
  ['Navegación instantánea', 'Speculation Rules y View Transitions: prerender al pasar el ratón, sin router en JS.'],
  ['Paquetes aislados', 'Monorepo con fronteras comprobadas: server, signals, ui y kit no se pisan.'],
]

const inspirations = [
  ['Next.js', 'app/, layouts, metadata, generateStaticParams, route.js, notFound()'],
  ['Vercel', 'ISR, cabeceras s-maxage/stale-while-revalidate, exportación a CDN'],
  ['Astro', 'Islas, cero JS por defecto, directivas client:*'],
  ['Solid', 'Signals y JSX que crea nodos reales, sin diffing'],
  ['Remix', 'Acciones de formulario con mejora progresiva'],
  ['Fastify', 'Esquemas de respuesta compilados que filtran campos'],
]

export default function Home() {
  return (
    <>
      <section class="hero">
        <p class="eyebrow">Bun · JSX · cero dependencias</p>
        <h1>
          Rápido <span>por diseño.</span>
        </h1>
        <p class="lead">
          Un framework web inspirado en Next.js, Astro y Solid que hace al arrancar todo lo que otros hacen en cada petición. Sin dependencias y sin
          JavaScript en el navegador salvo donde haga falta.
        </p>
        <div class="actions">
          <a class="button" href="/docs/empezar">
            Empezar
          </a>
          <a class="button ghost" href="/docs">
            Documentación
          </a>
        </div>
      </section>

      <section class="grid">
        {features.map(([title, text]) => (
          <article class="card">
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section class="split">
        <div>
          <h2>Una isla de verdad</h2>
          <p>
            Este contador se renderizó en el servidor junto con el resto de la página. Su JavaScript (un par de KB) se descarga cuando aparece en
            pantalla. Lo demás de esta página no lleva JS.
          </p>
          <Counter start={3} />
        </div>
        <Code title="app/page.jsx">{`import Counter from '../components/Counter.jsx'

export default function Home() {
  return <Counter start={3} />
}`}</Code>
      </section>

      <section>
        <h2>Lo mejor de cada casa</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Idea de</th>
              <th>Qué tomamos</th>
            </tr>
          </thead>
          <tbody>
            {inspirations.map(([from, what]) => (
              <tr>
                <td>{from}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Del blog</h2>
        <ul class="list">
          {posts.map((p) => (
            <li>
              <a href={`/blog/${p.slug}`}>{p.title}</a>
              <span>{p.summary}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
