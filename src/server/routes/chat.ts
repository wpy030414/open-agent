import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db.js'
import { conversations, messages } from '../schema.js'
import { eq } from 'drizzle-orm'
import { runChatLoop } from '../ai/loop.js'
import type { ChatMessage } from '../ai/provider.js'
import type { ServerMessage } from '../../shared/types.js'
import { randomUUID } from 'crypto'

export const chatRoute = new Hono()

chatRoute.get('/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() })
})

/**
 * POST /api/chat — SSE streaming chat endpoint.
 * Standard HTTP, no WebSocket needed. Works through any proxy.
 */
chatRoute.post('/', async (c) => {
  const userId = c.req.header('x-user') || ''
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json<{ message: string; conversation_id?: string; _retry?: boolean }>()
  const { message, conversation_id, _retry } = body

  if (!message?.trim()) {
    return c.json({ error: 'Empty message' }, 400)
  }

  return streamSSE(c, async (stream) => {
    let aborted = false
    const send = (msg: ServerMessage) => {
      if (aborted) return
      try {
        stream.writeSSE({ data: JSON.stringify(msg), event: 'message' })
      } catch {
        aborted = true
        const isTerminal = msg.type === 'done' || msg.type === 'error'
        if (isTerminal) {
          console.warn('Failed to send terminal event to client:', msg.type, '- stream already closed')
        }
      }
    }

    // Keepalive — prevent proxies/browsers from closing idle SSE
    const keepalive = setInterval(() => {
      if (aborted) { clearInterval(keepalive); return }
      try {
        stream.write(':\n\n')
      } catch {
        aborted = true
        clearInterval(keepalive)
      }
    }, 15_000)

    try {
      // --- Create or get conversation ---
      let convId = conversation_id
      if (!convId) {
        convId = randomUUID()
        const now = Math.floor(Date.now() / 1000)
        const title = message.slice(0, 40) || 'New Chat'
        await db.insert(conversations).values({ id: convId, user_id: userId, title, created_at: now, updated_at: now }).run()
      } else {
        // Verify conversation belongs to user
        const conv = await db.select().from(conversations).where(eq(conversations.id, convId)).get()
        if (!conv || conv.user_id !== userId) {
          send({ type: 'error', message: 'Conversation not found or access denied' })
          return
        }
      }

      // --- Save user message (skip on retry to avoid duplicates) ---
      const now = Math.floor(Date.now() / 1000)
      if (!_retry) {
        await db.insert(messages).values({
          conversation_id: convId,
          role: 'user',
          content: message,
          created_at: now,
        }).run()
      }
      await db.update(conversations).set({ updated_at: now }).where(eq(conversations.id, convId)).run()

      // --- Load history (excluding current message) ---
      const historyMsgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversation_id, convId))
        .orderBy(messages.created_at)
        .all()

      const history: ChatMessage[] = historyMsgs
        .slice(0, -1) // remove current user message
        .map((m) => ({
          role: m.role as ChatMessage['role'],
          content: m.content,
          tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
          tool_call_id: m.tool_call_id || undefined,
        }))

      // --- Tell client the conversation ID ---
      send({ type: 'conversation_id', id: convId })

      // --- Run AI loop ---
      const { reply, suggestions, thinking } = await runChatLoop(message, history, send)

      // --- Save assistant message ---
      if (reply) {
        const replyNow = Math.floor(Date.now() / 1000)
        await db.insert(messages).values({
          conversation_id: convId,
          role: 'assistant',
          content: reply,
          thinking: thinking || null,
          suggestions: suggestions.length > 0 ? JSON.stringify(suggestions) : null,
          created_at: replyNow,
        }).run()
      }
    } catch (err) {
      // Catch-all: guarantee the client always receives a terminal event
      const errMsg = err instanceof Error ? err.message : 'Internal server error'
      console.error('Chat handler error:', errMsg)
      send({ type: 'error', message: errMsg })
    } finally {
      clearInterval(keepalive)
    }
  })
})
