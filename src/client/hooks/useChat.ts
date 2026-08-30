import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api, getUser } from '../lib/api'
import type { Conversation } from '@/shared/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>
  suggestions?: string[]
  streaming?: boolean
}

const MAX_RETRIES = 3
const RETRY_BASE_MS = 2000

export function useChat() {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Load conversations on mount
  useEffect(() => {
    api.listConversations()
      .then((res) => setConversations(res.conversations))
      .catch(console.error)
  }, [])

  const refreshConversations = useCallback(() => {
    api.listConversations()
      .then((res) => setConversations(res.conversations))
      .catch(console.error)
  }, [])

  const updateLastMessage = useCallback((patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      return [...prev.slice(0, -1), { ...last, ...patch }]
    })
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setLoading(true)

    const abort = new AbortController()
    abortRef.current = abort

    let convId = activeId
    let attempt = 0
    let done = false

    while (attempt <= MAX_RETRIES && !done) {
      const isRetry = attempt > 0

      if (isRetry) {
        setReconnecting(true)
        updateLastMessage({ content: '', streaming: true })
        const delay = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), 10_000)
        await new Promise((r) => setTimeout(r, delay))
        if (abort.signal.aborted) break
      }

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User': getUser() || '' },
          body: JSON.stringify({
            message: text,
            conversation_id: convId || undefined,
            _retry: isRetry,
          }),
          signal: abort.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        // Parse SSE stream with idle timeout
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let receivedDone = false
        const IDLE_TIMEOUT = 60_000
        let idleTimer: ReturnType<typeof setTimeout> | null = null

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => abort.abort(), IDLE_TIMEOUT)
        }
        resetIdleTimer()

        try {
          while (true) {
            const { done: streamDone, value } = await reader.read()
            if (streamDone) break

            resetIdleTimer()
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (!data || data === '[DONE]') continue

              try {
                const msg = JSON.parse(data)
                if (msg.type === 'conversation_id') convId = msg.id
                if (msg.type === 'done' || msg.type === 'error') receivedDone = true
                handleSSEEvent(msg)
              } catch {
                // skip malformed lines
              }
            }
          }

          // Stream ended — check if we got a proper completion
          if (!receivedDone) {
            // Stream closed prematurely without done/error event — treat as failure, retry
            throw new Error('Stream ended without response')
          }
          done = true
        } finally {
          if (idleTimer) clearTimeout(idleTimer)
        }
      } catch (err) {
        const isAbort = (err as Error).name === 'AbortError'
        const isUserCancel = isAbort && attempt === 0 && abortRef.current !== abort

        if (isUserCancel) {
          // User explicitly cancelled
          updateLastMessage({ streaming: false })
          done = true
        } else if (isAbort) {
          // Idle timeout or connection drop — retry
          if (attempt >= MAX_RETRIES) {
            updateLastMessage({ content: t('chat.errorMessage', { message: t('chat.connectionTimeout') }), streaming: false })
            done = true
          }
          // else: loop continues
        } else if (attempt >= MAX_RETRIES) {
          console.error('Chat error:', err)
          updateLastMessage({ content: t('chat.errorMessage', { message: (err as Error).message }), streaming: false })
          done = true
        }
        // Non-fatal network error — retry
      }

      attempt++
    }

    setReconnecting(false)
    setLoading(false)
    abortRef.current = null
    refreshConversations()
    // Safety net: ensure streaming is cleared
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant' || !last.streaming) return prev
      return [...prev.slice(0, -1), { ...last, streaming: false }]
    })
  }, [activeId, loading, updateLastMessage, refreshConversations, t])

  function handleSSEEvent(msg: any) {
    switch (msg.type) {
      case 'conversation_id':
        setActiveId(msg.id)
        break

      case 'token':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [...prev.slice(0, -1), { ...last, content: last.content + msg.text }]
        })
        break

      case 'thinking':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [...prev.slice(0, -1), { ...last, thinking: (last.thinking || '') + msg.text }]
        })
        break

      case 'tool_call':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [...prev.slice(0, -1), {
            ...last,
            toolCalls: [...(last.toolCalls || []), { name: msg.name, input: msg.input }],
          }]
        })
        break

      case 'tool_result':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || !last.toolCalls?.length) return prev
          const calls = [...last.toolCalls]
          calls[calls.length - 1] = { ...calls[calls.length - 1], result: msg.summary }
          return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
        })
        break

      case 'done':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [...prev.slice(0, -1), {
            ...last,
            content: msg.reply || last.content,
            suggestions: msg.suggestions,
            streaming: false,
          }]
        })
        break

      case 'error':
        console.error('Server error:', msg.message)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [...prev.slice(0, -1), { ...last, content: t('chat.errorMessage', { message: msg.message }), streaming: false }]
        })
        break
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }, [])

  const callPlugin = useCallback(async (plugin: string, tool: string, input: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/plugins/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin, tool, input }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        const errorMsg = data.error || t('chat.pluginCallFailed')
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant' as const,
            content: `❌ ${t('chat.errorMessage', { message: errorMsg })}`,
            created_at: new Date().toISOString(),
          },
        ])
        return
      }

      // Display the result as an assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant' as const,
          content: `**${t('chat.pluginResult')} (${plugin}.${tool})**\n\n\`\`\`json\n${JSON.stringify(data.result, null, 2)}\n\`\`\``,
          created_at: new Date().toISOString(),
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant' as const,
          content: `❌ ${t('chat.errorMessage', { message: err instanceof Error ? err.message : t('chat.unknownError') })}`,
          created_at: new Date().toISOString(),
        },
      ])
    }
  }, [])

  const selectConversation = useCallback(async (id: string) => {
    try {
      const res = await api.getConversation(id)
      setActiveId(id)
      setMessages(
        res.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          thinking: m.thinking || undefined,
          toolCalls: m.tool_calls ? JSON.parse(m.tool_calls as any) : undefined,
          suggestions: m.suggestions ? JSON.parse(m.suggestions as any) : undefined,
        }))
      )
    } catch (err) {
      console.error('Failed to load conversation:', err)
    }
  }, [])

  const createConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
  }, [])

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }, [activeId])

  return {
    conversations,
    activeId,
    messages,
    loading,
    sendMessage,
    selectConversation,
    createConversation,
    deleteConversation,
    refreshConversations,
    cancel,
    callPlugin,
  }
}
