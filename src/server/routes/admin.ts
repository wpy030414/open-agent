import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { adminAuthMiddleware, signAdminToken, verifyAdminKey } from '../auth.js'
import { getConfig, updateConfig } from '../config.js'
import { db } from '../db.js'
import { conversations, messages } from '../schema.js'
import { pluginRegistry } from '../plugins/registry.js'
import { skillRegistry } from '../skills/loader.js'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'

export const adminRoute = new Hono()

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50MB

// Auth — verify admin key, return JWT
adminRoute.post('/auth', async (c) => {
  const body = await c.req.json<{ key: string }>()
  if (!verifyAdminKey(body.key)) {
    return c.json({ error: 'Invalid key' }, 401)
  }
  const result = await signAdminToken()
  return c.json(result)
})

// Protected routes below
adminRoute.use('/config', adminAuthMiddleware)
adminRoute.use('/plugins/*', adminAuthMiddleware)
adminRoute.use('/skills/*', adminAuthMiddleware)
// '/stats' alone does NOT match sub-paths (e.g. /stats/conversations) in Hono —
// mount both the exact and wildcard forms so every stats endpoint is protected.
adminRoute.use('/stats', adminAuthMiddleware)
adminRoute.use('/stats/*', adminAuthMiddleware)

// Get current config
adminRoute.get('/config', async (c) => {
  const config = await getConfig()
  return c.json(config)
})

// Update config
adminRoute.put('/config', async (c) => {
  const body = await c.req.json()
  const config = await updateConfig(body)
  return c.json(config)
})

// Statistics: overall counts
adminRoute.get('/stats', async (c) => {
  const [userCount] = await db
    .select({ value: sql<number>`count(distinct ${conversations.user_id})` })
    .from(conversations)
    .all()

  const [convCount] = await db
    .select({ value: sql<number>`count(*)` })
    .from(conversations)
    .all()

  const [msgCount] = await db
    .select({ value: sql<number>`count(*)` })
    .from(messages)
    .all()

  return c.json({
    total_users: userCount?.value ?? 0,
    total_conversations: convCount?.value ?? 0,
    total_messages: msgCount?.value ?? 0,
  })
})

// Statistics: all conversations with user info and message counts
adminRoute.get('/stats/conversations', async (c) => {
  const rows = await db
    .select({
      id: conversations.id,
      user_id: conversations.user_id,
      title: conversations.title,
      created_at: conversations.created_at,
      updated_at: conversations.updated_at,
      message_count: sql<number>`count(${messages.id})`,
    })
    .from(conversations)
    .leftJoin(messages, sql`${messages.conversation_id} = ${conversations.id}`)
    .groupBy(conversations.id)
    .orderBy(sql`${conversations.updated_at} desc`)
    .all()

  return c.json({ conversations: rows })
})

// Statistics: get messages for a specific conversation
adminRoute.get('/stats/conversations/:id/messages', async (c) => {
  const id = c.req.param('id')

  const conv = await db
    .select()
    .from(conversations)
    .where(sql`${conversations.id} = ${id}`)
    .get()

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(sql`${messages.conversation_id} = ${id}`)
    .orderBy(sql`${messages.created_at} asc`)
    .all()

  return c.json({
    conversation: conv,
    messages: msgs.map((m) => ({
      ...m,
      tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : null,
      suggestions: m.suggestions ? JSON.parse(m.suggestions) : null,
      attachments: m.attachments ? JSON.parse(m.attachments) : null,
    })),
  })
})

// List plugins
adminRoute.get('/plugins', (c) => {
  return c.json({ plugins: pluginRegistry.getAll() })
})

// Upload plugin from zip
adminRoute.post('/plugins/upload', async (c) => {
  const tmpDir = path.resolve('plugins', `__upload_tmp_${Date.now()}`)
  try {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file provided' }, 400)
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({ error: 'File too large (max 50MB)' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = new AdmZip(buffer)

    // Zip slip protection
    for (const entry of zip.getEntries()) {
      if (entry.entryName.includes('..')) {
        return c.json({ error: 'Invalid zip: path traversal detected' }, 400)
      }
    }

    // Detect wrapper directory
    const { wrapperDir } = resolveZipRoot(zip)

    // Extract to temp directory
    fs.mkdirSync(tmpDir, { recursive: true })
    zip.extractAllTo(tmpDir, true)

    // Determine actual content directory
    const actualDir = wrapperDir ? path.join(tmpDir, wrapperDir) : tmpDir

    // Clean up macOS artifacts
    cleanMacOSArtifacts(actualDir)

    // Validate plugin.json exists
    const manifestPath = path.join(actualDir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) {
      return c.json({ error: 'No valid plugin.json found in archive' }, 400)
    }

    // Validate manifest
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    if (!manifest.name || !manifest.tools) {
      return c.json({ error: 'Invalid plugin.json: name and tools are required' }, 400)
    }

    // Move to final destination
    const destDir = path.resolve('plugins', manifest.name)
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true })
    }
    fs.renameSync(actualDir, destDir)

    // Clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }

    pluginRegistry.refresh()
    return c.json({ success: true, plugins: pluginRegistry.getAll() })
  } catch (err: any) {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
    console.error('Plugin upload failed:', err)
    return c.json({ error: err.message || 'Upload failed' }, 500)
  }
})

