// Imágenes como en next/image, pero sin una línea de JS en el navegador:
//
//   <Image src="/portadas/x.png" alt="…" sizes="(min-width: 900px) 720px, 100vw" />
//
// · verx-img (Rust → WASM) genera, UNA vez por imagen, las variantes de cada
//   ancho (reducidas en luz lineal), la miniatura del placeholder y el color medio.
// · Se sirven desde /_verx/img/ con huella y caché de un año, y `verx build`
//   las exporta como archivos.
// · El <img> lleva srcset, width y height (sin saltos de diseño) y, de fondo, el
//   placeholder desenfocado: mientras llega la imagen se ve algo, sin JS.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, extname, join, resolve, sep } from 'node:path'
import { createImages } from '@verx/img'
import { escape, raw } from '@verx/ui/server'
import { currentKit as current } from './navigation.js'

export const IMAGE_PREFIX = '/_verx/img/'
export const DEFAULT_WIDTHS = [480, 800, 1200, 1600]

// Placeholder: la miniatura en un SVG con desenfoque gaussiano (como next/image).
// El canal alfa se fuerza a 1 para que el desenfoque no aclare los bordes.
function blurred(thumb) {
  const png = Buffer.from(thumb.bytes).toString('base64')
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${thumb.width} ${thumb.height}' preserveAspectRatio='none'>` +
    `<filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1'/>` +
    `<feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter>` +
    `<image filter='url(#b)' x='0' y='0' width='100%' height='100%' preserveAspectRatio='none' href='data:image/png;base64,${png}'/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// Almacén de imágenes de una app: lee de `publicDir` y guarda las variantes en memoria.
export async function createImageStore(publicDir) {
  const engine = await createImages()
  const cache = new Map()
  const files = new Map() // URL → PNG

  function get(src, { widths = DEFAULT_WIDTHS } = {}) {
    if (!publicDir) throw new Error(`[verx] image("${src}"): la app no tiene carpeta public/`)
    const key = `${src}|${widths.join(',')}`
    if (cache.has(key)) return cache.get(key)
    const file = resolve(join(publicDir, decodeURIComponent(src)))
    if (!file.startsWith(resolve(publicDir) + sep)) throw new Error(`[verx] image("${src}"): fuera de public/`)
    if (extname(file).toLowerCase() !== '.png') throw new Error(`[verx] image("${src}"): por ahora sólo PNG`)
    const png = readFileSync(file)
    const out = engine.process(png, { widths, placeholder: 20 })
    const hash = createHash('sha256').update(png).digest('hex').slice(0, 10)
    const name = basename(file, extname(file))
    const variants = out.variants.map((v) => {
      const url = `${IMAGE_PREFIX}${name}-${v.width}.${hash}.png`
      files.set(url, v.bytes)
      return { url, width: v.width, height: v.height, bytes: v.bytes.length }
    })
    const largest = variants.at(-1)
    const info = {
      src: largest.url,
      srcset: variants.map((v) => `${v.url} ${v.width}w`).join(', '),
      width: out.width,
      height: out.height,
      color: out.color,
      // Con transparencia, el placeholder asomaría por detrás: sólo el color… y ni eso.
      placeholder: out.alpha ? null : blurred(out.placeholder),
      variants,
    }
    cache.set(key, info)
    return info
  }

  return { get, files }
}

// Datos de una imagen de public/ (variantes, srcset, placeholder, color). Sólo servidor.
export function image(src, options) {
  const kit = current()
  if (!kit?.images) throw new Error('[verx] image() sólo funciona dentro de una app de VERX')
  return kit.images.get(src, options)
}

// <Image>: un <img> listo, con srcset, tamaño y placeholder. `alt` es obligatorio
// (usa alt="" si la imagen es decorativa). `priority` para la imagen principal
// de la página: se carga ya y con prioridad alta, en vez de en diferido.
export function Image({ src, alt, sizes = '100vw', widths, priority = false, class: className }) {
  if (typeof alt !== 'string') throw new Error(`[verx] <Image src="${src}">: falta alt (usa alt="" si es decorativa)`)
  const img = image(src, { widths })
  const background = img.placeholder ? `background:${img.color} url(&quot;${escape(img.placeholder)}&quot;) center/cover no-repeat` : ''
  const attrs = [
    `src="${img.src}"`,
    `srcset="${img.srcset}"`,
    `sizes="${escape(sizes)}"`,
    `width="${img.width}"`,
    `height="${img.height}"`,
    `alt="${escape(alt)}"`,
    priority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"',
    'decoding="async"',
    className ? `class="${escape(className)}"` : '',
    background ? `style="${background}"` : '',
  ]
  return raw(`<img ${attrs.filter(Boolean).join(' ')}>`)
}
