import type { AppConfig, ServerMessage } from '../../shared/types.js'
import type { ChatMessage, ContentPart } from './provider.js'
import { streamChatCompletion } from './provider.js'
import { getAllTools } from './tools.js'
import { getConfig } from '../config.js'
import { skillRegistry } from '../skills/registry.js'
import { MAX_TOOL_ROUNDS, MAX_HISTORY_MESSAGES, SUGGESTIONS_FENCE } from '../../shared/constants.js'

type SendFn = (msg: ServerMessage) => void

export async function runChatLoop(
  userMessage: string | ContentPart[],
  history: ChatMessage[],
  send: SendFn,
  signal?: AbortSignal,
  thinkingMode = true,
): Promise<{ reply: string; suggestions: string[]; thinking: string }> {
  const config = await getConfig()
  const tools = getAllTools()

  // Build system prompt with skill hints
  const systemPrompt = buildSystemPrompt(config, thinkingMode)

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
    let pending = '' // withhold buffer for suggestions fence protection
    let suggestionsSeen = false // latch: once the fence is seen, hide everything after it
    let finishReason = ''
    let pendingCalls: Array<{ id: string; name: string; arguments: string }> = []

    // Stream from the API
    try {
      for await (const event of streamChatCompletion(config, messages, tools, thinkingMode)) {
        if (signal?.aborted) break

        switch (event.type) {
          case 'token': {
            // Suggestions fence withholding.
            // fullText must ALWAYS accumulate raw tokens (parseSuggestions reads
            // the fence out of it); the latch suppresses client emission after
            // the fence so suggestion lines never leak into the visible reply.
            const token = event.text || ''
            fullText += token

            if (suggestionsSeen) break

            // Keep a rolling buffer of the last FENCE-length chars un-emitted so a
            // fence split across token chunks is still detected before any of it ships.
            pending += token
            const fenceIdx = pending.indexOf(SUGGESTIONS_FENCE)
            if (fenceIdx !== -1) {
              suggestionsSeen = true
              const beforeFence = pending.slice(0, fenceIdx)
              if (beforeFence) send({ type: 'token', text: beforeFence })
              pending = ''
              break
            }

            // No fence yet — keep last SUGGESTIONS_FENCE.length chars withheld
            if (pending.length > SUGGESTIONS_FENCE.length) {
              const safeLen = pending.length - SUGGESTIONS_FENCE.length
              const toSend = pending.slice(0, safeLen)
              send({ type: 'token', text: toSend })
              pending = pending.slice(safeLen)
            }
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

    // Tool calls → no longer supported (plugin system removed)
    if (finishReason === 'tool_calls' && pendingCalls.length > 0) {
      send({ type: 'error', message: 'Tool calling is no longer supported' })
      return { reply: '', suggestions: [], thinking: fullThinking }
    }

    // Final answer — parse suggestions
    const { reply, suggestions } = parseSuggestions(fullText)

    // Flush pending buffer (last SUGGESTIONS_FENCE.length chars withheld during streaming)
    if (!signal?.aborted && pending.length > 0) {
      const fenceIdx = pending.indexOf(SUGGESTIONS_FENCE)
      if (fenceIdx > 0) {
        send({ type: 'token', text: pending.slice(0, fenceIdx) })
      } else if (fenceIdx === -1) {
        send({ type: 'token', text: pending })
      }
      pending = ''
    }

    send({ type: 'done', reply, suggestions })
    return { reply, suggestions, thinking: fullThinking }
  }

  // Max rounds exceeded
  send({ type: 'done', reply: '(Reached maximum tool call rounds)', suggestions: [] })
  return { reply: '', suggestions: [], thinking: fullThinking }
}

function buildSystemPrompt(config: AppConfig, thinkingMode: boolean): string {
  let prompt = config.system_prompt

  // Append skill descriptions
  const skills = skillRegistry.getAll()
  if (skills.length > 0) {
    prompt += '\n\n## Available Skills\n'
    for (const skill of skills) {
      prompt += `\n### ${skill.manifest.name}\n${skill.content}\n`
    }
  }

  // When thinking mode is off, explicitly tell the model to skip reasoning.
  // /no_think is the Qwen3 convention for disabling extended thinking;
  // the second line is provider-agnostic reinforcement.
  if (!thinkingMode) {
    prompt += '\n\n/no_think\n请直接回答问题，不要输出任何思考过程或推理步骤。'
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
  // Use lastIndexOf so we always match the ACTUAL trailing suggestions block,
  // not a ````suggestions` literal the model may have echoed inside the reply
  // body (e.g. when restating the format example from the system prompt).
  const fenceIdx = text.lastIndexOf(SUGGESTIONS_FENCE)
  if (fenceIdx === -1) {
    // Only trim trailing whitespace — preserve leading characters to avoid
    // swallowing the first token when the reply is used to overwrite the
    // streamed content in the client's done handler.
    return { reply: text.trimEnd(), suggestions: [] }
  }

  const reply = text.slice(0, fenceIdx).trimEnd()
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
