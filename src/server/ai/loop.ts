import type { AppConfig, ServerMessage } from '../../shared/types.js'
import type { ChatMessage, ContentPart } from './provider.js'
import { streamChatCompletion } from './provider.js'
import { getAllTools } from './tools.js'
import { getConfig } from '../config.js'
import { skillRegistry } from '../skills/registry.js'
import { resolveTool } from '../tools/registry.js'
import { SandboxFS } from '../tools/workspace.js'
import type { ToolContext, ToolResult, ToolArtifact } from '../tools/types.js'
import { MAX_TOOL_ROUNDS, MAX_HISTORY_MESSAGES, SUGGESTIONS_FENCE, THINKING_SEGMENT_OPEN, THINKING_SEGMENT_CLOSE, THINKING_TRUNCATED_MARK } from '../../shared/constants.js'

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
  let writeFileCount = 0 // 用于本回合 write_file 调用次数的温和提醒

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
  let emittedSegmentRound = -1 // 已注入分隔符的最新轮次；-1 = 尚未注入任何分隔符
  let lastRoundHadThinking = false // 上一轮是否产出了 thinking（用于截断标记）

  // Pi 的设计理念：外层循环决定「下一步做什么」，程序提供能力并执行，
  // 循环把两者接起来。MAX_TOOL_ROUNDS 是最终安全网 —— 但每一条出口都必须发终态，
  // 绝不让客户端永远等不到 done/error。
  //
  // 跨轮追忆：工具轮撞顶或工具阶段被终止时，用最近一次流式正文兜底成一个非空 reply。
  let lastFullText = ''
  // 连续重复批检测：模型在同一个 (tool+args) 批上反复打转（如反复 load_skill openyida）
  // 视为漂移，强制终止 —— 等价于 Pi 的 batch.terminate。
  let lastToolBatchSig = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      send({ type: 'error', message: '已取消' })
      return { reply: '', suggestions: [], thinking: fullThinking }
    }

    const messages = [...baseMessages, ...toolMessages]
    let fullText = ''
    let pending = '' // withhold buffer for suggestions fence protection
    let suggestionsSeen = false // latch: once the fence is seen, hide everything after it
    let finishReason = ''
    let pendingCalls: Array<{ id: string; name: string; arguments: string }> = []
    lastRoundHadThinking = false // 每轮复位，防止跨轮误判 length 截断标记

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
          case 'thinking': {
            const t = event.text || ''
            if (!t) break
            // 每轮第一条 thinking 前注入「思考片段 N」分隔符
            // 始终注入（含第一轮），保证 DB 存储格式与 SSE 流完全一致
            if (round !== emittedSegmentRound) {
              emittedSegmentRound = round
              const header = THINKING_SEGMENT_OPEN + (round + 1) + THINKING_SEGMENT_CLOSE
              fullThinking += header
              send({ type: 'thinking', text: header, round })
            }
            fullThinking += t
            send({ type: 'thinking', text: t, round })
            lastRoundHadThinking = true
            break
          }
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

    // 用户中途取消同样要给终态
    if (signal?.aborted) {
      send({ type: 'error', message: '已取消' })
      return { reply: '', suggestions: [], thinking: fullThinking }
    }

    // 保底追忆上一轮流式正文（可能既有文本又夹带工具调用）
    if (fullText) {
      lastFullText = fullText
    }

    const hasToolCalls = pendingCalls.length > 0

    // ---- Pi: stopReason === 'length'（输出 token 上限被截断）----
    // 参数不可信，不执行；把「未执行」作为错误结果回填，让模型尽快用文本收尾。
    if (hasToolCalls && finishReason === 'length') {
      // 输出长度截断：思考片段可能停在半截词上，打上截断标记供前端提示
      if (lastRoundHadThinking) {
        fullThinking += THINKING_TRUNCATED_MARK
        send({ type: 'thinking', text: THINKING_TRUNCATED_MARK, round })
        lastRoundHadThinking = false
      }
      // 回填模型自己的 assistant 消息（含 tool_calls），下一轮才能正确续接
      toolMessages.push({
        role: 'assistant',
        content: fullText || null,
        tool_calls: pendingCalls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.arguments },
        })),
      })
      for (const call of pendingCalls) {
        const summary = `工具 "${call.name}" 未执行：响应触发了输出 token 上限，参数可能被截断。请重新发起完整参数，或直接根据已有信息作答。`
        send({ type: 'tool_call', id: call.id, name: call.name, input: {} })
        send({ type: 'tool_result', id: call.id, name: call.name, summary })
        toolMessages.push({ role: 'tool', content: summary, tool_call_id: call.id })
      }
      if (round === MAX_TOOL_ROUNDS - 1) break // 没有下一轮了，落到统一收口
      continue
    }

    // ---- Tool calls 阶段（Pi: executeToolCalls，可终止）----
    if (hasToolCalls) {
      const batchSig = pendingCalls.map((c) => `${c.name}:${c.arguments}`).join('|')

      // 连续重复同一批工具 → 模型漂移，强制终止（等价于 Pi 的 batch.terminate）
      if (batchSig && batchSig === lastToolBatchSig) {
        const msg = '你已连续调用完全相同的工具两次。立即停止调用工具，直接根据已有信息用中文回答用户。'
        // 回填模型自己的 assistant 消息（含 text + tool_calls），再回填 BLOCKED 结果
        toolMessages.push({
          role: 'assistant',
          content: fullText || null,
          tool_calls: pendingCalls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.name, arguments: c.arguments },
          })),
        })
        for (const call of pendingCalls) {
          send({ type: 'tool_call', id: call.id, name: call.name, input: {} })
          send({ type: 'tool_result', id: call.id, name: call.name, summary: `BLOCKED: ${msg}` })
          toolMessages.push({ role: 'tool', content: `BLOCKED: ${msg}`, tool_call_id: call.id })
        }
        lastToolBatchSig = '' // 复位，收口兜底用的 lastFullText 不受影响
        break // 工具阶段终止 → 落到统一收口，保证有终态
      }
      lastToolBatchSig = batchSig

      // 回填模型自己的 assistant 消息（含 text + tool_calls），下一轮才能正确续接
      toolMessages.push({
        role: 'assistant',
        content: fullText || null,
        tool_calls: pendingCalls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.arguments },
        })),
      })

      for (const call of pendingCalls) {
        send({ type: 'tool_execution_start', id: call.id, name: call.name, input: call.arguments ? (() => { try { return JSON.parse(call.arguments || '{}') } catch { return {} } })() : {} })
      }

      // Pi 设计（executeToolCallsParallel）：无依赖的工具并发执行（Promise.all），
      // 但结果按模型发起的顺序逐个回填，上下文不乱序。
      const executedCalls = await Promise.all(
        pendingCalls.map(async (call) => {
          let input: Record<string, unknown>
          try {
            input = JSON.parse(call.arguments || '{}')
          } catch {
            input = {}
          }

          const toolModule = resolveTool(call.name)
          let result: ToolResult

          if (!toolModule) {
            result = { summary: `Unknown tool: ${call.name}`, error: true }
          } else if (call.name === 'write_file') {
            writeFileCount++
            if (writeFileCount > 1) {
              // 已是本回合第 2 次写文件：温和提醒，不再永久禁用。
              result = {
                summary: `提示：write_file 已经是第 ${writeFileCount} 次调用。写完当前文件后请直接回复用户，不要再调用更多工具。`,
                error: false,
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

          return { call, result }
        }),
      )

      // 按发起顺序回填
      for (const { call, result } of executedCalls) {
        send({ type: 'tool_result', id: call.id, name: call.name, summary: result.summary, artifacts: result.artifacts })

        if (result.artifacts?.length) {
          producedArtifacts.push(...result.artifacts)
        }

        const toolContent = result.data
          ? JSON.stringify(result.data).slice(0, 50_000)
          : result.summary

        toolMessages.push({
          role: 'tool',
          content: toolContent,
          tool_call_id: call.id,
        })
      }

      // Pi 设计（shouldTerminateToolBatch）：仅当本批所有工具都要求终止时才收口。
      if (round < MAX_TOOL_ROUNDS - 1 && executedCalls.length > 0 && executedCalls.every(({ result }) => result.terminate === true)) {
        break // 全部工具都「完成了，停」→ 提前收口，不再发起下一轮
      }

      if (round === MAX_TOOL_ROUNDS - 1) break // 已是最后一轮，不再尝试新工具 → 收口
      continue // 正常执行完一批工具，下一轮
    }

    // ---- Final answer：不带工具、直接作答的一轮 ----
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

  // ---- 统一收口（Pi: 每一条路径都有 agent_end，绝不静默 return）----
  // 走到这里只有三种情况：轮数撞顶、工具阶段被终止、最后几轮全是工具调用。
  // 优先尝试「追加纯文本收尾轮」：用完整上下文（含全部工具结果）让模型直接整理最终回答，
  // 不再把工具轮里那句半截旁白当最终回复。
  const finalRound = await runFinalAnswerRound(config, [...baseMessages, ...toolMessages], send, signal)
  if (finalRound) {
    send({ type: 'done', reply: finalRound.reply, suggestions: finalRound.suggestions })
    return { reply: finalRound.reply, suggestions: finalRound.suggestions, thinking: fullThinking, artifacts: producedArtifacts.length > 0 ? producedArtifacts : undefined }
  }

  // 追加轮失败 / 无正文 → 回退：用最近一次流式正文兜底
  const { reply: baseReply, suggestions: baseSugg } = parseSuggestions(lastFullText)
  // 兜底回复可能自带 fence 代码块（模型在正文里也画了一个），会被 seen 隐藏；这里再剥一层
  const finalText = baseReply.trim().replace(new RegExp(SUGGESTIONS_FENCE + '[\\s\\S]*$'), '').trim()
  const reply = finalText || '（已完成思考但未能给出有效回答：已中止反复的工具调用。请换一种问法重试。）'
  send({ type: 'done', reply, suggestions: baseSugg })
  return { reply, suggestions: baseSugg, thinking: fullThinking, artifacts: producedArtifacts.length > 0 ? producedArtifacts : undefined }
}

/**
 * 追加纯文本收尾轮：工具轮数撞顶或工具阶段被终止时，
 * 用完整上下文（含全部工具结果）发起一次「不带工具、不开思考」的请求，
 * 让模型直接整理出最终回答（含 suggestions）。失败或空回复返回 null。
 */
async function runFinalAnswerRound(
  config: AppConfig,
  messages: ChatMessage[],
  send: SendFn,
  signal?: AbortSignal,
): Promise<{ reply: string; suggestions: string[] } | null> {
  const finalMessages: ChatMessage[] = [
    ...messages,
    {
      role: 'user',
      content:
        '工具轮数已用尽。请综合以上所有工具结果，直接用自然语言回答用户最初的请求。' +
        '不要调用任何工具。如果信息仍不足，请如实说明。' +
        '回复末尾必须输出 ```suggestions 代码块，恰好 3 条后续建议（用户口吻）。',
    },
  ]

  let fullText = ''
  let pending = ''
  let suggestionsSeen = false

  try {
    // 传 [] 作为 tools —— API 请求体不含 tools，模型无法调用工具；thinkingMode=false 强制直接作答
    for await (const event of streamChatCompletion(config, finalMessages, [], false)) {
      if (signal?.aborted) break
      if (event.type === 'token') {
        const token = event.text || ''
        fullText += token
        if (suggestionsSeen) break
        pending += token
        const fenceIdx = pending.indexOf(SUGGESTIONS_FENCE)
        if (fenceIdx !== -1) {
          suggestionsSeen = true
          const beforeFence = pending.slice(0, fenceIdx)
          if (beforeFence) send({ type: 'token', text: beforeFence })
          pending = ''
          break
        }
        if (pending.length > SUGGESTIONS_FENCE.length) {
          const safeLen = pending.length - SUGGESTIONS_FENCE.length
          send({ type: 'token', text: pending.slice(0, safeLen) })
          pending = pending.slice(safeLen)
        }
      }
      // 忽略 thinking / tool_call —— 收尾轮不应产生它们；若模型仍尝试调用则直接丢弃
    }
  } catch (err) {
    console.warn('Final answer round failed:', (err as Error).message)
    return null
  }

  if (signal?.aborted) return null

  // Flush pending buffer
  if (pending.length > 0) {
    const fenceIdx = pending.indexOf(SUGGESTIONS_FENCE)
    if (fenceIdx > 0) send({ type: 'token', text: pending.slice(0, fenceIdx) })
    else if (fenceIdx === -1) send({ type: 'token', text: pending })
  }

  const { reply, suggestions } = parseSuggestions(fullText)
  if (!reply.trim()) return null
  return { reply, suggestions }
}

function buildSystemPrompt(config: AppConfig, thinkingMode: boolean): string {
  let prompt = config.system_prompt

  // Append skill descriptions only (full content loaded on demand via load_skill tool)
  const skills = skillRegistry.getAll()
  if (skills.length > 0) {
    prompt += '\n\n## Available Skills\n'
    prompt += '以下是已安装的技能摘要。技能库可能不完整：如果用户的请求没有与某个技能描述明显匹配，请直接如实告知用户当前技能库中是否有可用技能，不要强行加载技能试探。如需查看某个技能的完整内容，请调用 load_skill 工具。\n'
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
- 工具结果通常会直接给出答案所需的信息：不要重复调用同一个工具、不要反复加载同一个技能，加载一次就足够。
- 【技能止损·硬性规则】加载技能后若发现其内容与用户请求无关，必须立即停止调用任何工具，直接用中文如实告知用户「当前技能库中没有与该请求直接匹配的技能」，并根据已有知识给出通用建议。禁止再次 load_skill 同一技能，禁止为试探目的加载其他技能，禁止在缺少依据时继续调用工具。

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