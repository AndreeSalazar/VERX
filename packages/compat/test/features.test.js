// Las fichas de compatibilidad: una carpeta por función (features/<id>/), que
// el guardián lee para su regla `navegadores`. Aquí se comprueba que todas
// estén bien formadas, para que el guardián no tenga que adivinar nada.
import { test, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dir, '..', 'features')
const folders = readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
const VERSION = /^\d+(\.\d+)?$/

test('hay una carpeta por función, cada una con su ficha y su README', () => {
  expect(folders.length).toBeGreaterThan(0)
  for (const id of folders) {
    expect(existsSync(join(DIR, id, 'feature.json'))).toBe(true)
    expect(existsSync(join(DIR, id, 'README.md'))).toBe(true)
  }
})

test('cada ficha está completa y es coherente', () => {
  for (const id of folders) {
    const f = JSON.parse(readFileSync(join(DIR, id, 'feature.json'), 'utf8'))
    const where = `features/${id}/feature.json`
    expect(f.id, where).toBe(id) // el id es el nombre de la carpeta
    expect(typeof f.title, where).toBe('string')
    expect(['css', 'js'], where).toContain(f.kind)
    expect(['proteger', 'degrada'], where).toContain(f.policy)
    expect(f.tokens.length, where).toBeGreaterThan(0)
    expect(Array.isArray(f.guards), where).toBe(true)
    expect(typeof f.sin, where).toBe('string')
    expect(Object.keys(f.since).sort(), where).toEqual(['chrome', 'firefox', 'safari'])
    for (const v of Object.values(f.since)) if (v !== null) expect(v, where).toMatch(VERSION)
    expect(Object.values(f.since).some((v) => v !== null), `${where}: no existe en ningún navegador`).toBe(true)
  }
})

test('los respaldos que exporta el paquete viven en la carpeta de su función', async () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'))
  for (const [name, path] of Object.entries(pkg.exports)) {
    const [, , feature] = path.split('/')
    expect(folders, name).toContain(feature)
    const ficha = JSON.parse(readFileSync(join(DIR, feature, 'feature.json'), 'utf8'))
    expect(ficha.respaldo, name).toContain(`@verx/compat${name.slice(1)}`)
  }
})
