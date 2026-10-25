import { HttpError } from '@veloz/kit'
import { posts } from '../../../../lib/posts.js'
import { postSchema } from '../route.js'

export const GET = {
  response: postSchema,
  handler: (ctx) => {
    const post = posts.find((p) => p.id === Number(ctx.params.id))
    if (!post) throw new HttpError(404, 'No existe ese artículo')
    return post
  },
}
