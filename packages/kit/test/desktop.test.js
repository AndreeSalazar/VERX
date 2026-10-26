// Modo escritorio: el candado (token → cookie) y cómo se abre la ventana.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { verx } from '@verx/server'
import { desktopGuard, desktopAllows, windowCommand, profileDir, newToken, ENTRY, nativeBinary } from '../src/desktop.js'

const token = newToken()
const app = verx()
app.use(desktopGuard(token))
app.get('/', () => 'app de escritorio')
app.get('/api/sistema', () => ({ secreto: 'recursos del ordenador' }))
let base

beforeAll(async () => {
  base = (await app.listen(0, { hostname: '127.0.0.1', log: false })).url.href.replace(/\/$/, '')
})
afterAll(() => app.close())

const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} })

test('sin la cookie de la ventana, nada responde (ni páginas ni APIs)', async () => {
  expect((await get('/')).status).toBe(403)
  expect((await get('/api/sistema')).status).toBe(403)
  expect((await get('/no-existe')).status).toBe(403) // ni siquiera revela qué rutas existen
})

test('un token falso no abre la puerta', async () => {
  expect((await get(`${ENTRY}?token=adivinado`)).status).toBe(403)
})

test('el token correcto se cambia por una cookie HttpOnly + SameSite=Strict', async () => {
  const entry = await get(`${ENTRY}?token=${token}`)
  expect(entry.status).toBe(303)
  expect(entry.headers.get('location')).toBe('/')
  const setCookie = entry.headers.get('set-cookie')
  expect(setCookie).toContain('HttpOnly')
  expect(setCookie).toContain('SameSite=Strict')
  const cookie = setCookie.split(';')[0]
  expect(await (await get('/', cookie)).text()).toBe('app de escritorio')
  expect((await get('/api/sistema', cookie)).status).toBe(200)
})

test('el upgrade de WebSocket también exige la cookie', () => {
  const req = (cookie) => new Request('http://127.0.0.1/', { headers: cookie ? { cookie } : {} })
  expect(desktopAllows(req(), token)).toBe(false)
  expect(desktopAllows(req('verx_desktop=otro'), token)).toBe(false)
  expect(desktopAllows(req(`a=1; verx_desktop=${token}`), token)).toBe(true)
})

test('ventana: Edge en modo app con perfil propio en Windows; navegador por defecto si no hay', () => {
  const url = 'http://127.0.0.1:1234/x'
  const win = windowCommand({ platform: 'win32', url, profile: 'C:\\perfil', exists: (p) => p.includes('Program Files (x86)') })
  expect(win.windowed).toBe(true)
  expect(win.cmd.slice(1, 3)).toEqual([`--app=${url}`, '--user-data-dir=C:\\perfil'])
  expect(windowCommand({ platform: 'win32', url, profile: 'x', exists: () => false }).windowed).toBe(false)
  expect(windowCommand({ platform: 'darwin', url }).cmd).toEqual(['open', url])
  expect(windowCommand({ platform: 'linux', url }).cmd).toEqual(['xdg-open', url])
})

test('ventana nativa (verx-desktop) antes que Edge: URL, perfil, título y tamaño', () => {
  const url = 'http://127.0.0.1:1234/x'
  const win = windowCommand({ platform: 'win32', url, profile: 'C:/perfil', native: 'C:/verx-desktop.exe', title: 'Grafo', width: 900, height: 600 })
  expect(win).toEqual({ windowed: true, native: true, cmd: ['C:/verx-desktop.exe', '--url', url, '--profile', 'C:/perfil', '--title', 'Grafo', '--width', '900', '--height', '600'] })
})

test('el ejecutable nativo: en crates/target/release, sólo en Windows y Linux, y sólo si existe', () => {
  const all = () => true
  const posix = (p) => p.split('\\').join('/')
  expect(posix(nativeBinary('/repo', { platform: 'win32', exists: all }))).toBe('/repo/crates/target/release/verx-desktop.exe')
  expect(posix(nativeBinary('/repo', { platform: 'linux', exists: all }))).toBe('/repo/crates/target/release/verx-desktop')
  expect(nativeBinary('/repo', { platform: 'darwin', exists: all })).toBe(null)
  expect(nativeBinary('/repo', { platform: 'win32', exists: () => false })).toBe(null)
})

test('cada app tiene su propio perfil, separado del navegador del usuario', () => {
  expect(profileDir('C:/proyectos/web', { LOCALAPPDATA: 'C:/Datos' }).replaceAll('\\', '/')).toBe('C:/Datos/verx-desktop/web')
  expect(newToken()).not.toBe(newToken())
  expect(newToken().length).toBeGreaterThanOrEqual(32)
})
