// Sólo existe en VERX Desktop (bun run desktop): el servidor es Bun en TU
// ordenador, así que una página puede leer sus recursos (como el proceso
// principal de Electron). En la web normal responde 404.
import { arch, cpus, freemem, platform, release, totalmem, uptime } from 'node:os'
import { isDesktop, notFound } from '@verx/kit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Escritorio', robots: 'noindex' }

const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`
const SYSTEMS = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

export default function Escritorio() {
  if (!isDesktop()) notFound()
  const cores = cpus()
  const used = totalmem() - freemem()
  const stats = [
    ['Sistema', `${SYSTEMS[platform()] ?? platform()} ${release()}`],
    ['Procesador', `${cores.length} núcleos · ${arch()}`],
    ['Memoria en uso', `${gb(used)} de ${gb(totalmem())}`],
    ['Encendido desde hace', `${Math.floor(uptime() / 3600)} h`],
    ['Motor', `Bun ${Bun.version} · JavaScriptCore`],
  ]
  return (
    <>
      <p class="eyebrow">VERX Desktop</p>
      <h1>Tu ordenador, desde la app</h1>
      <p class="lead">
        La misma app que se sirve como web corre aquí como programa de escritorio. El servidor es Bun en tu máquina y solo responde a esta ventana:
        cualquier otra web o programa que lo intente recibe un 403.
      </p>
      <dl class="stats">
        {stats.map(([label, value]) => (
          <div>
            <dt>{label}</dt>
            <dd class="small">{value}</dd>
          </div>
        ))}
      </dl>
      <p class="muted">{cores[0]?.model.trim()}</p>
    </>
  )
}
