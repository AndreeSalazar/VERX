export const metadata = { title: 'No encontrado', robots: 'noindex' }

export default function NotFound() {
  return (
    <div class="notice">
      <p class="eyebrow">Error 404</p>
      <h1>Aquí no hay nada</h1>
      <p>
        La página no existe o se ha movido. <a href="/">Volver al inicio</a>.
      </p>
    </div>
  )
}
