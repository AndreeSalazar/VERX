import PostCards from '../../components/PostCards.jsx'
import { posts } from '../../lib/posts.js'

export const metadata = { title: 'Blog' }

export default function Blog() {
  return (
    <>
      <h1>Blog</h1>
      <p class="lead">Notas sobre cómo está hecho VERX. Las portadas las reduce verx-img, en Rust, al arrancar el servidor.</p>
      <PostCards posts={posts} />
    </>
  )
}
