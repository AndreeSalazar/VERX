# Gráficos 3D (WebGL2)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 56 |
| Safari | desde 15 |
| Firefox | desde 51 |

**Sin ella:** no hay 3D: se queda el fondo hecho con CSS.

Hay que **protegerla**: en CSS, dentro de un `@supports` que la nombre; en JS, comprobando antes si existe. Si falta en un navegador objetivo y no va protegida, la regla `navegadores` del guardián bloquea.

**Respaldo:** el agujero negro y la galaxia hechos sólo con CSS.

Se detecta en el código por: `'webgl2'`, `"webgl2"`. Cuenta como protegida si el archivo tiene: `if (!gl)`.
