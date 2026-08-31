import type { Context, Next } from 'hono'
import { verifyUserToken } from '../auth.js'

/**
 * User auth middleware — validates JWT from Authorization header,
 * sets `userId` in context for downstream routes.
 */
export async function userAuthMiddleware(c: Context, next: Next) {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const result = await verifyUserToken(auth.slice(7))
  if (!result) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  c.set('userId', result.username)
  await next()
}
