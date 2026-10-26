# @verx/vscode

VERX Grafo dentro de VS Code. Mientras corre `bun run dev`:

- **El grafo en un panel**, el mismo de la ventana de VERX Grafo, que se abre solo al arrancar y cada vez que aparece un bloqueo nuevo. «Abrir en VS Code» salta al archivo y a la línea.
- **Los bloqueos del guardián en «Problemas»**, subrayados en rojo en su línea, con la regla, el motivo y cómo arreglarlo.
- **La barra de estado** dice siempre cómo va: `VERX ✔` o `VERX ✖ 2`. Si `verx dev` no está corriendo, pulsarla lo arranca.
- **En tiempo real, en los dos sentidos:** lo que guardas en VS Code se revisa al momento, y lo que arreglas en el grafo aparece en VS Code.

```bash
bun run vscode   # empaqueta la extensión y la instala con `code --install-extension`
```

Después, recarga VS Code (Ctrl+Shift+P → «Developer: Reload Window»).

| Comando | Qué hace |
|---|---|
| `VERX: abrir el grafo del proyecto` | el panel (o arranca `verx dev` si no corre) |
| `VERX: ver este archivo en el grafo` | lleva el grafo al archivo y a la línea del cursor |
| `VERX: arrancar verx dev` | `bun run dev` en una terminal |

El ajuste `verx.abrirGrafo` (por defecto activado) decide si el panel se abre solo.

## Cómo funciona

- `verx dev` deja la dirección del grafo y su token en `.verx/grafo.json`, fuera de git. La extensión lo lee cada 2 s y solo habla con `127.0.0.1`.
- Los datos llegan por el mismo SSE que usa la ventana. Dentro del webview la cookie no viaja, así que el token va en la cabecera `x-verx-token` (y en el `#hash` del iframe, que nunca sale hacia el servidor).
- El `.vsix` es un ZIP con su manifiesto, escrito por `src/vsix.js`, sin `vsce` ni ninguna otra herramienta. El manifiesto de la extensión es `extension.json`; `package.json` es el del paquete del monorepo.
- `src/core.cjs` es la parte que no depende de VS Code (SSE, diagnósticos, barra), y por eso tiene tests. `src/extension.cjs` es lo que la conecta con la API de VS Code, el único módulo que puede importar `vscode`, porque el paquete declara `engines.vscode`.
