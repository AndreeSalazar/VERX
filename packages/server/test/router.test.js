import { test, expect } from 'bun:test'
import { createRouter } from '../src/router.js'

const GET = () => {}
const table = {
  '/': { GET },
  '/users/me': { GET },
  '/users/:id': { GET },
  '/users/:id/posts/:post': { GET },
  '/files/*': { GET },
  '/a/:x': { GET },
  '/a/b': { GET },
}
const find = createRouter(table)
const which = (path) => {
  const hit = find(path)
  return hit && Object.keys(table).find((k) => table[k] === hit.methods)
}

test('exacta antes que parámetros, parámetros antes que comodín', () => {
  expect(which('/')).toBe('/')
  expect(which('/users/me')).toBe('/users/me')
  expect(which('/users/7')).toBe('/users/:id')
  expect(which('/a/b')).toBe('/a/b')
  expect(which('/a/c')).toBe('/a/:x')
  expect(which('/files/x/y.txt')).toBe('/files/*')
})

test('params decodificados; un segmento vacío o de más no encaja', () => {
  expect(find('/users/ana%20maria/posts/3').params).toEqual({ id: 'ana maria', post: '3' })
  expect(find('/users/me').params).toBe(null)
  expect(find('/users/')).toBe(null)
  expect(find('/users/7/otra')).toBe(null)
  expect(find('/nada')).toBe(null)
})
