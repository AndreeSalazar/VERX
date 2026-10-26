# Prerender al pasar el ratón (Speculation Rules)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 109 |
| Safari | **no la tiene** |
| Firefox | **no la tiene** |

**Sin ella:** la página siguiente no se prepara antes del clic.

Si falta, **se pierde un detalle sin romper nada**: el guardián no bloquea, lo informa, y VERX Grafo lo enseña en ámbar.

**Respaldo:** @verx/compat/prefetch: precarga la página al pasar el ratón por el enlace. Lo hace [`prefetch.js`](prefetch.js), que el kit sólo carga donde falta.

Se detecta en el código por: `speculationrules`.
