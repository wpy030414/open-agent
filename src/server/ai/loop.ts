import type { AppConfig, ServerMessage, ToolCall } from '../../shared/types.js'
import type { ChatMessage } from './provider.js'
import { streamChatCompletion } from './provider.js'
import { getAllTools, resolveTool } from './tools.js'
import { executeTool } from '../plugins/executor.js'
import { getConfig } from '../config.js'
import { skillRegistry } from '../skills/registry.js'
import { MAX_TOOL_ROUNDS, MAX_HISTORY_MESSAGES, SUGGESTIONS_FENCE } from '../../shared/constants.js'

type SendFn = (msg: ServerMessage) => void

export async function runChatLoop(
  userMessage: string,
  history: ChatMessage[],
  send: SendFn,
  signal?: AbortSignal,
): Promise<{ reply: string; suggestions: string[]; thinking: string }> {
  const config = await getConfig()
  const tools = getAllTools()

  // Build system prompt with skill hints
  const systemPrompt = buildSystemPrompt(config)

  // Trim history
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES)

  const baseMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ]

  let toolMessages: ChatMessage[] = []
  let fullThinking = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      send({ type: 'error', message: 'Cancelled' })
      return { reply: '', suggestions: [], thinking: fullThinking }
    }

    const messages = [...baseMessages, ...toolMessages]
    let fullText = ''
    let finishReason = ''
    let pendingCalls: Array<{ id: string; name: string; arguments: string }> = []

    // Stream from the API
    try {
      for await (const event of streamChatCompletion(config, messages, tools)) {
        if (signal?.aborted) break

        switch (event.type) {
          case 'token': {
            // Suggestions fence withholding.
            // NOTE: once past the fence we must KEEP accumulating fullText
            // (but not emit), otherwise suggestions content arriving in a later
            // chunk would be dropped and parseSuggestions would see an empty block.
            const idx = fullText.indexOf(SUGGESTIONS_FENCE)
            if (idx !== -1) {
              fullText += event.text || ''
              break
            }
            // Check if new text would cross the fence
            const newText = fullText + (event.text || '')
            const fenceIdx = newText.indexOf(SUGGESTIONS_FENCE)
            if (fenceIdx !== -1) {
              // Emit only up to the fence
              const safe = newText.slice(0, fenceIdx)
              const toSend = safe.slice(fullText.length)
              if (toSend) send({ type: 'token', text: toSend })
            } else {
              // Safe margin: withhold last SUGGESTIONS_FENCE.length chars
              const combined = fullText + (event.text || '')
              if (combined.length > SUGGESTIONS_FENCE.length) {
                const safeLen = combined.length - SUGGESTIONS_FENCE.length
                const toSend = combined.slice(fullText.length, safeLen)
                if (toSend) send({ type: 'token', text: toSend })
              }
            }
            fullText += event.text || ''
            break
          }
          case 'thinking':
            fullThinking += event.text || ''
            send({ type: 'thinking', text: event.text || '' })
            break
          case 'tool_call':
            pendingCalls = event.toolCalls || []
            finishReason = event.finishReason || 'tool_calls'
            break
          case 'finish':
            finishReason = event.finishReason || 'stop'
            break
        }
      }
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      return { reply: '', suggestions: [], thinking: fullThinking }
    }

    // Tool calls → execute and loop
    if (finishReason === 'tool_calls' && pendingCalls.length > 0) {
      // Append assistant message with tool calls
      toolMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: pendingCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments },
        })),
      })

      for (const call of pendingCalls) {
        let input: Record<string, unknown>
        try {
          input = JSON.parse(call.arguments)
        } catch {
          input = {}
        }

        send({ type: 'tool_call', name: call.name, input })

        let result: unknown
        try {
          result = await executeTool(call.name, input)
          const summary = summarizeResult(result)
          send({ type: 'tool_result', name: call.name, summary })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Tool execution failed'
          result = { error: errMsg }
          send({ type: 'tool_result', name: call.name, summary: `Error: ${errMsg}` })
        }

        toolMessages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: call.id,
        })
      }

      // Reset text for next round
      fullText = ''
      continue
    }

    // Final answer — parse suggestions
    const { reply, suggestions } = parseSuggestions(fullText)
    send({ type: 'done', reply, suggestions })
    return { reply, suggestions, thinking: fullThinking }
  }

  // Max rounds exceeded
  send({ type: 'done', reply: '(Reached maximum tool call rounds)', suggestions: [] })
  return { reply: '', suggestions: [], thinking: fullThinking }
}

function buildSystemPrompt(config: AppConfig): string {
  let prompt = config.system_prompt

  // Append skill descriptions
  const skills = skillRegistry.getAll()
  if (skills.length > 0) {
    prompt += '\n\n## Available Skills\n'
    for (const skill of skills) {
      prompt += `\n### ${skill.manifest.name}\n${skill.content}\n`
    }
  }

  // Hard format requirement — appended last so it stays authoritative even
  // when the configured system prompt is a persona/roleplay that would
  // otherwise swallow formatting instructions.
  prompt += `

## 输出格式（最高优先级，不得省略）
每一条回复的【最末尾】必须输出一个 \`\`\`suggestions 代码块，里面恰好 3 个后续建议（每行一条，以 - 开头）。
这个代码块是后台数据结构，用户不可见，不会破坏你的角色氛围，但缺少它系统会判定回复无效。
建议内容必须是【用户本人会亲口打出来】的话：以用户的第一人称、口语化的口吻，像用户直接发一条消息那样，猜测用户看到这条回复后最可能追问的问题。
正确示例（用户口吻）：
\`\`\`suggestions
- 具体怎么操作？
- 再给我讲讲原理
- 有没有别的办法？
\`\`\`
反面示例（助手对用户说话的口吻，禁止）：
\`\`\`suggestions
- 你可以试试这个方案
- 要不要我帮你查一下？
\`\`\`
`

  return prompt
}

function parseSuggestions(text: string): { reply: string; suggestions: string[] } {
  const fenceIdx = text.indexOf(SUGGESTIONS_FENCE)
  if (fenceIdx === -1) {
    return { reply: text.trim(), suggestions: [] }
  }

  const reply = text.slice(0, fenceIdx).trim()
  const afterFence = text.slice(fenceIdx + SUGGESTIONS_FENCE.length)
  const closeFence = afterFence.indexOf('```')
  const block = closeFence !== -1 ? afterFence.slice(0, closeFence) : afterFence

  const suggestions = block
    .split('\n')
    .map((l) => l.replace(/^[\s-*\d.]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3)

  return { reply, suggestions }
}

function summarizeResult(result: unknown): string {
  if (result === null || result === undefined) return 'Done'
  if (typeof result === 'string') return result.slice(0, 100)
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if (Array.isArray(obj)) return `${obj.length} items`
    if ('total' in obj) return `Found ${obj.total} items`
    if ('error' in obj) return `Error: ${obj.error}`
    return JSON.stringify(result).slice(0, 100)
  }
  return String(result)
}
