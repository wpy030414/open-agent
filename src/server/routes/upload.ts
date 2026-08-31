import { Hono } from 'hono'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

export const uploadRoute = new Hono()

const UPLOAD_DIR = path.resolve('uploads')
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Guess mime type from extension
function guessMime(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.log': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

// Serve a file from the uploads directory with proper headers
function serveFile(c: any, filename: string) {
  const safe = path.basename(filename)
  const filepath = path.join(UPLOAD_DIR, safe)

  if (!fs.existsSync(filepath)) {
    return c.text('Not found', 404)
  }

  const ext = path.extname(safe)
  const mime = guessMime(ext)
  const downloadName = c.req.query('name') || safe
  const encodedName = encodeURIComponent(downloadName)
  const buffer = fs.readFileSync(filepath)

  return new Response(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

// Upload file
uploadRoute.post('/', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file provided' }, 400)
    }

    if (file.size > MAX_SIZE) {
      return c.json({ error: 'File too large (max 20MB)' }, 400)
    }

    const ext = path.extname(file.name || '').toLowerCase()
    const id = randomUUID()
    const filename = `${id}${ext}`
    const filepath = path.join(UPLOAD_DIR, filename)

    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)

    const url = `/api/upload/file/${filename}`
    return c.json({
      url,
      name: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (err: any) {
    console.error('Upload failed:', err)
    return c.json({ error: err.message || 'Upload failed' }, 500)
  }
})

// Download file via API endpoint
uploadRoute.get('/file/:filename', async (c) => {
  return serveFile(c, c.req.param('filename'))
})
