// La salida real del guardián, como si fuera un terminal.
const lines = [
  ['ok', 'solo-bun', 'Bun es el único gestor de paquetes'],
  ['ok', 'cero-deps-js', 'Sin dependencias JS de terceros'],
  ['ok', 'cero-deps-rust', 'Sin crates de terceros'],
  ['ok', 'frontera-rust-js', 'El único puente es @verx/sim'],
  ['ok', 'unsafe-acotado', 'unsafe sólo en abi.rs'],
  ['ok', 'wasm-al-dia', 'sim.wasm corresponde al código Rust'],
  ['ok', 'tamano', 'Ningún archivo pasa de 400 líneas'],
  ['ok', 'imports-js', 'Fronteras comprobadas con el AST de Bun'],
  ['ok', 'presupuesto', 'Cada página ≤ 12 KB de JS + WASM'],
]

export default function Rules() {
  return (
    <section class="rules reveal">
      <div>
        <h2>Reglas que no se negocian</h2>
        <p class="section-lead">
          Un guardián en Rust revisa todo el repositorio. Bloquea commits, ediciones y hasta los comandos de Claude que rompan una regla. Así no hay que
          pelearse con nada a las 3 de la mañana.
        </p>
        <a class="button ghost" href="/docs/reglas">
          Las 13 reglas
        </a>
      </div>
      <figure class="terminal" aria-label="Salida de bun run check">
        <figcaption>
          <span />
          <span />
          <span />
          bun run check
        </figcaption>
        <pre>
          <code>
            {'verx-guard · 13 reglas\n'}
            {lines.map(([, id, text]) => (
              <span class="line">
                <b>✔</b> {id.padEnd(18)} {text}
                {'\n'}
              </span>
            ))}
            <span class="ok">{'\n✔ todo en orden'}</span>
          </code>
        </pre>
      </figure>
    </section>
  )
}