// Install plugin (from directory name or path)
adminRoute.post('/plugins/install', async (c) => {
  const body = await c.req.json<{ name: string }>()
  const pluginDir = path.resolve('plugins', body.name)

  if (!fs.existsSync(path.join(pluginDir, 'plugin.json'))) {
    return c.json({ error: `Plugin "${body.name}" not found or missing plugin.json` }, 404)
  }

  pluginRegistry.refresh()
  return c.json({ success: true, plugins: pluginRegistry.getAll() })
})

// Uninstall plugin
adminRoute.delete('/plugins/:name', (c) => {
  const name = c.req.param('name')
  const pluginDir = path.resolve('plugins', name)

  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true })
  }

  pluginRegistry.refresh()
  return c.json({ success: true, plugins: pluginRegistry.getAll() })
})

// List skills
adminRoute.get('/skills', (c) => {
  return c.json({ skills: skillRegistry.getAll() })
})

// Upload skill from zip
adminRoute.post('/skills/upload', async (c) => {
  const tmpDir = path.resolve('skills', `__upload_tmp_${Date.now()}`)
  try {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file provided' }, 400)
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({ error: 'File too large (max 50MB)' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = new AdmZip(buffer)

    // Zip slip protection
    for (const entry of zip.getEntries()) {
      if (entry.entryName.includes('..')) {
        return c.json({ error: 'Invalid zip: path traversal detected' }, 400)
      }
    }

    // Detect wrapper directory
    const { wrapperDir } = resolveZipRoot(zip)

    // Extract to temp directory
    fs.mkdirSync(tmpDir, { recursive: true })
    zip.extractAllTo(tmpDir, true)

    // Determine actual content directory
    const actualDir = wrapperDir ? path.join(tmpDir, wrapperDir) : tmpDir

    // Clean up macOS artifacts
    cleanMacOSArtifacts(actualDir)

    // Validate SKILL.md exists
    const skillPath = path.join(actualDir, 'SKILL.md')
    if (!fs.existsSync(skillPath)) {
      return c.json({ error: 'No valid SKILL.md found in archive' }, 400)
    }

    // Parse frontmatter to get skill name
    const raw = fs.readFileSync(skillPath, 'utf-8')
    const match = raw.match(/^---\n([\s\S]*?)\n---\n/)
    if (!match) {
      return c.json({ error: 'Invalid SKILL.md: missing frontmatter' }, 400)
    }

    const yamlStr = match[1]
    let skillName = ''
    for (const line of yamlStr.split('\n')) {
      const m = line.match(/^name:\s*(.+)$/)
      if (m) {
        skillName = m[1].replace(/^['"]|['"]$/g, '')
        break
      }
    }

    if (!skillName) {
      return c.json({ error: 'Invalid SKILL.md: name is required in frontmatter' }, 400)
    }

    // Move to final destination
    const destDir = path.resolve('skills', skillName)
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true })
    }
    fs.renameSync(actualDir, destDir)

    // Clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }

    skillRegistry.refresh()
    return c.json({ success: true, skills: skillRegistry.getAll() })
  } catch (err: any) {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
    console.error('Skill upload failed:', err)
    return c.json({ error: err.message || 'Upload failed' }, 500)
  }
})

// Install skill
adminRoute.post('/skills/install', async (c) => {
  const body = await c.req.json<{ name: string }>()
  const skillDir = path.resolve('skills', body.name)

  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    return c.json({ error: `Skill "${body.name}" not found or missing SKILL.md` }, 404)
  }

  skillRegistry.refresh()
  return c.json({ success: true, skills: skillRegistry.getAll() })
})

// Uninstall skill
adminRoute.delete('/skills/:name', (c) => {
  const name = c.req.param('name')
  const skillDir = path.resolve('skills', name)

  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true })
  }

  skillRegistry.refresh()
  return c.json({ success: true, skills: skillRegistry.getAll() })
})

// --- Helpers ---

/** Determine if a zip has a single wrapper directory */
function resolveZipRoot(zip: AdmZip): { wrapperDir: string | null } {
  const entries = zip.getEntries().filter(
    (e) => !e.entryName.startsWith('__MACOSX') && !e.entryName.endsWith('.DS_Store')
  )
  if (entries.length === 0) return { wrapperDir: null }

  const topDirs = new Set<string>()
  let hasRootFile = false

  for (const entry of entries) {
    const parts = entry.entryName.split('/')
    if (parts.length <= 1) {
      hasRootFile = true
      break
    }
    topDirs.add(parts[0])
  }

  if (hasRootFile || topDirs.size !== 1) return { wrapperDir: null }
  return { wrapperDir: [...topDirs][0] }
}

/** Remove __MACOSX directories and .DS_Store files */
function cleanMacOSArtifacts(dir: string): void {
  const macosDir = path.join(dir, '__MACOSX')
  if (fs.existsSync(macosDir)) {
    fs.rmSync(macosDir, { recursive: true })
  }

  function removeDSStore(d: string) {
    const dsStore = path.join(d, '.DS_Store')
    if (fs.existsSync(dsStore)) fs.unlinkSync(dsStore)
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) removeDSStore(path.join(d, entry.name))
    }
  }
  removeDSStore(dir)
}
