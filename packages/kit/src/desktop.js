// VERX Desktop: la misma app como aplicación de escritorio, en una ventana
// nativa (crates/desktop → verx-desktop: WebView2 en Windows, WebKitGTK en
// Linux; ~140 KB) o, si no se puede, en la de Edge o el navegador.
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
import { findRepoRoot } from './grafo/model.js'
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
// WebView2 del sistema. La nativa (verx-desktop) va antes que ésta: ver openWindow.
export function windowCommand({ platform = process.platform, url, profile, exists = existsSync, native = null, title = 'VERX', width = 1200, height = 800 } = {}) {
  if (native) {
    return { windowed: true, native: true, cmd: [native, '--url', url, '--profile', profile, '--title', title, '--width', String(width), '--height', String(height)] }
  }
  if (platform === 'win32') {
    const edge = EDGE.find((p) => exists(p))
    if (edge) {
      return { windowed: true, cmd: [edge, `--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'] }
    }
    return { windowed: false, cmd: ['cmd', '/c', 'start', '', url] }
  }
  return { windowed: false, cmd: platform === 'darwin' ? ['open', url] : ['xdg-open', url] }
}

// El ejecutable de la ventana nativa (crates/desktop), si ya está compilado.
// Sólo Windows y Linux: en macOS, la de siempre.
export function nativeBinary(repoRoot, { platform = process.platform, exists = existsSync } = {}) {
  if (platform !== 'win32' && platform !== 'linux') return null
  const file = join(repoRoot, 'crates', 'target', 'release', platform === 'win32' ? 'verx-desktop.exe' : 'verx-desktop')
  return exists(file) ? file : null
}

// La ventana nativa, compilándola la primera vez si el repo trae su crate
// (cargo, unos segundos). null si no se puede: se usará la de siempre.
export async function ensureNative(repoRoot) {
  const found = nativeBinary(repoRoot)
  if (found || !existsSync(join(repoRoot, 'crates', 'desktop', 'Cargo.toml'))) return found
  console.log('[verx] compilando la ventana nativa (crates/desktop, sólo la primera vez)…')
  const build = Bun.spawn(['cargo', 'build', '-q', '--release', '-p', 'verx-desktop'], { cwd: join(repoRoot, 'crates'), stdout: 'inherit', stderr: 'inherit' })
  return (await build.exited) === 0 ? nativeBinary(repoRoot) : null
}

// Abre una ventana de app: la nativa si hay; si sale con el código 3 (falta
// el motor web del sistema: WebView2 o WebKitGTK), la de Edge o el navegador.
// Devuelve si es una ventana que se puede esperar y la promesa de su cierre.
export async function openWindow({ url, profile, title = 'VERX', native = null, width, height }) {
  if (native) {
    const proc = Bun.spawn(windowCommand({ url, profile, native, title, width, height }).cmd, { stdio: ['ignore', 'ignore', 'inherit'] })
    const early = await Promise.race([proc.exited, Bun.sleep(2500).then(() => null)])
    if (early !== 3) return { windowed: true, exited: proc.exited }
    console.warn('[verx] la ventana nativa no tiene motor web en este sistema: abro la de siempre')
  }
  const { cmd, windowed } = windowCommand({ url, profile })
  return { windowed, exited: Bun.spawn(cmd, { stdio: ['ignore', 'ignore', 'ignore'] }).exited }
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
  const native = await ensureNative(findRepoRoot(root))
  const { windowed, exited } = await openWindow({ url: `http://127.0.0.1:${server.port}${ENTRY}?token=${token}`, profile, title: kit.config.title ?? 'VERX', native })
  console.log(`[verx] escritorio en 127.0.0.1:${server.port} · ${windowed ? 'ventana propia: ciérrala para salir' : 'abierto en el navegador: Ctrl+C para salir'}`)
  if (!windowed) return
  await exited
  await kit.close()
  process.exit(0)
}
