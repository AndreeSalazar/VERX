import { asset } from '@veloz/kit'

export const metadata = {
  title: { default: 'Veloz', template: '%s · Veloz' },
  description: 'Framework web para Bun inspirado en Next.js, Astro y Solid. Cero dependencias, cero JS por defecto.',
  themeColor: '#111114',
}

// Lo que el layout añade al <head> (el resto lo genera `metadata`).
export const head = () => (
  <>
    <link rel="icon" href={asset('/favicon.svg')} type="image/svg+xml" />
    <link rel="stylesheet" href={asset('/styles.css')} />
  </>
)

export default function RootLayout({ children }) {
  return (
    <>
      <header class="top">
        <a class="brand" href="/">
          <img src={asset('/favicon.svg')} alt="" width="24" height="24" />
          Veloz
        </a>
        <nav>
          <a href="/docs">Docs</a>
          <a href="/blog">Blog</a>
          <a href="/isr">ISR</a>
          <a href="/contacto">Contacto</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>Hecho con Bun, JSX propio y cero dependencias.</span>
        <a href="/privacidad">Privacidad</a>
      </footer>
    </>
  )
}
