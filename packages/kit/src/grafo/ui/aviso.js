// VERX Grafo · el aviso dentro del sitio (sólo en `verx dev`). Pregunta a /aviso
// del grafo y, mientras el guardián bloquee algo, enseña qué, dónde y cómo
// arreglarlo, con un botón al grafo y otro a VS Code. Va en un shadow DOM:
// ni sus estilos tocan la página ni los de la página lo tocan a él.

const BASE = new URL('.', import.meta.url).href.replace(/\/$/, '')
const script = document.querySelector('script[src$="/aviso.js"]')
const host = document.createElement('verx-aviso')
const shadow = host.attachShadow({ mode: 'open' })
shadow.innerHTML = `<style>
  :host { all: initial; position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; font: 13.5px/1.5 system-ui, 'Segoe UI', sans-serif; color: #ececf4; }
  [hidden] { display: none !important; }
  .pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px; border: 0; cursor: pointer; font: inherit; color: #fff; background: rgba(40, 8, 12, 0.92); box-shadow: 0 0 0 1px rgba(255, 77, 94, 0.7), 0 0 22px rgba(255, 77, 94, 0.45); animation: glow 1.6s ease-in-out infinite; }
  .pill.ok { background: rgba(10, 30, 18, 0.92); color: #4ee38a; box-shadow: 0 0 0 1px rgba(78, 227, 138, 0.5); animation: none; }
  @keyframes glow { 50% { box-shadow: 0 0 0 1px rgba(255, 77, 94, 0.9), 0 0 34px rgba(255, 77, 94, 0.7); } }
  .card { width: min(520px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; margin-bottom: 10px; padding: 14px 16px; border-radius: 16px; background: rgba(10, 10, 18, 0.96); box-shadow: 0 0 0 1px rgba(255, 77, 94, 0.45), 0 24px 70px rgba(0, 0, 0, 0.7); backdrop-filter: blur(12px); }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .head b { flex: 1; letter-spacing: 0.04em; }
  .head b span { color: #ffd56b; }
  .x { border: 0; background: none; color: #9a9aab; cursor: pointer; font-size: 18px; line-height: 1; }
  .p { margin: 10px 0 0; padding: 10px 12px; border-radius: 12px; background: rgba(255, 77, 94, 0.08); box-shadow: inset 3px 0 0 #ff4d5e, inset 0 0 0 1px rgba(255, 77, 94, 0.25); }
  .rule { font-weight: 700; }
  .where { font: 12.5px ui-monospace, 'Cascadia Code', Consolas, monospace; color: #ffd56b; word-break: break-all; }
  pre { margin: 6px 0; max-height: 9em; overflow: auto; white-space: pre-wrap; word-break: break-word; font: 12px ui-monospace, 'Cascadia Code', Consolas, monospace; color: #ffc2c8; }
  .fix { color: #4ee38a; }
  .acts { display: flex; gap: 8px; margin-top: 8px; }
  .acts button { padding: 5px 12px; border-radius: 9px; cursor: pointer; font: inherit; font-size: 12.5px; color: #ececf4; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.18); }
  .acts button:hover { border-color: #ffd56b; }
  .more { margin-top: 8px; color: #9a9aab; font-size: 12.5px; }
</style>
<div class="card" hidden></div>
<button class="pill" hidden></button>`

const card = shadow.querySelector('.card')
const pill = shadow.querySelector('.pill')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
let state = { root: '', problems: [] }
let open = script?.hasAttribute('data-abierto') ?? false
let seen = ''
let okTimer = null

function render() {
  const list = state.problems
  const n = list.length
  pill.classList.remove('ok')
  pill.hidden = n === 0 || open
  card.hidden = n === 0 || !open
  pill.textContent = `✖ ${n} bloqueo${n === 1 ? '' : 's'} · VERX`
  const items = list.slice(0, 4).map((p, i) => `
    <div class="p">
      <div><span class="rule">${esc(p.rule)}</span> · ${esc(p.title)}</div>
      ${p.file ? `<div class="where">${esc(p.file)}${p.line ? `:${p.line}` : ''}</div>` : ''}
      <pre>${esc(p.message)}</pre>
      <div class="fix">→ ${esc(p.fix)}</div>
      <div class="acts">
        <button data-graph="${i}">Ver en el grafo</button>
        ${p.file && /\.[a-z]+$/.test(p.file) ? `<button data-code="${i}">Abrir en VS Code</button>` : ''}
      </div>
    </div>`)
  card.innerHTML = `<div class="head"><b>VERX <span>Grafo</span> · el guardián bloquea</b><button class="x" title="Minimizar">×</button></div>
    ${items.join('')}${n > 4 ? `<div class="more">y ${n - 4} más en el grafo</div>` : ''}`
}

function unblocked() {
  pill.hidden = false
  card.hidden = true
  pill.classList.add('ok')
  pill.textContent = '✔ Desbloqueado · VERX'
  clearTimeout(okTimer)
  okTimer = setTimeout(() => (pill.hidden = true), 3500)
}

shadow.addEventListener('click', (e) => {
  const t = e.target.closest('button')
  if (!t) return
  if (t === pill) open = true
  else if (t.classList.contains('x')) open = false
  else if (t.dataset.graph) {
    const p = state.problems[Number(t.dataset.graph)]
    fetch(`${BASE}/enfocar`, { method: 'POST', body: JSON.stringify({ node: p.node ?? p.file, line: p.line }) }).catch(() => {})
    return
  } else if (t.dataset.code) {
    const p = state.problems[Number(t.dataset.code)]
    const full = `${state.root.replaceAll('\\', '/')}/${p.file}`.replace(/^\/?/, '/')
    location.href = `vscode://file${encodeURI(full)}:${p.line || 1}`
    return
  }
  render()
})

// Pregunta cada poco (sin conexión abierta: las del navegador son pocas y las
// necesita el editor del grafo). Pestaña en segundo plano → más despacio.
let version = -1
async function poll() {
  try {
    const r = await fetch(`${BASE}/aviso?v=${version}`, { cache: 'no-store' })
    if (r.status === 200) apply(await r.json())
  } catch {
    // verx dev se está reiniciando: lo volverá a intentar
  }
  setTimeout(poll, document.hidden ? 5000 : 1500)
}

function apply(next) {
  version = next.version
  if (next.checking && next.problems.length === 0 && state.problems.length > 0) return // a mitad de revisión: espera
  const had = state.problems.length
  state = next
  // Bloqueos nuevos → el aviso se abre solo; si no cambian, se respeta lo que elegiste.
  const key = next.problems.map((p) => `${p.rule}|${p.file}|${p.line}`).join('\n')
  if (key && key !== seen) open = true
  seen = key
  if (had > 0 && next.problems.length === 0) unblocked()
  else render()
}

;(document.body ?? document.documentElement).appendChild(host)
poll()
