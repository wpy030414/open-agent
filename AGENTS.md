# AGENTS.md — AI 助手上下文

## 项目概述

**AI 秘书**：宜搭低代码平台 + AI 大模型的企业数据分析助手。
核心差异化：AI 通过 **Anthropic tool_use 协议**自主调用 4 个宜搭数据工具，实时查询、按需获取，不依赖 prompt 注入死数据。

## 技术栈速查

| 层 | 技术 | 关键文件 |
|---|---|---|
| 前端 | React 18 + Vite + MD3 CSS 令牌 | `src/App.jsx` |
| 后端 | Express（路由/AI 问答/登录） | `server/index.mjs` |
| AI | DeepSeek v4（Anthropic 兼容 `/v1/messages` + tool_use + stream） | `server/index.mjs:/api/chat` |
| 数据 | 宜搭 HTTP API（自建 YidaAPI 类，不依赖 OpenYida） | `server/yida-client.mjs` |
| 登录 | 双模式：本机 cookies / 钉钉 OAuth | `src/hooks/useAuth.js` |

## 启动

```bash
npm run serve     # 仅后端 :3001
npm run dev       # 仅前端 vite :5173
npm run build     # 打包 dist/（1 HTML + 1 CSS + 1 JS）
node start.mjs    # 一键全栈（自动装依赖 + 检查 Key + 前后端同跑）
```

- Vite 自动代理 `/api/*` → `:3001`
- **改 `server/` 或 `.env` 必须重启后端**（`npm run serve` / `start.mjs`）

## 核心流程

### 登录
1. 前端 `useAuth` 启动 `fetch('/api/auth/config')` 取 `loginMode`
2. `local` → LoginPage「本机免登」→ `/api/whoami`（读 `.cache/cookies-public.json`）
3. `dingtalk` → LoginPage「钉钉登录」→ 跳转 `login.dingtalk.com/oauth2/auth` → `/api/auth/dingtalk/callback` 换身份

### AI 问答 — MCP tool_use 循环

```
用户提问 → POST /api/chat
  │
  ▼
system prompt = 角色 + 规则 + 模块元数据索引（formUuid/formName/appType/formType，无 record）
  │
  ▼
POST {ANTHROPIC_BASE_URL}/v1/messages { model, system, messages, tools: [...4个...], stream: true }
  │
  ▼  SSE 流解析：content_block_start / content_block_delta / content_block_stop / message_delta
  │   ├─ text_delta → token 事件（追问块 ```suggestions 实时扣留，避免前端泄出）
  │   ├─ thinking_delta → thinking 事件（可折叠）
  │   └─ input_json_delta → 累积 tool_use 参数
  │
  ▼
stop_reason:
  ├─ "tool_use" → executeTool(name, input) → 实时调 yida.getApps/getForms/queryFormData/getFormSchema
  │               → tool_call + tool_result 事件发前端
  │               → assistant(tool_use) + user(tool_result) 注回 messages
  │               → 循环回到 POST /v1/messages（最多 5 轮）
  └─ "end_turn" → parseSuggestions(finalReply) → done 事件 {reply, suggestions, toolCalls[]}
