// VERX Grafo · la aplicación: recibe el grafo en tiempo real (SSE), lo dibuja,
// explica cada bloqueo y abre el editor. Sin dependencias ni compilación: es
// JavaScript de navegador tal cual.

import { camera, draw, layout, showLinks } from './view.js'
import { createEditor } from './editor.js'

const $ = (sel) => document.querySelector(sel)
const svg = $('#graph')
const world = $('#world')
const state = { graph: null, lay: null, byId: new Map(), problems: [], bad: new Map(), selected: null, hover: null, shape: '' }

const cam = camera(svg, world, (k) => svg.setAttribute('data-zoom', k > 2.2 ? 'near' : k > 0.9 ? 'mid' : 'far'))
const editor = createEditor({ onClose: () => render() })

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const ancestors = (id) => {
  const out = []
  for (let n = state.byId.get(id); n; n = state.byId.get(n.parent)) out.push(n.id)
  return out
}
// Bloqueos de un nodo: los suyos y los de todo lo que tiene dentro.
const problemsOf = (id) => state.problems.filter((p) => ancestors(p.node).includes(id))

function toast(text, tone = 'ok') {
  const t = document.createElement('div')
  t.className = `toast ${tone}`
  t.textContent = text
  $('#toasts').appendChild(t)
  setTimeout(() => t.remove(), 4200)
}

function status(s) {
  const pill = $('#status')
  const n = state.problems.length
  if (s.error) {
    pill.dataset.tone = 'bad'
    pill.textContent = '✖ el guardián no pudo revisar'
    pill.title = s.error
  } else if (s.checking) {
    pill.dataset.tone = 'busy'
    pill.textContent = n ? `revisando… (${n} bloqueos)` : 'revisando…'
  } else if (s.ok === null) {
    pill.dataset.tone = ''
    pill.textContent = 'sin guardián'
  } else {
    pill.dataset.tone = n ? 'bad' : 'ok'
    pill.textContent = n ? `✖ ${n} bloqueo${n === 1 ? '' : 's'}` : '✔ todo en orden'
    pill.title = s.quick ? 'Revisión rápida (sin presupuesto ni imports): pulsa «Revisar todo»' : 'Todas las reglas'
  }
}

function render() {
  const g = state.graph
  // Sólo se recoloca si cambian los nodos (no por un bloqueo nuevo): el grafo no salta.
  const shape = g.nodes.map((n) => n.id).join('|')
  if (shape !== state.shape) {
    state.shape = shape
    state.lay = layout(g)
  }
  state.bad = new Map()
  for (const p of state.problems) for (const id of ancestors(p.node)) state.bad.set(id, (state.bad.get(id) ?? 0) + 1)
  draw(world, g, state.lay, state.bad)
  for (const id of [state.selected, editor.current()]) world.querySelector(`[data-id="${CSS.escape(id ?? '')}"]`)?.classList.add('selected')
  showLinks(world, g, state.lay, state.hover ?? state.selected)
  panel()
}

function list(title, ids) {
  if (!ids.length) return ''
  const items = ids.map((id) => `<li><a href="#" data-go="${esc(id)}">${esc(id)}</a></li>`).join('')
  return `<h4>${title} <small>${ids.length}</small></h4><ul class="refs">${items}</ul>`
}

function panel() {
  const box = $('#panel')
  const id = state.selected
  const n = state.byId.get(id)
  if (!n) {
    box.innerHTML = `<p class="hint">Pulsa un nodo para ver por qué está bloqueado y editarlo aquí mismo. Rueda para acercar, arrastra para moverte.</p>${blockedList()}`
    return
  }
  const problems = problemsOf(id)
  const out = state.graph.edges.filter((e) => e.from === id).map((e) => e.to)
  const inn = state.graph.edges.filter((e) => e.to === id).map((e) => e.from)
  const kind = { file: 'archivo', folder: 'carpeta', workspace: 'espacio de trabajo', world: 'mundo', root: 'proyecto' }[n.kind]
  box.innerHTML = `
    <p class="crumb">${esc(kind)}${n.lines ? ` · ${n.lines} líneas` : ''}</p>
    <h3>${esc(n.label)}</h3>
    <p class="path">${esc(id || '(raíz)')}</p>
    ${n.kind === 'file' ? `<div class="actions"><button data-edit="${esc(id)}">Editar aquí</button></div>` : ''}
    ${problems.length ? `<h4 class="bad">Bloqueado <small>${problems.length}</small></h4>${problems.map(problemCard).join('')}` : '<p class="ok-line">✔ Nada bloqueado aquí</p>'}
    ${list(n.kind === 'file' ? 'Importa' : 'Depende de', out)}
    ${list(n.kind === 'file' ? 'Lo importan' : 'Lo usan', inn)}`
}

