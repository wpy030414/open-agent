import type { Context, Next } from 'hono'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './config.js'

const secret = new TextEncoder().encode(env.ADMIN_KEY || 'fallback-secret')

export async function signAdminToken(): Promise<{ token: string; expires_at: number }> {
  const expires_at = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24h
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret)
  return { token, expires_at }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

export function verifyAdminKey(key: string): boolean {
  return key === env.ADMIN_KEY && key !== ''
}

export async function adminAuthMiddleware(c: Context, next: Next) {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = auth.slice(7)
  if (!(await verifyAdminToken(token))) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  await next()
}
