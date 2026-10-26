// Módulos que da el programa que ejecuta el paquete, no una dependencia: no se
// instalan ni se declaran. Hoy, sólo `vscode`, para un paquete que es una
// extensión de VS Code (lo dice con `engines.vscode`). Lo usa check-architecture.js.

/** Los módulos «del anfitrión» que puede importar el paquete `pkg`. */
export function hostModules(pkg) {
  return pkg?.engines?.vscode ? ['vscode'] : []
}
