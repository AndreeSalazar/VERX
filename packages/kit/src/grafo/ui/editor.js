// VERX Grafo · editar un archivo ahí mismo. Las líneas que bloquea el guardián
// se marcan en rojo (con el motivo al pasar por encima); al guardar (Ctrl+S),
// el servidor revisa y, si el bloqueo desaparece, el rojo se apaga solo. Si el
// archivo cambia en disco (VS Code, git…), se trae al momento sin pisar nada.

const $ = (sel, root = document) => root.querySelector(sel)

export function createEditor({ api = fetch, openInCode, onSaved, onClose }) {
  const panel = $('#editor')
  const area = $('textarea', panel)
  const gutter = $('.gutter', panel)
  const title = $('.editor-title', panel)
  const status = $('.editor-status', panel)
  let file = null // { path, hash, saved }
  let problems = []
  let saving = null // la promesa del guardado en curso
  let again = false // ¿se pidió otro guardado mientras tanto?

  const dirty = () => file !== null && area.value !== file.saved
  const say = (text, tone = '') => {
    status.textContent = text
    status.dataset.tone = tone
  }

  // Números de línea; los bloqueados, en rojo con el motivo.
  const paint = () => {
    const lines = area.value.split('\n').length
    const bad = new Map(problems.filter((p) => p.line).map((p) => [p.line, p]))
    const out = []
    for (let i = 1; i <= lines; i++) {
      const p = bad.get(i)
      out.push(p ? `<span class="bad" title="${escape(`${p.rule}: ${p.message}`)}">${i}</span>` : `<span>${i}</span>`)
    }
    gutter.innerHTML = out.join('')
    gutter.scrollTop = area.scrollTop
    title.dataset.bad = problems.length ? String(problems.length) : ''
  }
  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  const goTo = (line) => {
    const lines = area.value.split('\n')
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
    area.focus()
    area.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0))
    area.scrollTop = Math.max(0, (line - 6) * parseFloat(getComputedStyle(area).lineHeight))
    paint()
  }

  async function open(path, line, fileProblems = []) {
    if (dirty() && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return
    const r = await api(`/file?path=${encodeURIComponent(path)}`)
    const data = await r.json()
    if (!r.ok) return say(data.error ?? 'No se pudo abrir', 'bad')
    file = { path, hash: data.hash, saved: data.text }
    $('.reload', panel).hidden = true
    area.value = data.text
    title.textContent = path
    problems = fileProblems
    panel.hidden = false
    say(problems.length ? `${problems.length} bloqueo(s): arréglalo aquí y guarda con Ctrl+S` : 'Ctrl+S para guardar', problems.length ? 'bad' : '')
    paint()
    if (line) goTo(line)
  }

  // Un guardado a la vez: si se pide otro mientras tanto, se hace al acabar, con
  // el texto más reciente y la huella nueva (dos a la vez chocarían: 409).
  function save() {
    if (!file) return
    if (saving) {
      again = true
      return saving
    }
    saving = write().finally(() => {
      saving = null
      if (again) {
        again = false
        save()
      }
    })
    return saving
  }

  async function write() {
    const target = file
    const text = area.value
    say('Guardando…')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const r = await api('/file', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: target.path, text, hash: target.hash }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.status === 409) return conflict(data.error)
      if (!r.ok) return say(data.error ?? `No se pudo guardar (${r.status})`, 'bad')
      target.hash = data.hash
      target.saved = text
      say('Guardado · el guardián está revisando…', 'busy')
      onSaved?.(target.path)
    } catch {
      say('No se pudo guardar: el servidor del grafo no respondió', 'bad')
    } finally {
      clearTimeout(timer)
    }
  }

  // El archivo cambió en disco (otro editor, git…): no se pisa; se ofrece recargarlo.
  function conflict(message) {
    say(message ?? 'El archivo cambió en disco', 'bad')
    reload.hidden = false
  }

  // Llega un grafo nuevo: ¿cambió el archivo abierto en disco?
  let syncing = false
  async function sync() {
    if (!file || saving || syncing) return
    syncing = true
    try {
      const target = file
      const r = await api(`/file?path=${encodeURIComponent(target.path)}`)
      const data = await r.json()
      if (!r.ok || file !== target || data.hash === target.hash) return
      if (dirty()) return conflict('El archivo cambió en disco (¿VS Code?) y aquí tienes cambios sin guardar')
      const { selectionStart, selectionEnd, scrollTop } = area
      target.hash = data.hash
      target.saved = data.text
      area.value = data.text
      area.setSelectionRange(selectionStart, selectionEnd)
      area.scrollTop = scrollTop
      paint()
      say('↻ Actualizado desde el disco', 'ok')
    } catch {
      // sin conexión: lo intentará con el próximo grafo
    } finally {
      syncing = false
    }
  }

  function close() {
    if (dirty() && !confirm('Hay cambios sin guardar. ¿Cerrar igualmente?')) return
    panel.hidden = true
    file = null
    onClose?.()
  }

  // Llega un grafo nuevo: actualiza los bloqueos de este archivo.
  function update(fileProblems) {
    if (!file) return
    const before = problems.length
    problems = fileProblems
    paint()
    if (before > 0 && problems.length === 0) say('✔ Desbloqueado: el guardián ya no ve ningún problema', 'ok')
    else if (problems.length > 0 && !dirty()) say(`${problems.length} bloqueo(s) en este archivo`, 'bad')
  }

  area.addEventListener('input', paint)
  area.addEventListener('scroll', () => (gutter.scrollTop = area.scrollTop))
  area.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (!e.repeat) save()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end')
      paint()
    } else if (e.key === 'Escape') close()
  })
  const reload = $('.reload', panel)
  reload.addEventListener('click', () => {
    reload.hidden = true
    const path = file?.path
    file = null
    if (path) open(path, null, problems)
  })
  $('.save', panel).addEventListener('click', () => save())
  $('.code', panel).addEventListener('click', () => {
    if (!file) return
    const before = area.value.slice(0, area.selectionStart)
    openInCode?.(file.path, before.split('\n').length)
  })
  $('.close', panel).addEventListener('click', close)
  addEventListener('beforeunload', (e) => {
    if (dirty()) e.preventDefault()
  })

  return { open, update, sync, close, current: () => file?.path ?? null }
}
