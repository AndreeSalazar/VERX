import { notFound } from '@verx/kit'
import { raw } from '@verx/ui'
import CodeCopy from '../../../components/CodeCopy.jsx'
import { posts, findPost } from '../../../lib/posts.js'

export const generateStaticParams = () => posts.map((p) => ({ slug: p.slug }))

export function generateMetadata({ params }) {
  const post = findPost(params.slug)
  return post ? { title: post.title, description: post.summary, openGraph: { type: 'article' } } : { title: 'No encontrado' }
}

// Los slugs conocidos están prerenderizados; uno desconocido llega aquí
// bajo demanda (SSR) y responde 404 con notFound(). El cuerpo sale de
// content/blog/*.md, convertido por verx-md.
export default function Post({ params }) {
  const post = findPost(params.slug)
  if (!post) notFound()
  return (
    <article class="prose">
      <p class="eyebrow">
        <time datetime={post.date}>{new Date(post.date).toLocaleDateString('es', { dateStyle: 'long' })}</time>
        {post.tags.map((t) => ` · #${t}`)} · {post.minutes} min de lectura
      </p>
      <h1>{post.title}</h1>
      <p class="lead">{post.summary}</p>
      {raw(post.body)}
      <p>
        <a href="/blog">← Todos los artículos</a>
      </p>
      <CodeCopy client:idle />
    </article>
  )
}
