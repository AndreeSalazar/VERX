# Cristal desenfocado (backdrop-filter)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 76 |
| Safari | desde 18 |
| Firefox | desde 103 |

**Sin ella:** los paneles se ven sin desenfoque detrás (Safari < 18 lo tiene con el prefijo -webkit-).

Si falta, **se pierde un detalle sin romper nada**: el guardián no bloquea, lo informa, y VERX Grafo lo enseña en ámbar.

**Sin respaldo.**

Se detecta en el código por: `backdrop-filter`. Cuenta como protegida si el archivo tiene: `-webkit-backdrop-filter`.
