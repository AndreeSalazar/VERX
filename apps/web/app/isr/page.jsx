// ISR: se sirve desde caché como una página estática y, pasados 10 s, la
// siguiente visita recibe la versión anterior al instante mientras se
// regenera en segundo plano. Mira la cabecera x-verx-cache (HIT/STALE/MISS).
export const revalidate = 10
export const metadata = { title: 'ISR en vivo' }

let renders = 0

export default async function IsrDemo() {
  renders++
  // Simula una consulta lenta: sólo la paga la regeneración, nunca el visitante.
  await Bun.sleep(300)
  const now = new Date()
  return (
    <>
      <h1>ISR en vivo</h1>
      <p class="lead">Esta página tarda 300 ms en generarse, pero tú la recibes al instante desde la caché.</p>
      <dl class="stats">
        <div>
          <dt>Generada a las</dt>
          <dd>
            <time datetime={now.toISOString()}>{now.toLocaleTimeString('es', { hour12: false })}</time>
          </dd>
        </div>
        <div>
          <dt>Renders desde que arrancó</dt>
          <dd>{renders}</dd>
        </div>
        <div>
          <dt>Se regenera cada</dt>
          <dd>{revalidate} s</dd>
        </div>
      </dl>
      <p>Recarga varias veces: la hora sólo cambia cuando han pasado más de 10 segundos, y la nueva versión llega en la visita siguiente.</p>
    </>
  )
}
