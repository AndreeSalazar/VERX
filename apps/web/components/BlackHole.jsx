// Agujero negro hecho sólo con CSS (cero JS): halo, disco de acreción que gira,
// anillo de luz curvada por la gravedad (la lente), horizonte de sucesos con su
// anillo de fotones, y estrellas que caen en espiral. Las capas van en este
// orden para que el disco pase por detrás del horizonte y por delante a la vez.
//
// Lo usan el fondo de todas las páginas (`cosmos`) y el héroe del inicio, donde
// se coloca en el centro de la galaxia de Rust (ver lib/galaxy-scene.js).
import BlackHoleGL from './BlackHoleGL.jsx'

export default function BlackHole({ class: extra = '' }) {
  return (
    <div class={`bh ${extra}`} aria-hidden="true">
      <span class="bh-glow" />
      <span class="bh-infall" />
      <span class="bh-infall late" />
      <span class="bh-disk back">
        <i />
      </span>
      <span class="bh-lens">
        <i />
      </span>
      <span class="bh-horizon" />
      <span class="bh-disk front">
        <i />
      </span>
    </div>
  )
}

// El fondo de todas las páginas: estrellas que titilan y el agujero negro CSS,
// que el motor WebGL (isla BlackHoleGL, cuando el navegador queda libre)
// sustituye por el trazado de rayos real.
export function Cosmos() {
  return (
    <div class="cosmos" aria-hidden="true">
      <span class="stars" />
      <span class="stars twinkle" />
      <BlackHoleGL client:idle />
      <BlackHole />
    </div>
  )
}
