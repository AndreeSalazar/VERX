# Esperar a que el navegador quede libre (requestIdleCallback)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 47 |
| Safari | **no la tiene** |
| Firefox | desde 55 |

**Sin ella:** sin comprobarlo, el código fallaría; el runtime de las islas usa setTimeout en su lugar.

Hay que **protegerla**: en CSS, dentro de un `@supports` que la nombre; en JS, comprobando antes si existe. Si falta en un navegador objetivo y no va protegida, la regla `navegadores` del guardián bloquea.

**Sin respaldo.**

Se detecta en el código por: `requestIdleCallback`. Cuenta como protegida si el archivo tiene: `'requestIdleCallback' in`, `"requestIdleCallback" in`, `typeof requestIdleCallback`.
