# DECISIONS — Open Agent 设计决策记录

## D1：SSE 替代 WebSocket

**日期**：架构确立时

**背景**：最初项目使用 WebSocket（@hono/node-ws）进行实时通信。

**决策**：迁移到 Server-Sent Events（SSE）。

**原因**：
- SSE 是标准 HTTP 协议，天然兼容代理、负载均衡、CDN
- 无需双向通信（聊天场景服务端单向推送即可）
- 实现更简单，无需维护连接状态
- 自动重连由客户端 fetch + retry 处理
- 源码注释中明确说明："Standard HTTP, no WebSocket needed. Works through any proxy."

**影响**：
- `@hono/node-ws` 仍在 dependencies 中但未使用（可清理）
- 客户端使用 `fetch` + `ReadableStream` 解析 SSE

---

## D2：SQLite 替代外部数据库

**日期**：架构确立时

**背景**：需要一个数据库来存储对话历史和配置。

**决策**：使用 SQLite（@libsql/client + Drizzle ORM），单文件存储。

**原因**：
- 零配置，无需安装/维护外部数据库服务
- 单文件 `data/open-agent.db`，易于备份和迁移
- 对于单用户/小团队场景完全足够
- @libsql/client 提供原生 SQLite 支持，无需编译 native 模块

**影响**：
- 不支持并发写入（但单用户场景不需要）
- 数据文件随使用时间增长，需要定期清理

---

## D3：用户名替代认证系统

**日期**：架构确立时

**背景**：需要区分不同用户的对话。

**决策**：使用 localStorage 存储用户名，通过 `X-User` 请求头传递。

**原因**：
- 定位为个人/小团队自托管工具
- 不需要复杂的认证/授权系统
- 降低部署和使用门槛
- 通过 user_id 隔离对话数据

**影响**：
- 不提供密码保护，安全性依赖于网络隔离
- 不适合公开部署的场景

---

## D4：技能注入系统提示词

**日期**：架构确立时

**背景**：需要为 AI 注入领域知识和行为准则。

**决策**：将技能 SKILL.md 的 Markdown 内容直接拼接到系统提示词末尾。

**原因**：
- 简单直接，无需复杂的 prompt engineering 框架
- 兼容所有 OpenAI 兼容 API
- 技能内容对用户透明，管理员可通过面板管理

**实现细节**：
- `buildSystemPrompt()` 中按 `## Available Skills` 格式拼接
- 每个技能以 `### {name}` 作为标题
- 系统提示词末尾追加硬编码的 suggestions 格式指令（最高优先级）

---

## D5：Suggestions 代码块协议

**日期**：架构确立时

**背景**：需要在 AI 回复中嵌入结构化的后续建议数据。

**决策**：使用 ` ```suggestions ` 代码块作为分隔符。

**原因**：
- 利用 Markdown 代码块语法，AI 模型容易理解和生成
- 流式输出时可以在遇到 fence 后停止转发 token
- 客户端解析简单：找到 fence 后的内容，逐行提取

**实现细节**：
- 流式输出时，遇到 `SUGGESTIONS_FENCE` 前会保留最后 `len(fence)` 个字符的缓冲区
- `parseSuggestions()` 提取 fence 和下一个 ` ``` ` 之间的内容
- 建议行去除 `- `、`* `、数字前缀，最多保留 3 条
- 系统提示词中明确要求以用户第一人称口吻生成建议

---

## D6：插件工具名前缀

**日期**：架构确立时

**背景**：多个插件可能定义同名的工具。

**决策**：工具注册时自动加上 `{插件名}_` 前缀。

**原因**：
- 避免工具名冲突
- AI 调用时能明确知道是哪个插件的工具
- `resolveTool()` 通过前缀反查所属插件

**示例**：
- 插件 `weather` 定义工具 `forecast` → 注册为 `weather_forecast`
- 插件 `search` 定义工具 `web` → 注册为 `search_web`

---

## D7：配置双层覆盖

**日期**：架构确立时

**背景**：配置既需要从环境变量读取（初始值），又需要支持运行时修改。

**决策**：环境变量作为默认值，SQLite settings 表作为运行时覆盖。

**原因**：
- 环境变量提供开箱即用的初始配置
- 管理员面板修改后立即生效，无需重启
- `getConfig()` 每次从 DB 读取（fallback 到 env 值），实现热更新

---

## D8：tsx watch 替代 nodemon

**日期**：架构确立时

**背景**：开发模式下需要服务端文件变更自动重启。

**决策**：使用 `tsx watch` 而非 nodemon + ts-node。

**原因**：
- tsx 是 esbuild 驱动的，启动和编译速度极快
- 原生支持 TypeScript ESM
- 单一工具完成 watch + 执行，减少依赖

---

## D9：tsup 构建服务端

**日期**：架构确立时

**背景**：服务端 TypeScript 需要编译为 JavaScript 才能在生产环境运行。

**决策**：使用 tsup（esbuild）构建服务端，输出 ESM 格式。

**原因**：
- 与 tsx 共享 esbuild 生态
- 构建速度极快
- `--clean` 自动清理输出目录
- `--dts` 生成类型声明

---

## D10：流式输出中的 Suggestions 缓冲区策略

**日期**：架构确立时

**背景**：流式输出 token 时，需要在 suggestions 代码块出现时停止转发，但不能丢失已发送的内容。

**决策**：维护一个长度为 `SUGGESTIONS_FENCE.length` 的安全缓冲区。

**原因**：
- suggestions fence 可能跨越多个 token chunk 到达
- 如果直接转发每个 token，fence 的前几个字符可能已经发送给客户端
- 缓冲区确保 fence 完整出现前不会发送可能被 fence 截断的内容
- 一旦检测到 fence，后续 token 不再发送（但仍累积到 fullText 供解析）

**影响**：
- 用户端最后几个字符会有轻微延迟（可忽略）
- 代码中有详细注释说明此策略
