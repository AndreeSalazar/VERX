import CopyButton from './CopyButton.jsx'

// Bloque de código renderizado en el servidor. El botón de copiar es una isla:
// sólo él carga JavaScript, y sólo cuando se ve en pantalla.
export default function Code({ children, lang = 'jsx', title }) {
  const code = String(children).trim()
  return (
    <figure class="code">
      {title && <figcaption>{title}</figcaption>}
      <pre data-lang={lang}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </figure>
  )
}
