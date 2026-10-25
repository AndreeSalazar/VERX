import { posts } from '../../lib/posts.js'

export const metadata = { title: 'Blog' }

export default function Blog() {
  return (
    <>
      <h1>Blog</h1>
      <ul class="list">
        {posts.map((p) => (
          <li>
            <a href={`/blog/${p.slug}`}>{p.title}</a>
            <span>{p.summary}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
