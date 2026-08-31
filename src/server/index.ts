import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import path from 'path'
import fs from 'fs'

// Initialize database (side effect: creates tables)
import './db.js'

import { env } from './config.js'
import { conversationsRoute } from './routes/conversations.js'
import { adminRoute } from './routes/admin.js'
import { pluginsRoute } from './routes/plugins.js'
import { chatRoute } from './routes/chat.js'
import { uploadRoute } from './routes/upload.js'

const app = new Hono()

// Middleware — allow all origins in dev (Vite runs on 5173)
app.use('*', logger())
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// API Routes
app.route('/api/conversations', conversationsRoute)
app.route('/api/admin', adminRoute)
app.route('/api/plugins', pluginsRoute)
app.route('/api/chat', chatRoute)
app.route('/api/upload', uploadRoute)

// Static files (production build only)
const clientDist = path.resolve('dist/client')
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use('/assets/*', serveStatic({ root: clientDist }))
  app.get('*', serveStatic({ root: clientDist, path: 'index.html' }))
}

// Start server
serve({
  fetch: app.fetch,
  port: env.PORT,
  hostname: '0.0.0.0',
})

console.log(`
╔══════════════════════════════════════╗
║  智能体服务                          ║
║  端口：${String(env.PORT).padEnd(28)}║
║  管理员密钥：${env.ADMIN_KEY ? '已配置 ✓'.padEnd(20) : '未设置 ⚠️'.padEnd(18)}║
╚══════════════════════════════════════╝
`)
