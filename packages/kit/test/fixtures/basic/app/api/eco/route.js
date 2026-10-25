// WebSocket declarado como en una API: app/api/eco/route.js → ws://…/api/eco
export const WS = {
  open: (ws) => ws.send('conectado'),
  message: (ws, m) => ws.send(`eco:${m}`),
}
