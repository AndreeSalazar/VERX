// API para páginas, layouts y endpoints (sólo servidor; los componentes
// 'use client' importan de @verx/ui).
export { notFound, redirect, asset, isDesktop } from './navigation.js'
export { HttpError } from '@verx/server'
export { createKit } from './kit.js'
export { exportStatic } from './export.js'
export { measureBudget, checkBudget, DEFAULT_BUDGET } from './budget.js'

// Ayuda al autocompletado en verx.config.js.
export const defineConfig = (config) => config
