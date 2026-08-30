# Spec — 聊天模块（Chat）

## 概述

聊天模块是 Open Agent 的核心，负责用户与 AI 之间的实时对话。包含服务端 SSE 流式端点和客户端 React Hook。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/server/routes/chat.ts` | SSE 流式端点 `POST /api/chat` |
| `src/server/ai/loop.ts` | 聊天循环：系统提示词构建 + 工具调用循环 |
| `src/server/ai/provider.ts` | OpenAI 兼容 API 流式客户端 |
| `src/server/ai/tools.ts` | 工具注册表（聚合所有插件工具） |
| `src/client/hooks/useChat.ts` | 客户端聊天状态管理 + SSE 解析 |

## 接口契约

### POST /api/chat

**请求**：
```json
{
  "message": "用户消息文本",
  "conversation_id": "可选-已有对话ID",
  "_retry": false
}
```

**请求头**：
- `Content-Type: application/json`
- `X-User: 用户名`（必填，否则 401）

**响应**：SSE 流（`Content-Type: text/event-stream`）

**事件类型**（`ServerMessage` 联合类型）：

| 事件 | 数据 | 说明 |
|---|---|---|
| `conversation_id` | `{ id: string }` | 对话 ID（新建时发送） |
| `token` | `{ text: string }` | 文本增量 token |
| `thinking` | `{ text: string }` | 思考过程增量 token |
| `tool_call` | `{ name: string, input: object }` | 工具调用开始 |
| `tool_result` | `{ name: string, summary: string }` | 工具调用结果摘要 |
| `done` | `{ reply: string, suggestions: string[] }` | 对话完成 |
| `error` | `{ message: string }` | 错误 |

**保活**：每 15 秒发送 SSE 注释 `:\n\n`。

## 行为约束

### 服务端（loop.ts）

1. **历史裁剪**：只发送最近 20 条消息（`MAX_HISTORY_MESSAGES`）
2. **工具循环上限**：最多 5 轮工具调用（`MAX_TOOL_ROUNDS`），超出后返回提示
3. **系统提示词构建**：
   - 基础内容 = `config.system_prompt`
   - 追加 `## Available Skills` 部分（所有技能内容）
   - 追加硬编码的 suggestions 格式指令（最高优先级）
4. **Suggestions 解析**：
   - 从回复文本中提取 ` ```suggestions ` 代码块
   - 去除行首的 `- `、`* `、数字前缀
   - 最多保留 3 条建议
5. **工具结果摘要**：`summarizeResult()` 将结果截断为 100 字符的字符串

### 客户端（useChat.ts）

1. **重试策略**：最多 3 次重试（`MAX_RETRIES`），指数退避（2s → 4s → 8s，上限 10s）
2. **空闲超时**：60 秒无数据则中止连接并触发重试
3. **流结束检测**：如果流结束但未收到 `done`/`error` 事件，视为失败并重试
4. **取消**：`abortRef` 支持用户主动取消正在进行的对话
5. **重试标记**：重试时发送 `_retry: true`，服务端跳过重复保存用户消息

## 外部依赖

- OpenAI 兼容的 Chat Completions API（流式 + function calling）
- 请求超时：120 秒（`provider.ts` 中 `AbortController`）
