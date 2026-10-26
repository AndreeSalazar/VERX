'use client'
import { onMount } from '@verx/ui'

// El Markdown llega como HTML del servidor, sin islas dentro: esta única isla
// añade el botón «Copiar» a todos sus bloques de código cuando el navegador
// queda libre. Sin JavaScript, el código se sigue pudiendo seleccionar.
export default function CodeCopy() {
  onMount(() => {
    for (const figure of document.querySelectorAll('.prose figure.code')) {
      if (figure.querySelector('.copy')) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'copy'
      button.textContent = 'Copiar'
      button.addEventListener('click', async () => {
        await navigator.clipboard.writeText(figure.querySelector('code').textContent)
        button.textContent = 'Copiado'
        setTimeout(() => (button.textContent = 'Copiar'), 1500)
      })
      figure.append(button)
    }
  })
  return <></>
}
