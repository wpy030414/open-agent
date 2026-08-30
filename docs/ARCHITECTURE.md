# ARCHITECTURE — Open Agent 架构文档

## 系统总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器（React SPA）                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Sidebar  │  │ChatPanel │  │ Settings  │  │  MenuDialog  │   │
│  │ 对话列表  │  │ 聊天界面  │  │ 管理面板   │  │  用户设置     │   │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘   │
│        │            │              │                │           │
│        └────────────┴──────────────┴────────────────┘           │
│                            │ useChat Hook + API Client          │
└────────────────────────────┼────────────────────────────────────┘
                             │ SSE (POST /api/chat) + REST API
┌────────────────────────────┼────────────────────────────────────┐
│                     Hono 服务端 (Node.js)                        │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │                      路由层                                │  │
│  │  ┌──────────┐ ┌────────────┐ ┌───────┐ ┌──────────────┐  │  │
│  │  │ chat.ts  │ │conversations│ │admin  │ │  plugins.ts  │  │  │
│  │  │ SSE 聊天  │ │  对话 CRUD  │ │管理API │ │  插件查询     │  │  │
│  │  └──────────┘ └────────────┘ └───────┘ └──────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     业务逻辑层                              │  │
│  │  ┌─────────────┐  ┌───────────────┐  ┌────────────────┐  │  │
│  │  │  ai/loop.ts │  │ plugins/      │  │  skills/       │  │  │
│  │  │ 聊天循环     │  │ executor.ts   │  │  loader.ts     │  │  │
│  │  │ + 工具调用   │  │ + registry    │  │  + registry    │  │  │
│  │  └─────────────┘  └───────────────┘  └────────────────┘  │  │
│  │  ┌─────────────┐  ┌───────────────┐  ┌────────────────┐  │  │
│  │  │ai/provider  │  │  config.ts    │  │   auth.ts      │  │  │
│  │  │ API 客户端   │  │  配置管理      │  │   JWT 认证     │  │  │
│  │  └─────────────┘  └───────────────┘  └────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     数据层                                  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  db.ts — SQLite (@libsql/client + Drizzle ORM)      │  │  │
│  │  │  conversations | messages | settings                 │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流

### 聊天消息流（SSE）

```
用户输入 → POST /api/chat
  → 保存用户消息到 DB
  → 加载历史消息（最近 20 条）
  → runChatLoop()
    → buildSystemPrompt()（注入技能内容 + 格式指令）
    → streamChatCompletion()（调用 OpenAI 兼容 API）
      → 逐 token 流式输出（SSE event: token）
      → 流式输出思考过程（SSE event: thinking）
      → 如果 finishReason == 'tool_calls'：
          → 执行插件工具（executeTool）
          → 将结果追加到消息上下文
          → 继续下一轮循环（最多 5 轮）
      → 最终回复：
          → 解析 suggestions 代码块
          → 发送 done 事件（完整回复 + 建议）
  → 保存助手消息到 DB
  → 客户端收到 done → 更新 UI → 刷新对话列表
```

### 配置数据流

```
环境变量 (.env)
  ↓ 启动时读取
config.ts → env 对象（不可热更新）
  ↓ 作为默认值
SQLite settings 表（可热更新）
  ↓ 管理员通过 PUT /api/admin/config 修改
getConfig() → 运行时配置（优先使用 DB 值）
```

## 模块依赖关系

```
routes/chat.ts
  ├── ai/loop.ts
  │     ├── ai/provider.ts（API 客户端）
  │     ├── ai/tools.ts（工具注册表）
  │     ├── plugins/executor.ts（插件执行器）
  │     ├── skills/registry.ts（技能注册表）
  │     └── config.ts（获取配置）
  ├── db.ts（数据库）
  └── schema.ts（Drizzle 表定义）

routes/admin.ts
  ├── auth.ts（JWT 认证）
  ├── config.ts（配置管理）
  ├── plugins/registry.ts（插件注册表）
  └── skills/loader.ts（技能注册表）

routes/conversations.ts
  ├── db.ts
  └── schema.ts

routes/plugins.ts
  ├── plugins/registry.ts
  ├── plugins/executor.ts
  └── config.ts
```

## 数据库 Schema

```sql
conversations
├── id TEXT PRIMARY KEY          -- UUID
├── user_id TEXT                 -- 用户名（localStorage）
├── title TEXT                   -- 对话标题（默认取消息前 40 字符）
├── created_at INTEGER           -- Unix epoch (秒)
└── updated_at INTEGER           -- Unix epoch (秒)

messages
├── id INTEGER PRIMARY KEY       -- 自增
├── conversation_id TEXT FK      -- 关联 conversations，级联删除
├── role TEXT                    -- user | assistant | system | tool
├── content TEXT                 -- 消息内容
├── thinking TEXT                -- AI 思考过程（可选）
├── tool_calls TEXT              -- JSON 序列化的工具调用数组（可选）
├── tool_call_id TEXT            -- 工具响应关联的调用 ID（可选）
├── suggestions TEXT             -- JSON 序列化的建议数组（可选）
└── created_at INTEGER           -- Unix epoch (秒)

settings
├── key TEXT PRIMARY KEY         -- 配置键
└── value TEXT                   -- 配置值
```

## 前端组件树

```
App
├── LoginScreen                  -- 无用户时显示
├── Sidebar
│     ├── 新建对话按钮
│     ├── 对话列表
│     └── 用户信息/设置入口
├── ChatPanel
│     ├── MessageList
│     │     └── MessageBubble[]  -- 每条消息
│     │           ├── ThinkingBlock   -- 可折叠的思考过程
│     │           ├── ToolCallsPanel  -- 工具调用列表
│     │           ├── MessageContent  -- Markdown + Mermaid 渲染
│     │           └── SuggestionChips -- 后续建议按钮
│     ├── InputBar               -- 文本输入 + 发送按钮
│     └── PluginBar              -- 可用插件列表
├── SettingsDialog               -- 管理员面板（需密钥认证）
│     ├── BrandingTab
│     ├── ModelTab
│     ├── PromptTab
│     ├── PluginsTab
│     └── SkillsTab
└── MenuDialog                   -- 用户设置
      ├── 语言切换
      ├── 主题切换
      └── 管理设置入口
```

## 认证模型

```
用户层：
  用户名存储在 localStorage（无密码）
  每个请求带 X-User 头
  对话按 user_id 隔离

管理员层：
  POST /api/admin/auth + ADMIN_KEY → JWT (24h)
  后续请求带 Authorization: Bearer <jwt>
  config.ts 中 getConfig() 返回时脱敏 API Key
```

## 部署架构

```
开发模式：
  Vite Dev Server (:5173)  ──proxy──→  Hono (:3001)

生产模式：
  Hono (:3001)  ── 直接托管 ──→  dist/client/ 静态文件
              └── API 路由 ──→  /api/*
```
