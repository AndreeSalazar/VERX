import { Image } from '@verx/kit'

// Rejilla de artículos con portada. Componente de servidor: cero JS. La portada
// es decorativa aquí (alt=""), porque el enlace ya lleva el título; en el
// artículo sí se describe.
export default function PostCards({ posts }) {
  return (
    <ul class="posts">
      {posts.map((p) => (
        <li>
          <a class="post-card" href={`/blog/${p.slug}`}>
            {p.cover && <Image src={p.cover} alt="" widths={[480, 800]} sizes="(min-width: 900px) 340px, 100vw" />}
            <span class="post-meta">
              {p.minutes} min · #{p.tags[0]}
            </span>
            <strong>{p.title}</strong>
            <span class="post-summary">{p.summary}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
