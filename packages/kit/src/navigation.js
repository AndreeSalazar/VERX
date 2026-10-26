// notFound() y redirect() como en Next.js: se lanzan desde una página, layout,
// generateMetadata o acción, y el framework responde con la página 404 o una
// redirección.

export class NotFoundError extends Error {
  constructor() {
    super('Not Found')
    this.status = 404
  }
}

export class RedirectError extends Error {
  constructor(location, status) {
    super(`Redirect to ${location}`)
    this.location = location
    this.status = status
  }
}

export function notFound() {
  throw new NotFoundError()
}

// 303 por defecto: lo correcto tras un POST (el navegador hace GET al destino).
export function redirect(location, status = 303) {
  throw new RedirectError(location, status)
}

// Instancia activa, para que asset() funcione desde cualquier componente.
let current = null
export const setCurrent = (kit) => (current = kit)
export const currentKit = () => current

// URL con huella de un archivo de public/ ('/styles.css' → '/styles.3f9a2c1b4e.css').
export function asset(path) {
  return current?.app.asset(path) ?? path
}

// ¿Esta app se está ejecutando como escritorio (verx desktop)? Sirve para mostrar
// funciones que usan los recursos del sistema sólo donde existen.
export const isDesktop = () => Boolean(current?.desktop)
