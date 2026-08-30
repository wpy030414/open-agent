import type { AppConfig } from '../../shared/types.js'
import type { ToolDefinition } from '../../shared/types.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

export interface StreamEvent {
  type: 'token' | 'thinking' | 'tool_call' | 'finish'
  text?: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  finishReason?: string
}

interface PendingToolCall {
  id: string
  index: number
  name: string
  arguments: string
}

export async function* streamChatCompletion(
  config: AppConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): AsyncGenerator<StreamEvent> {
  const url = `${config.api_endpoint.replace(/\/$/, '')}/chat/completions`

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
    max_tokens: 100000,
  }

  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      throw new Error('API request timed out after 120s')
    }
    throw err
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const pendingToolCalls = new Map<number, PendingToolCall>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return

      try {
        const json = JSON.parse(data)
        const choice = json.choices?.[0]
        if (!choice) continue

        const delta = choice.delta || {}
        const finishReason = choice.finish_reason

        // Stream text content
        if (delta.content) {
          yield { type: 'token', text: delta.content }
        }

        // Stream reasoning/thinking content
        if (delta.reasoning_content) {
          yield { type: 'thinking', text: delta.reasoning_content }
        }

        // Accumulate tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, {
                id: tc.id || '',
                index: idx,
                name: tc.function?.name || '',
                arguments: '',
              })
            }
            const pending = pendingToolCalls.get(idx)!
            if (tc.id) pending.id = tc.id
            if (tc.function?.name) pending.name = tc.function.name
            if (tc.function?.arguments) pending.arguments += tc.function.arguments
          }
        }

        // Emit finish
        if (finishReason) {
          if (pendingToolCalls.size > 0) {
            const calls = [...pendingToolCalls.values()]
              .sort((a, b) => a.index - b.index)
              .map((c) => ({ id: c.id, name: c.name, arguments: c.arguments }))
            yield { type: 'tool_call', toolCalls: calls, finishReason }
          } else {
            yield { type: 'finish', finishReason }
          }
          return
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }
}
