# Copiar al portapapeles (navigator.clipboard)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 66 |
| Safari | desde 13.1 |
| Firefox | desde 63 |

**Sin ella:** el botón de copiar no hace nada (y sólo funciona en HTTPS o localhost).

Hay que **protegerla**: en CSS, dentro de un `@supports` que la nombre; en JS, comprobando antes si existe. Si falta en un navegador objetivo y no va protegida, la regla `navegadores` del guardián bloquea.

**Sin respaldo.**

Se detecta en el código por: `navigator.clipboard`. Cuenta como protegida si el archivo tiene: `navigator.clipboard?.`, `'clipboard' in navigator`.
