# Animaciones ligadas al scroll (animation-timeline)

| Navegador | |
|---|---|
| Chrome / Edge / Brave | desde 115 |
| Safari | desde 26 |
| Firefox | **no la tiene** |

**Sin ella:** sin protección, la animación correría una sola vez al cargar, por tiempo; dentro de @supports la página se queda quieta.

Hay que **protegerla**: en CSS, dentro de un `@supports` que la nombre; en JS, comprobando antes si existe. Si falta en un navegador objetivo y no va protegida, la regla `navegadores` del guardián bloquea.

**Respaldo:** @verx/compat/reveal: las mismas entradas y salidas con IntersectionObserver. Lo hace [`reveal.js`](reveal.js), que el kit sólo carga donde falta.

Se detecta en el código por: `animation-timeline`.
