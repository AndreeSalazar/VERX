// Reactividad de grano fino (inspirada en Solid y Preact Signals), ~1 KB.
// Un signal es una función getter: count() lee y suscribe, count.set(v) escribe.
// Sin DOM virtual: cuando un signal cambia sólo se re-ejecutan los efectos que
// lo leyeron, y esos efectos tocan exactamente los nodos que dependen de él.
//
// Propiedad: los efectos creados dentro de otro efecto (o de root()) le
// pertenecen y se destruyen cuando el padre se re-ejecuta o se destruye.
// Así una lista o un condicional re-renderizado no deja efectos huérfanos.

let observer = null // cómputo que está leyendo signals ahora mismo
let owner = null // ámbito que adopta los efectos creados ahora mismo
let batchDepth = 0
const queue = new Set()

export function signal(initial) {
  let value = initial
  const subs = new Set()
  function read() {
    if (observer !== null) {
      subs.add(observer)
      observer.sources.add(subs)
    }
    return value
  }
  read.set = (next) => {
    if (Object.is(next, value)) return
    value = next
    schedule(subs)
  }
  read.update = (fn) => read.set(fn(value))
  read.peek = () => value
  return read
}

function schedule(subs) {
  for (const c of subs) queue.add(c)
  if (batchDepth === 0) flush()
}

function flush() {
  while (queue.size !== 0) {
    const pending = [...queue]
    queue.clear()
    for (const c of pending) if (!c.disposed) c.run()
  }
}

// Agrupa varias escrituras: los efectos se ejecutan una sola vez al final.
export function batch(fn) {
  batchDepth++
  try {
    return fn()
  } finally {
    if (--batchDepth === 0) flush()
  }
}

// Lee signals sin suscribirse.
export function untrack(fn) {
  const prev = observer
  observer = null
  try {
    return fn()
  } finally {
    observer = prev
  }
}

function Computation(fn) {
  this.fn = fn
  this.sources = new Set()
  this.children = []
  this.cleanups = []
  this.disposed = false
  if (owner !== null) owner.children.push(this)
}

Computation.prototype.reset = function () {
  for (const subs of this.sources) subs.delete(this)
  this.sources.clear()
  for (const child of this.children) child.dispose()
  this.children.length = 0
  for (const fn of this.cleanups) fn()
  this.cleanups.length = 0
}

Computation.prototype.run = function () {
  this.reset()
  const prevObserver = observer
  const prevOwner = owner
  observer = owner = this
  try {
    this.fn()
  } finally {
    observer = prevObserver
    owner = prevOwner
  }
}

Computation.prototype.dispose = function () {
  if (this.disposed) return
  this.disposed = true
  this.reset()
}

// Ejecuta fn ahora y cada vez que cambie algún signal que haya leído.
// Devuelve una función para destruirlo.
export function effect(fn) {
  const c = new Computation(fn)
  c.run()
  return () => c.dispose()
}

// Signal derivado de solo lectura.
export function computed(fn) {
  const s = signal(undefined)
  effect(() => s.set(fn()))
  const read = () => s()
  read.peek = s.peek
  return read
}

// Registra limpieza para el efecto actual (timers, listeners…).
export function onCleanup(fn) {
  if (owner !== null) owner.cleanups.push(fn)
}

// Para continuar más tarde (p. ej. en un microtask) dentro del mismo ámbito.
export const getOwner = () => owner

export function runWithOwner(o, fn) {
  const prev = owner
  owner = o
  try {
    return fn()
  } finally {
    owner = prev
  }
}

// Ámbito raíz: todo lo creado dentro vive hasta llamar a dispose().
export function root(fn) {
  const scope = new Computation(null)
  const prevOwner = owner
  const prevObserver = observer
  owner = scope
  observer = null
  try {
    return fn(() => scope.dispose())
  } finally {
    owner = prevOwner
    observer = prevObserver
  }
}

export const isSignal = (v) => typeof v === 'function' && typeof v.set === 'function'