```

### 4 个 MCP 工具（`server/yida-client.mjs:executeTool`）

| 工具 | 输入 | 返回 |
|---|---|---|
| `yida_app_list` | — | `{apps: [{appType, appName}], total}` |
| `yida_form_list` | `{appType}` | `{forms: [{formUuid, formName, formType}], total}` |
| `yida_form_data` | `{appType, formUuid, formType, page?, size?}` | `{records: [...原数据+_summary], count, total}` |
| `yida_form_schema` | `{appType, formUuid}` | `{formUuid, components: [{id, type, label}], count}` |

所有工具直接调宜搭内部 HTTP API（`YidaAPI` 类），**零 OpenYida 依赖**。

### 模块元数据缓存（`server/yida-client.mjs:buildModuleIndex`）
- 启动 + 每 6h：`getApps()` → `getForms()`，只存 **formUuid/formName/appType/formType**，不拉 record
- 写入 `CACHE.modules` → system prompt 里列出，供模型导航
- **实时数据必须通过工具查询**，不注入 prompt

### 追问建议
- system prompt 要求末尾 `` ```suggestions\nq1\nq2\nq3\n``` ``
- 流式 text_delta 实时扣留 fence 后内容 → 最终 `parseSuggestions()` 剥离 → done 事件带回
- 前端只在最后一条 assistant 下方渲染 3 个胶囊按钮

## 设计约定

- **白标化**：产品名/文案在 `src/i18n.js` `I18N` 对象，`t()` 取值。LoginPage/CallbackPage 部分中文硬编码
- **MD3 令牌**：颜色/形状/阴影/字体全部在 `src/styles.css` `:root` / `[data-theme="dark"]`
- **无路由库**：纯状态驱动（`isLoggedIn` / `isCallbackPage`）
- **会话持久化**：`localStorage['ai-secretary-conversations']` / `['ai-secretary-user']`
- **消息结构**：`{role, content, module, cacheHit, suggestions[], thinking, toolCalls[{name, input, result}]}`
- **不依赖 OpenYida**：所有工具 + HTTP 客户端自实现，`package.json` 无 openyida 依赖

## .env 变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:15721` | AI 模型代理地址 |
| `ANTHROPIC_AUTH_TOKEN` | `PROXY_MANAGED` | API 密钥 |
| `AI_MODEL` | `deepseek-v4-pro` | 模型名称 |
| `AI_THINKING_BUDGET` | `0` | 模型 extended thinking token 预算（0=关闭） |
| `LOGIN_MODE` | `dingtalk` | `local` / `dingtalk` |
| `DINGTALK_CLIENT_ID` | — | 钉钉 AppKey |
| `DINGTALK_CLIENT_SECRET` | — | 钉钉 AppSecret |
| `DINGTALK_REDIRECT_URI` | `http://localhost:5173/callback` | 回调地址 |
| `PORT` | `3001` | 后端监听端口 |

## 目录细节

```
yida-agent/
├── start.mjs             # 一键全栈（装依赖 + 检查 Key + spawn 前后端）
├── server/
│   ├── index.mjs          # 路由 + 登录 + /api/chat tool_use 循环（~500 行）
│   └── yida-client.mjs    # YidaAPI HTTP 客户端 + executeTool + 元数据缓存（~210 行）
├── src/
│   ├── App.jsx           # 对话/首页/thinking/tool_calls/追问按钮渲染
│   ├── i18n.js           # I18N + t()
│   ├── icons.jsx         # SVG 图标
│   ├── styles.css        # MD3 令牌 + 思考/工具调用折叠块样式
│   ├── hooks/useAuth.js  # 双模式认证
│   └── components/       # LoginPage / CallbackPage / MermaidChart
├── tools/                # Playwright cookies 提取 / 应用探测 / 手动导出
├── .cache/               # cookies-public.json（gitignored）
└── .env                  # 环境变量（gitignored）
```

## 注意事项

1. **MCP 工具全部自实现**：`YidaAPI` 类 ≈ 100 行 HTTP 封装，`executeTool` ≈ 40 行 switch。不依赖 OpenYida CLI/Skill，服务器只需 `.cache/cookies-public.json`
2. **cookie 认证**：宜搭 API 走 Cookie + CSRF Token；cookie 过期后钉钉 OAuth 会接管，当前无自动刷新机制
3. **会话无后端存储**：对话只在 `localStorage`，清缓存即丢
4. **tool_use 最多 5 轮**：防止死循环，单次回答最多 5 轮工具调用
5. **追问块实时扣留**：流式 text_delta 在 `server/index.mjs` 层检测 ```` ```suggestions ```` 并扣留，避免前端看到原始标记
6. **thinking 默认关闭**：`.env` `AI_THINKING_BUDGET=0`，需手动设 >0 开启
