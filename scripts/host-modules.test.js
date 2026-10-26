// La excepción de la regla imports-js para los módulos del anfitrión.
import { test, expect } from 'bun:test'
import { hostModules } from './host-modules.js'

test('sólo una extensión de VS Code puede importar vscode', () => {
  expect(hostModules({ name: '@verx/vscode', engines: { vscode: '^1.90.0' } })).toEqual(['vscode'])
  expect(hostModules({ name: '@verx/kit' })).toEqual([])
  expect(hostModules({ name: '@verx/x', engines: { bun: '>=1.3' } })).toEqual([])
  expect(hostModules(undefined)).toEqual([])
})
