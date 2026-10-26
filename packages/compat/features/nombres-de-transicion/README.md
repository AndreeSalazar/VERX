# Elementos que viajan entre páginas (view-transition-name)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 111 |
| Safari | desde 18 |
| Firefox | desde 144 |

**Sin ella:** la cabecera y el fondo no viajan entre páginas: cambian de golpe.

Si falta, **se pierde un detalle sin romper nada**: el guardián no bloquea, lo informa, y VERX Grafo lo enseña en ámbar.

**Sin respaldo.**

Se detecta en el código por: `view-transition-name`.
