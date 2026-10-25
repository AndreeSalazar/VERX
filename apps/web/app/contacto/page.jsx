// Acción de formulario: el POST llega a esta misma URL y la página se vuelve a
// renderizar con el resultado. Funciona sin JavaScript (mejora progresiva).

export const metadata = { title: 'Contacto' }

export async function action({ form }) {
  const values = {
    nombre: String(form?.nombre ?? '').trim(),
    email: String(form?.email ?? '').trim(),
    mensaje: String(form?.mensaje ?? '').trim(),
  }
  const errors = {}
  if (!values.nombre) errors.nombre = 'Dinos cómo te llamas.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) errors.email = 'Ese email no parece válido.'
  if (values.mensaje.length < 10) errors.mensaje = 'Cuéntanos un poco más (10 caracteres mínimo).'
  if (Object.keys(errors).length) return { errors, values }
  // Aquí guardarías el mensaje o lo enviarías por correo.
  return { ok: true, nombre: values.nombre }
}

export default function Contacto({ actionData }) {
  if (actionData?.ok) {
    return (
      <div class="notice">
        <h1>¡Gracias, {actionData.nombre}!</h1>
        <p>Hemos recibido tu mensaje. Esta respuesta la generó el servidor, sin JavaScript en el navegador.</p>
        <a href="/contacto">Enviar otro</a>
      </div>
    )
  }
  const errors = actionData?.errors ?? {}
  const values = actionData?.values ?? {}
  return (
    <>
      <h1>Contacto</h1>
      <p class="lead">Este formulario funciona aunque desactives JavaScript.</p>
      <form class="form" method="post" novalidate>
        <label>
          Nombre
          <input name="nombre" value={values.nombre} maxlength="80" aria-invalid={errors.nombre ? 'true' : undefined} />
          {errors.nombre && <small class="error">{errors.nombre}</small>}
        </label>
        <label>
          Email
          <input name="email" type="email" value={values.email} maxlength="120" aria-invalid={errors.email ? 'true' : undefined} />
          {errors.email && <small class="error">{errors.email}</small>}
        </label>
        <label>
          Mensaje
          <textarea name="mensaje" rows="5" maxlength="2000" aria-invalid={errors.mensaje ? 'true' : undefined}>
            {values.mensaje}
          </textarea>
          {errors.mensaje && <small class="error">{errors.mensaje}</small>}
        </label>
        <button class="button">Enviar</button>
      </form>
    </>
  )
}
