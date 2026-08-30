import { Hono } from 'hono'
import { db } from '../db.js'
import { conversations, messages } from '../schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'

function getUserId(c: any): string {
  return c.req.header('x-user') || ''
}

export const conversationsRoute = new Hono()

// List user's conversations
conversationsRoute.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const list = await db.select().from(conversations).where(eq(conversations.user_id, userId)).orderBy(desc(conversations.updated_at)).all()
  return c.json({ conversations: list })
})

// Get one conversation with messages
conversationsRoute.get('/:id', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const conv = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.user_id, userId))).get()
  if (!conv) return c.json({ error: 'Not found' }, 404)

  const msgs = await db.select().from(messages).where(eq(messages.conversation_id, id)).orderBy(messages.created_at).all()

  return c.json({ conversation: conv, messages: msgs })
})

// Create a new conversation
conversationsRoute.post('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{ title?: string }>()
  const id = randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await db.insert(conversations).values({ id, user_id: userId, title: body.title || 'New Chat', created_at: now, updated_at: now }).run()

  const conv = await db.select().from(conversations).where(eq(conversations.id, id)).get()
  return c.json({ conversation: conv }, 201)
})

// Delete a conversation
conversationsRoute.delete('/:id', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.user_id, userId))).run()
  return c.json({ success: true })
})

// Rename a conversation
conversationsRoute.patch('/:id', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const body = await c.req.json<{ title: string }>()
  const now = Math.floor(Date.now() / 1000)

  await db.update(conversations).set({ title: body.title, updated_at: now }).where(and(eq(conversations.id, id), eq(conversations.user_id, userId))).run()

  const conv = await db.select().from(conversations).where(eq(conversations.id, id)).get()
  return c.json({ conversation: conv })
})
