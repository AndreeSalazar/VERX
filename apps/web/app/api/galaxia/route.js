// ws://…/api/galaxia — la galaxia multijugador: los punteros de todos los
// visitantes empujan la misma galaxia. Toda la lógica vive en lib/galaxy-room.js.
import { createRoom } from '../../../lib/galaxy-room.js'

const room = createRoom()

export const WS = {
  open: (ws) => room.join(ws),
  message: (ws, data) => room.message(ws, data),
  close: (ws) => room.leave(ws),
}
