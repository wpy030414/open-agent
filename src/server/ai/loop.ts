import type { AppConfig, ServerMessage } from '../../shared/types.js'
import type { ChatMessage, ContentPart } from './provider.js'
import { streamChatCompletion } from './provider.js'
import { getAllTools } from './tools.js'
import { getConfig } from '../config.js'
import { skillRegistry } from '../skills/registry.js'
import { resolveTool } from '../tools/registry.js'
import { SandboxFS } from '../tools/workspace.js'
import type { ToolContext, ToolResult, ToolArtifact } from '../tools/types.js'
import { MAX_TOOL_ROUNDS, MAX_HISTORY_MESSAGES, SUGGESTIONS_FENCE } from '../../shared/constants.js'

type SendFn = (msg: ServerMessage) => void

export async function runChatLoop(
  userMessage: string | ContentPart[],
  history: ChatMessage[],
  send: SendFn,
  signal?: AbortSignal,
  thinkingMode = true,
  conversationId?: string,
  userId?: string,
): Promise<{ reply: string; suggestions: string[]; thinking: string; artifacts?: ToolArtifact[] }> {
  const config = await getConfig()
  const tools = getAllTools()

  // Build tool context for sandbox filesystem
  const toolContext: ToolContext = {
    conversationId: conversationId || 'default',
    userId: userId || 'anonymous',
    workspace: new SandboxFS(conversationId || 'default'),
    signal,
  }
  const producedArtifacts: ToolArtifact[] = []
  let writeFileCount = 0
  let writeFileRefused = false // once true, any further write_file calls force-terminate the loop

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

    // Tool calls — execute each tool and feed results back to the LLM
    if (finishReason === 'tool_calls' && pendingCalls.length > 0) {
      let forceBreak = false
      for (const call of pendingCalls) {
        let input: Record<string, unknown>
        try {
          input = JSON.parse(call.arguments || '{}')
        } catch {
          input = {}
        }

        // Resolve and execute tool (write_file guard prevents infinite loops)
        const toolModule = resolveTool(call.name)
        let result: ToolResult

        if (!toolModule) {
          result = { summary: `Unknown tool: ${call.name}`, error: true }
        } else if (call.name === 'write_file') {
          writeFileCount++
          if (writeFileRefused) {
            // Already refused once — AI is being stubborn, force-terminate
            send({ type: 'tool_call', name: call.name, input })
            send({ type: 'tool_result', name: call.name, summary: 'BLOCKED: write_file permanently disabled this turn.' })
            forceBreak = true
            break
          } else if (writeFileCount > 1) {
            writeFileRefused = true
            result = {
              summary: `Refused: write_file already called. STOP writing files. Reply to the user with your final answer NOW.`,
              error: true,
            }
          } else {
            try {
              result = await toolModule.execute(input, toolContext)
            } catch (err) {
              result = { summary: `Tool error: ${(err as Error).message}`, error: true }
            }
          }
        } else {
          try {
            result = await toolModule.execute(input, toolContext)
          } catch (err) {
            result = { summary: `Tool error: ${(err as Error).message}`, error: true }
          }
        }

        // Notify client (exactly once per tool call)
        send({ type: 'tool_call', name: call.name, input })
        send({ type: 'tool_result', name: call.name, summary: result.summary, artifacts: result.artifacts })

        // Collect artifacts for the response
        if (result.artifacts?.length) {
          producedArtifacts.push(...result.artifacts)
        }

        // Build tool result message for the LLM context
        const toolContent = result.data
          ? JSON.stringify(result.data).slice(0, 50_000)
          : result.summary

        toolMessages.push({
          role: 'tool',
          content: toolContent,
          tool_call_id: call.id,
        })
      }

      if (forceBreak) break // exit the tool loop entirely
      continue // next round
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
    return { reply, suggestions, thinking: fullThinking, artifacts: producedArtifacts.length > 0 ? producedArtifacts : undefined }
  }

  // Max rounds exceeded
  send({ type: 'done', reply: '(Reached maximum tool call rounds)', suggestions: [] })
  return { reply: '', suggestions: [], thinking: fullThinking, artifacts: producedArtifacts.length > 0 ? producedArtifacts : undefined }
}

function buildSystemPrompt(config: AppConfig, thinkingMode: boolean): string {
  let prompt = config.system_prompt

  // Append skill descriptions only (full content loaded on demand via load_skill tool)
  const skills = skillRegistry.getAll()
  if (skills.length > 0) {
    prompt += '\n\n## Available Skills\n'
    prompt += '以下是已安装的技能摘要。如需查看某个技能的完整内容，请调用 load_skill 工具。\n'
    for (const skill of skills) {
      prompt += `\n- **${skill.manifest.name}**: ${skill.manifest.description}\n`
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

## 工具使用规范（必须遵守）
- 完成一个任务后立即回复用户，不要反复修改、重写或优化同一个文件。
- 每次写文件只用一个确定的文件名，不要每次生成新文件名。
- 如果用户要求"写一个文件"，写一次就够了。不要用不同的文件名重复创建。
- 写完文件后，用自然语言告诉用户文件已创建，不要再次调用工具。

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
