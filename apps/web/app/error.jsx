export const metadata = { title: 'Error', robots: 'noindex' }

// error.stack sólo llega en desarrollo.
export default function ErrorPage({ error }) {
  return (
    <div class="notice">
      <p class="eyebrow">Error {error.status}</p>
      <h1>Algo ha fallado</h1>
      <p>{error.message}</p>
      {error.stack && <pre class="stack">{error.stack}</pre>}
    </div>
  )
}
