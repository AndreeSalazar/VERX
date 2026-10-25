// VERX Desktop (fase 1): la misma app como aplicación de escritorio.
// Inspiración: Electron (un proceso principal con acceso al sistema, aquí Bun)
// y Tauri (sin meter un navegador entero, con los permisos protegidos).
//
// Seguridad, el riesgo real de las apps locales: un servidor en localhost con
// acceso al sistema podría ser llamado por CUALQUIER web abierta en el
// navegador. Por eso:
//  · sólo escucha en 127.0.0.1, en un puerto aleatorio;
//  · la ventana entra una vez con un token secreto aleatorio, que se cambia por
//    una cookie HttpOnly + SameSite=Strict;
//  · cualquier petición (páginas, APIs, estáticos, WebSockets) sin esa cookie → 403.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { HttpError } from '@verx/server'

const COOKIE = 'verx_desktop'
export const ENTRY = '/_verx/desktop'

export const newToken = () => randomBytes(24).toString('base64url')

function same(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && timingSafeEqual(x, y)
}

function cookieOf(req) {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return null
}

// ¿Esta petición viene de la ventana de la app? (también para el upgrade de WebSocket)
export const desktopAllows = (req, token) => same(cookieOf(req), token)

// Middleware global del modo escritorio.
export function desktopGuard(token) {
  return (ctx) => {
    if (ctx.path === ENTRY) {
      if (!same(ctx.query.token, token)) throw new HttpError(403, 'Token de escritorio inválido')
      return ctx.cookie(COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' }).redirect('/', 303)
    }
    if (!desktopAllows(ctx.req, token)) throw new HttpError(403, 'VERX Desktop: sólo se puede usar desde la ventana de la app')
  }
}

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

// Cómo abrir la ventana en cada sistema. `windowed`: es una ventana de app que
// podemos esperar (al cerrarla, se apaga el servidor). Si no, se abre una
// pestaña del navegador por defecto y se cierra con Ctrl+C.
// Windows trae Edge siempre: su modo --app es, por dentro, lo mismo que el
// WebView2 del sistema. En macOS y Linux la ventana nativa llega en la fase 2.
export function windowCommand({ platform = process.platform, url, profile, exists = existsSync } = {}) {
  if (platform === 'win32') {
    const edge = EDGE.find((p) => exists(p))
    if (edge) {
      return { windowed: true, cmd: [edge, `--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'] }
    }
    return { windowed: false, cmd: ['cmd', '/c', 'start', '', url] }
  }
  return { windowed: false, cmd: platform === 'darwin' ? ['open', url] : ['xdg-open', url] }
}

// Carpeta de datos propia de cada app (perfil de la ventana, aislado del navegador del usuario).
export function profileDir(root, env = process.env) {
  const base = env.LOCALAPPDATA ?? env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(base, 'verx-desktop', basename(root))
}

export async function runDesktop({ root }) {
  const { createKit } = await import('./kit.js')
  const token = newToken()
  const kit = await createKit({ root, desktop: { token } })
  const server = await kit.listen(0, { hostname: '127.0.0.1', log: false })
  const profile = profileDir(root)
  mkdirSync(profile, { recursive: true })
  const { cmd, windowed } = windowCommand({ url: `http://127.0.0.1:${server.port}${ENTRY}?token=${token}`, profile })
  const win = Bun.spawn(cmd, { stdio: ['ignore', 'ignore', 'ignore'] })
  console.log(`[verx] escritorio en 127.0.0.1:${server.port} · ${windowed ? 'ventana propia: ciérrala para salir' : 'abierto en el navegador: Ctrl+C para salir'}`)
  if (!windowed) return
  await win.exited
  await kit.close()
  process.exit(0)
}
