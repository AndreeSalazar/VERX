import Galaxy from '../Galaxy.jsx'

const stats = [
  ['0', 'dependencias'],
  ['6 KB', 'de Rust en WASM'],
  ['~49k', 'req/s por núcleo'],
  ['0 KB', 'de JS por defecto'],
]

export default function Hero() {
  return (
    <section class="hero">
      <Galaxy seed={7} client:load />
      <div class="hero-inner">
        <p class="eyebrow">Bun · Rust · WebAssembly · WebGL2</p>
        <h1 class="hero-title">
          <span class="brand-word">VERX</span>
          <span class="hero-line">Rápido por diseño.</span>
          <span class="hero-line dim">Bonito por defecto.</span>
        </h1>
        <p class="lead">
          Un framework web que hace al arrancar lo que otros hacen en cada petición. Inspirado en Next.js, Astro y Solid, sin una sola dependencia, y con
          una galaxia de 38 000 estrellas simulada en Rust.
        </p>
        <div class="actions">
          <a class="button" href="/docs/empezar">
            Empezar
          </a>
          <a class="button ghost" href="/docs/arquitectura">
            Ver la arquitectura
          </a>
        </div>
        <dl class="hero-stats">
          {stats.map(([value, label]) => (
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p class="hint">
          <span class="mouse">Mueve el ratón sobre la galaxia ✦</span>
          <span class="touch">Toca y arrastra sobre la galaxia ✦</span>
        </p>
      </div>
    </section>
  )
}
