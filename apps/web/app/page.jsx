import Counter from '../components/Counter.jsx'
import Code from '../components/Code.jsx'
import Hero from '../components/sections/Hero.jsx'
import Architecture from '../components/sections/Architecture.jsx'
import Bench from '../components/sections/Bench.jsx'
import Rules from '../components/sections/Rules.jsx'
import PostCards from '../components/PostCards.jsx'
import { posts } from '../lib/posts.js'

export const metadata = { title: { absolute: 'VERX · Rápido por diseño' } }

const features = [
  ['Rutas por archivos', 'app/blog/[slug]/page.jsx → /blog/:slug, con layouts anidados y metadata. Como Next.js.'],
  ['Estática por defecto', 'Cada página se renderiza una vez, se comprime con brotli 11 y se sirve desde memoria.'],
  ['ISR', 'export const revalidate = 60 y la página se regenera en segundo plano. Como en Vercel.'],
  ['Islas', "Sólo los componentes 'use client' mandan JS, y cuando se ven en pantalla. Como Astro."],
  ['Signals', 'Reactividad de grano fino sin DOM virtual: sólo cambia el nodo que depende. Como Solid.'],
  ['Rust + WASM', 'El cálculo pesado en Rust sin dependencias, 6 KB de WebAssembly y cero copias hasta la GPU.'],
  ['WebGL2 propio', 'Motor 3D mínimo: sin Three.js, se pausa fuera de pantalla y respeta reduced-motion.'],
  ['Navegación instantánea', 'Speculation Rules y View Transitions: prerender al pasar el ratón, sin router en JS.'],
]

const inspirations = [
  ['Next.js', 'app/, layouts, metadata, generateStaticParams, route.js, notFound()'],
  ['Vercel', 'ISR, cabeceras s-maxage/stale-while-revalidate, exportación a CDN'],
  ['Astro', 'Islas, cero JS por defecto, directivas client:*'],
  ['Solid', 'Signals y JSX que crea nodos reales, sin diffing'],
  ['Remix', 'Acciones de formulario con mejora progresiva'],
  ['Rust', 'Un compilador que bloquea errores antes de que existan, aplicado a todo el repo'],
]

export default function Home() {
  return (
    <>
      <Hero />

      <section class="grid">
        {features.map(([title, text]) => (
          <article class="card">
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <Architecture />

      <section class="split">
        <div>
          <h2>Una isla de verdad</h2>
          <p class="section-lead">
            Este contador se renderizó en el servidor con el resto de la página. Su JavaScript (un par de KB) se descarga cuando aparece en pantalla.
          </p>
          <Counter start={3} />
        </div>
        <Code title="app/page.jsx">{`import Counter from '../components/Counter.jsx'

export default function Home() {
  return <Counter start={3} />
}`}</Code>
      </section>

      <Bench />
      <Rules />

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
        <PostCards posts={posts} />
      </section>
    </>
  )
}
