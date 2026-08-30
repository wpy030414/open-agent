# AGENTS.md

## 项目：Open Agent

自托管的 Web AI 智能体平台。用户与 AI 对话；模型按需调用插件/技能；管理员通过密钥控制一切。

## 非目标（Non-Goals）

这些功能**不在本项目范围内**，Agent 不应尝试添加：

- ❌ 多用户认证/登录系统（仅有 localStorage 用户名）
- ❌ 文件上传/下载（仅支持管理员上传插件/技能 zip）
- ❌ RAG / 知识库
- ❌ 工作流构建器 / 可视化编辑器
- ❌ 移动应用
- ❌ 企业 SSO
- ❌ 实时协作
- ❌ WebSocket 实时通信（已迁移到 SSE）

## 架构概述

单进程全栈 TypeScript 应用：

- **前端**：React 18 + shadcn/ui（Radix 原语 + Tailwind CSS 3.4），Vite 6 构建为静态文件，由 Hono 在生产模式下托管
- **后端**：Hono 4（Node.js），SSE 用于实时聊天流，REST API 用于 CRUD
- **数据库**：SQLite（@libsql/client + Drizzle ORM）—— 单文件 `data/open-agent.db`，无需外部数据库
- **AI**：OpenAI 兼容的 Chat Completions API，支持流式输出和 function calling
- **插件**：JSON 清单 + TS/JS 模块，从 `plugins/` 目录动态加载执行
- **技能**：SKILL.md 文件（YAML 前置元数据 + Markdown 内容），注入系统提示词

## 关键目录

| 路径 | 用途 |
|---|---|
| `src/shared/` | 客户端与服务端共享的 TypeScript 类型和常量 |
| `src/client/` | React 前端（入口：`main.tsx`） |
| `src/server/` | Hono 后端（入口：`index.ts`） |
| `src/server/ai/` | AI 提供商客户端（`provider.ts`）+ 聊天循环（`loop.ts`）+ 工具注册（`tools.ts`） |
| `src/server/plugins/` | 插件加载（`loader.ts`）、执行（`executor.ts`）、注册（`registry.ts`） |
| `src/server/skills/` | 技能加载和注册（`loader.ts` → `registry.ts`） |
| `src/server/routes/` | API 路由：`chat.ts`、`conversations.ts`、`admin.ts`、`plugins.ts` |
| `plugins/` | 已安装的插件目录 |
| `skills/` | 已安装的技能目录 |
| `data/` | SQLite 数据库文件（`open-agent.db`） |

## 开发

```bash
pnpm dev          # 同时运行 Vite（5173）+ Hono（3001），tsx watch 热重载
pnpm build        # 构建客户端（Vite）+ 服务端（tsup）
pnpm start        # 运行生产构建（node dist/index.js）
```

## 代码规范

- 所有 UI 组件使用 shadcn/ui 模式（Radix + Tailwind + CVA）
- 基础 UI 组件在 `src/client/components/ui/`
- 业务组件在 `src/client/components/{chat,sidebar,settings,auth}/`
- Hooks 在 `src/client/hooks/`
- API 客户端在 `src/client/lib/api.ts`
- 服务端路由在 `src/server/routes/`
- 共享类型在 `src/shared/types.ts` —— 唯一的事实来源

## 插件契约

插件是 `plugins/` 下的一个目录，包含：

- **`plugin.json`** — 清单文件，包含 `name`、`version`、`description`、`tools[]`
- **`index.ts` / `index.js` / `index.mjs`** — 导出 `execute(toolName: string, input: Record<string, unknown>): Promise<unknown>`

工具名在注册时自动加上插件前缀：`{pluginName}_{toolName}`。模块首次导入后会被缓存。

## 技能契约

技能是 `skills/` 下的一个目录，包含：

- **`SKILL.md`** — YAML 前置元数据（`name`、`description`、可选 `version`）+ Markdown 正文（注入系统提示词）

## 管理员安全

- `ADMIN_KEY` 在 `.env` 中设置，永远不会暴露给前端
- 管理员端点需要 JWT Token（通过 `POST /api/admin/auth` 验证密钥获取）
- JWT 24 小时后过期
- 所有配置变更持久化到 SQLite

## 数据库

- 文件位置：`data/open-agent.db`
- 表：`conversations`、`messages`、`settings`
- 迁移策略：`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` 添加新列
- 时间戳使用 Unix epoch（秒）

## 关键常量（`src/shared/constants.ts`）

| 常量 | 值 | 说明 |
|---|---|---|
| `MAX_TOOL_ROUNDS` | 5 | 单次对话最大工具调用轮次 |
| `MAX_HISTORY_MESSAGES` | 20 | 发送给 AI 的最大历史消息数 |
| `ADMIN_TOKEN_EXPIRY_HOURS` | 24 | 管理员 JWT 有效期（小时） |
| `DEFAULT_MODEL` | `gpt-4o` | 默认模型 |
| `DEFAULT_API_ENDPOINT` | `https://api.openai.com/v1` | 默认 API 端点 |