function problemCard(p) {
  return `<div class="problem">
    <p><b>${esc(p.rule)}</b> · ${esc(p.title)}</p>
    <p class="why">${esc(p.file)}${p.line ? `:${p.line}` : ''} — ${esc(p.message)}</p>
    <p class="fix">→ ${esc(p.fix)}</p>
    ${state.byId.get(p.node)?.kind === 'file' ? `<button data-edit="${esc(p.node)}" data-line="${p.line ?? ''}">Arreglarlo aquí</button>` : `<a href="#" data-go="${esc(p.node)}">ver ${esc(p.node || 'raíz')}</a>`}
  </div>`
}

function blockedList() {
  if (!state.problems.length) return ''
  return `<h4 class="bad">Todo lo bloqueado <small>${state.problems.length}</small></h4>${state.problems.map(problemCard).join('')}`
}

function select(id, { focus = false } = {}) {
  state.selected = id
  render()
  const p = state.lay.pos.get(id)
  if (focus && p) {
    const r = Math.max(p.r, 40)
    cam.fit({ x: p.x - r * 2, y: p.y - r * 2, w: r * 4, h: r * 4 })
  }
}

function openEditor(id, line) {
  select(id, { focus: true })
  editor.open(id, Number(line) || null, state.problems.filter((p) => p.node === id))
}

// ── Eventos ───────────────────────────────────────────────────────────────
svg.addEventListener('click', (e) => {
  if (svg.classList.contains('dragged')) return
  const id = e.target.closest('[data-id]')?.dataset.id
  select(id ?? null)
})
svg.addEventListener('dblclick', (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id
  if (state.byId.get(id)?.kind === 'file') openEditor(id)
  else cam.fit(state.lay.bounds)
})
svg.addEventListener('pointerover', (e) => {
  const id = e.target.closest('.file')?.dataset.id ?? null
  if (id === state.hover) return
  state.hover = id
  showLinks(world, state.graph, state.lay, id ?? state.selected)
  $('#tip').textContent = id ? `${id}${state.bad.get(id) ? ` · ✖ ${state.bad.get(id)}` : ''}` : ''
})
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')
  const edit = e.target.closest('[data-edit]')
  if (go) {
    e.preventDefault()
    select(go.dataset.go, { focus: true })
  } else if (edit) openEditor(edit.dataset.edit, edit.dataset.line)
})
$('#search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase()
  for (const node of world.querySelectorAll('.file')) node.classList.toggle('dim', q !== '' && !node.dataset.id.toLowerCase().includes(q))
})
$('#search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = e.target.value.trim().toLowerCase()
  const hit = state.graph.nodes.find((n) => n.kind === 'file' && n.id.toLowerCase().includes(q))
  if (hit) select(hit.id, { focus: true })
})
$('#check').addEventListener('click', () => fetch('/check', { method: 'POST' }))
$('#fit').addEventListener('click', () => cam.fit(state.lay.bounds))

// ── Tiempo real ───────────────────────────────────────────────────────────
const events = new EventSource('/events')
events.onmessage = (e) => {
  const data = JSON.parse(e.data)
  const before = new Set(state.problems.map((p) => p.node))
  const first = state.graph === null
  state.graph = data
  state.byId = new Map(data.nodes.map((n) => [n.id, n]))
  state.problems = data.problems
  if (state.selected && !state.byId.has(state.selected)) state.selected = null
  if (!data.status.checking) {
    const now = new Set(state.problems.map((p) => p.node))
    for (const id of before) if (!now.has(id)) toast(`✔ Desbloqueado: ${id || 'proyecto'}`)
    for (const id of now) if (!before.has(id) && !first) toast(`✖ Bloqueado: ${id || 'proyecto'}`, 'bad')
  }
  status(data.status)
  render()
  if (first) cam.fit(state.lay.bounds)
  const open = editor.current()
  if (open) editor.update(state.problems.filter((p) => p.node === open))
}
events.onerror = () => {
  $('#status').dataset.tone = 'bad'
  $('#status').textContent = 'sin conexión con verx dev…'
}
