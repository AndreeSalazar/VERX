// Resultados reales de `bun run bench` (Windows 11, 12 núcleos, 100 conexiones).
const rows = [
  ['node:http puro', 33845, 'muted'],
  ['Bun.serve puro', 53332, 'muted'],
  ['VERX · texto', 49107, 'hot'],
  ['VERX · JSON con esquema', 49150, 'hot'],
  ['VERX · página prerenderizada', 47304, 'hot'],
]
const max = Math.max(...rows.map((r) => r[1]))

export default function Bench() {
  return (
    <section class="bench reveal">
      <h2>Medido, no supuesto</h2>
      <p class="section-lead">Peticiones por segundo en un solo núcleo. VERX se queda a un 3-11 % de Bun.serve sin nada encima, que es su techo.</p>
      <ul class="bars">
        {rows.map(([label, value, tone]) => (
          <li class={tone}>
            <span class="bar-label">{label}</span>
            <span class="bar" style={{ '--w': `${((value / max) * 100).toFixed(1)}%` }} />
            <span class="bar-value">{value.toLocaleString('es')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
