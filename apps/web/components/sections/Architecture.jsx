// Diagrama de los dos mundos y sus puentes. HTML + CSS: cero JS.

const rust = [
  ['verx-sim', 'galaxia → .wasm · no_std · 6 KB'],
  ['verx-search', 'buscador BM25 → .wasm · 5 KB'],
  ['verx-md', 'Markdown → HTML con resaltado'],
  ['verx-img', 'PNG y redimensionado en luz lineal'],
  ['verx-guard', 'el guardián de las reglas'],
]
const js = [
  ['@verx/server', 'HTTP sobre Bun.serve'],
  ['@verx/signals', 'reactividad de grano fino'],
  ['@verx/ui', 'JSX propio, servidor y navegador'],
  ['@verx/gl', 'motor WebGL2'],
  ['@verx/kit', 'rutas, islas, ISR, CLI'],
]
// Los únicos puentes: un paquete por crate que se compila a WebAssembly.
const bridges = [
  ['@verx/sim', 'sim.wasm · ABI v2'],
  ['@verx/search', 'search.wasm · ABI v1'],
  ['@verx/md', 'md.wasm · ABI v1'],
  ['@verx/img', 'img.wasm · ABI v1'],
]

const Box = ({ name, desc }) => (
  <li class="arch-box">
    <code>{name}</code>
    <span>{desc}</span>
  </li>
)

export default function Architecture() {
  return (
    <section class="arch">
      <h2>Dos mundos, una frontera</h2>
      <p class="section-lead">
        Rust y JavaScript no se tocan. Sólo se hablan a través de archivos .wasm con una ABI versionada, cada uno con su paquete puente, y lo vigila el guardián.
      </p>
      <div class="arch-grid">
        <div class="arch-world rust">
          <h3>crates/ · Rust</h3>
          <ul>{rust.map(([n, d]) => <Box name={n} desc={d} />)}</ul>
        </div>
        <div class="arch-bridge" aria-label="Puentes">
          <span class="bridge-line" />
          {bridges.map(([name, abi]) => (
            <>
              <code>{name}</code>
              <span class="bridge-label">{abi}</span>
            </>
          ))}
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
