import { STATUS_CODES } from 'node:http'

// Lanza un HttpError desde cualquier handler o middleware para responder con
// ese status. `expose` decide si el mensaje llega al cliente (por defecto sólo en 4xx).
export class HttpError extends Error {
  constructor(status, message = STATUS_CODES[status] ?? 'Error', expose = status < 500) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.expose = expose
  }
}
