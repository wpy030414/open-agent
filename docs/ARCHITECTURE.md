# ARCHITECTURE — Open Agent 架构文档

## 系统总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器（React SPA）                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Sidebar  │  │ChatPanel │  │ Settings  │  │LoginScreen   │   │
│  │ 对话列表  │  │ 聊天界面  │  │ 管理面板   │  │ PIN 认证登录  │   │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘   │
│        │            │              │                │           │
│        └────────────┴──────────────┴────────────────┘           │
│                            │ useChat Hook + API Client          │
└────────────────────────────┼────────────────────────────────────┘
                             │ SSE (POST /api/chat) + REST API + JWT
┌────────────────────────────┼────────────────────────────────────┐
│                     Hono 服务端 (Node.js)                        │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │                      路由层                                │  │
│  │  ┌────────┐ ┌───────────┐ ┌───────┐ ┌────────┐ ┌──────┐ │  │
│  │  │chat.ts │ │conversat. │ │admin  │ │plugins │ │user  │ │  │
│  │  │SSE 聊天 │ │ 对话 CRUD │ │管理API │ │插件查询 │ │PIN   │ │  │
│  │  └────────┘ └───────────┘ └───────┘ └────────┘ └──────┘ │  │
│  │  ┌────────┐ ┌───────────┐                                │  │
│  │  │upload  │ │  health   │                                │  │
│  │  │文件上传 │ │  健康检查  │                                │  │
│  │  └────────┘ └───────────┘                                │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     中间件层                                │  │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐   │  │
│  │  │ userAuth.ts      │  │ adminAuthMiddleware          │   │  │
│  │  │ 用户 JWT 认证     │  │ 管理员 JWT 认证               │   │  │
│  │  └──────────────────┘  └──────────────────────────────┘   │  │
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
│  │  │ API 客户端   │  │  配置管理      │  │  PIN+JWT 认证  │  │  │
│  │  └─────────────┘  └───────────────┘  └────────────────┘  │  │
│  │  ┌─────────────┐                                         │  │
│  │  │files/parser │  附件解析（图片→base64, xlsx→csv, pdf→text）│  │
│  │  └─────────────┘                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     数据层                                  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  db.ts — SQLite (@libsql/client + Drizzle ORM)      │  │  │
│  │  │  conversations | messages (含 attachments) | settings│  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流

### 聊天消息流（SSE）

```
用户输入（+ 可选附件 + 思考模式开关）→ POST /api/chat
  → userAuthMiddleware 验证 JWT
  → 保存用户消息到 DB（含附件元数据）
  → 加载历史消息（最近 20 条）
  → 解析附件（图片→base64 多模态、xlsx→csv、pdf→text）
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
  → 保存助手消息到 DB（含 thinking、suggestions）
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

### 用户认证流

```
用户打开应用
  → localStorage 有 JWT？→ 验证有效 → 直接进入
  → 无 JWT → 显示 LoginScreen
    → 输入用户名
    → GET /api/user/status → 有 PIN？
      → 有 PIN → 输入 PIN → POST /api/user/verify → JWT（30天）
      → 无 PIN → 设置 PIN → POST /api/user/set-pin → JWT（30天）
  → JWT 存入 localStorage → 进入主界面
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
  ├── files/parser.ts（附件解析）
  ├── db.ts（数据库）
  └── schema.ts（Drizzle 表定义）

routes/conversations.ts
  ├── db.ts
  ├── schema.ts
  └── middleware/userAuth.ts

routes/admin.ts
  ├── auth.ts（JWT 认证）
  ├── config.ts（配置管理）
  ├── plugins/registry.ts（插件注册表）
  └── skills/loader.ts（技能注册表）

routes/plugins.ts
  ├── plugins/registry.ts
  ├── plugins/executor.ts
  └── config.ts

routes/upload.ts
  └── middleware/userAuth.ts

routes/user.ts
  ├── auth.ts（PIN 哈希 + JWT 签发）
  ├── db.ts
  └── schema.ts
```

## 数据库 Schema

```sql
conversations
├── id TEXT PRIMARY KEY          -- UUID
├── user_id TEXT                 -- 用户名（JWT sub）
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
├── attachments TEXT             -- JSON 序列化的附件数组（可选）
└── created_at INTEGER           -- Unix epoch (秒)

settings
├── key TEXT PRIMARY KEY         -- 配置键（含 pin:{username}）
└── value TEXT                   -- 配置值
```

## 前端组件树

```
App
├── LoginScreen                  -- PIN 认证登录（用户名 → PIN 验证/设置）
├── Sidebar
│     ├── 新建对话按钮
│     ├── 对话列表（重命名、导出、删除）
│     └── 用户信息/菜单按钮
├── ChatPanel
│     ├── MessageList
│     │     └── MessageBubble[]  -- 每条消息
│     │           ├── ThinkingBlock   -- 可折叠的思考过程
│     │           ├── ToolCallsPanel  -- 工具调用列表
│     │           ├── AttachmentCard[] -- 文件附件卡片
│     │           ├── MessageContent  -- Markdown + Mermaid 渲染
│     │           └── SuggestionChips -- 后续建议按钮
│     ├── InputBar               -- 文本输入 + 附件上传 + 思考模式开关 + 发送
│     └── PluginBar              -- 可用插件列表（手动调用）
├── SettingsDialog               -- 管理员面板（需密钥认证）
│     ├── BrandingTab            -- 应用名称、Favicon、背景图
│     ├── ModelTab               -- API 地址、密钥、模型
│     ├── PromptTab              -- 系统提示词
│     ├── PluginsTab             -- 插件管理
│     ├── SkillsTab              -- 技能管理
│     └── StatsTab               -- 统计面板（用户/对话/消息 + 浏览）
├── MenuDialog                   -- 用户菜单
│     ├── 语言切换
│     ├── 主题切换
│     ├── 管理设置入口
│     ├── 修改 PIN
│     └── 登出
└── ChangePinDialog              -- 修改 PIN（旧 PIN + 新 PIN + 确认）
```

## 认证模型

```
用户层：
  用户名 + 4 位 PIN
  PIN → PBKDF2（SHA-512, 10000 次, 随机 16 字节盐）→ settings 表 (pin:{username})
  验证成功 → signUserToken() → JWT (HS256, 30天, role:'user', sub:username)
  请求 → Authorization: Bearer <jwt>
  userAuthMiddleware → verifyUserToken() → c.set('userId', username)
  回退：无 JWT 时接受 X-User 头（向后兼容）

管理员层：
  POST /api/admin/auth + ADMIN_KEY → JWT (HS256, 24h, role:'admin')
  后续请求 → Authorization: Bearer <jwt>
  adminAuthMiddleware → verifyAdminToken()
  ⚠️ API Key 明文返回（脱敏未实现，见 specs/module-admin.md 已知缺陷）

安全细节：
  - PBKDF2 10000 次迭代 + SHA-512
  - timingSafeEqual 防止时序攻击
  - ADMIN_KEY 永远不暴露给前端
  - 两种 JWT 共用同一个签名密钥（ADMIN_KEY 的 UTF-8 字节）
```

## 部署架构

```
开发模式：
  Vite Dev Server (:5173)  ──proxy──→  Hono (:3001)

生产模式：
  Hono (:3001)  ── 直接托管 ──→  dist/client/ 静态文件
              └── API 路由 ──→  /api/*
```
