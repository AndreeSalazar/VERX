# Saber qué se ve en pantalla (IntersectionObserver)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 58 |
| Safari | desde 12.1 |
| Firefox | desde 55 |

**Sin ella:** sin comprobarlo, el código fallaría.

Hay que **protegerla**: en CSS, dentro de un `@supports` que la nombre; en JS, comprobando antes si existe. Si falta en un navegador objetivo y no va protegida, la regla `navegadores` del guardián bloquea.

**Sin respaldo.**

Se detecta en el código por: `IntersectionObserver`. Cuenta como protegida si el archivo tiene: `'IntersectionObserver' in`, `typeof IntersectionObserver`.
