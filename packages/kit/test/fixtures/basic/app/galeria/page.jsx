import { Image, image } from '@verx/kit'

export default function Galeria() {
  const info = image('/foto.png', { widths: [300, 600] })
  return (
    <main>
      <Image src="/foto.png" alt="Un degradado" widths={[300, 600]} sizes="600px" priority />
      <p>{info.width}×{info.height} · {info.color}</p>
    </main>
  )
}
