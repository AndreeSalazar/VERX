// Diagrama de los dos mundos y su única frontera. HTML + CSS: cero JS.

const rust = [
  ['verx-sim', 'galaxia → .wasm · no_std · 6 KB'],
  ['verx-guard', 'el guardián de las reglas'],
]
const js = [
  ['@verx/server', 'HTTP sobre Bun.serve'],
  ['@verx/signals', 'reactividad de grano fino'],
  ['@verx/ui', 'JSX propio, servidor y navegador'],
  ['@verx/gl', 'motor WebGL2'],
  ['@verx/kit', 'rutas, islas, ISR, CLI'],
]

const Box = ({ name, desc }) => (
  <li class="arch-box">
    <code>{name}</code>
    <span>{desc}</span>
  </li>
)

export default function Architecture() {
  return (
    <section class="arch reveal">
      <h2>Dos mundos, una frontera</h2>
      <p class="section-lead">Rust y JavaScript no se tocan. El único puente es un archivo .wasm con una ABI versionada, y lo vigila el guardián.</p>
      <div class="arch-grid">
        <div class="arch-world rust">
          <h3>crates/ · Rust</h3>
          <ul>{rust.map(([n, d]) => <Box name={n} desc={d} />)}</ul>
        </div>
        <div class="arch-bridge" aria-label="Puente">
          <span class="bridge-line" />
          <code>@verx/sim</code>
          <span class="bridge-label">sim.wasm · ABI v1</span>
          <span class="bridge-line" />
        </div>
        <div class="arch-world js">
          <h3>packages/ · Bun</h3>
          <ul>{js.map(([n, d]) => <Box name={n} desc={d} />)}</ul>
        </div>
      </div>
    </section>
  )
}
