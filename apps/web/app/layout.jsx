import { asset, isDesktop } from '@verx/kit'
import { Cosmos } from '../components/BlackHole.jsx'

export const metadata = {
  title: { default: 'VERX', template: '%s · VERX' },
  description: 'Framework web sobre Bun y Rust, inspirado en Next.js, Astro y Solid. Cero dependencias, cero JS por defecto y 3D en WebAssembly.',
  themeColor: '#07070b',
}

// Lo que el layout añade al <head> (el resto lo genera `metadata`).
export const head = () => (
  <>
    <link rel="icon" href={asset('/favicon.svg')} type="image/svg+xml" />
    <link rel="stylesheet" href={asset('/styles.css')} />
    <link rel="stylesheet" href={asset('/cosmos.css')} />
  </>
)

export default function RootLayout({ children }) {
  return (
    <>
      <Cosmos />
      <header class="top">
        <a class="brand" href="/">
          <img src={asset('/favicon.svg')} alt="" width="24" height="24" />
          VERX
        </a>
        <nav>
          <a href="/docs">Docs</a>
          <a href="/blog">Blog</a>
          <a href="/isr">ISR</a>
          <a href="/contacto">Contacto</a>
          {isDesktop() && (
            <a class="desktop-link" href="/escritorio">
              Escritorio
            </a>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>
          VERX · Bun + Rust, JSX propio y cero dependencias.
          {isDesktop() && <b class="badge">VERX Desktop</b>}
        </span>
        <a href="/privacidad">Privacidad</a>
      </footer>
    </>
  )
}
