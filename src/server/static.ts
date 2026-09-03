import fs from 'fs'
import path from 'path'
import type { Context, Next } from 'hono'
import { getMimeType } from 'hono/utils/mime'

const clientDist = path.resolve('dist/client')

/**
 * Serve the production client build: /assets/* from dist/client/assets,
 * everything else falls back to index.html (SPA).
 *
 * Hand-rolled instead of @hono/node-server/serve-static — that subpath
 * module hangs `tsx watch` on Windows when stdout is a pipe (e.g. under
 * concurrently). See https://github.com/privatenumber/tsx/issues/623
 */
export const serveClient = async (c: Context, next: Next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()

  let file = ''
  try {
    const rel = decodeURIComponent(c.req.path).replace(/^\/+/, '') || 'index.html'
    const candidate = path.join(clientDist, rel)
    // Path traversal guard: resolved path must stay inside clientDist
    if (candidate.startsWith(clientDist + path.sep)) file = candidate
  } catch {
    file = ''
  }

  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return c.body(fs.readFileSync(file), 200, {
      'Content-Type': getMimeType(file) ?? 'application/octet-stream',
    })
  }

  // SPA fallback
  const index = path.join(clientDist, 'index.html')
  if (fs.existsSync(index)) {
    return c.body(fs.readFileSync(index), 200, { 'Content-Type': 'text/html; charset=utf-8' })
  }

  return next()
}
