# AGENTS.md — AI 助手上下文

## 项目概述

**AI 秘书**：宜搭低代码平台 + AI 大模型的企业数据分析助手。
核心差异化：AI 通过 **OpenAI function calling 协议**自主调用 4 个宜搭数据工具 + **DingPass 钉钉技能包**，实时查询、按需获取，不依赖 prompt 注入死数据。

## 技术栈速查

| 层 | 技术 | 关键文件 |
|---|---|---|
| 前端 | Vue 3 + @material/web (MWC) + Material You 动态配色 | `src/App.vue` |
| 后端 | Express（路由/AI 问答/登录/Skill 管理） | `server/index.mjs` |
| AI | OpenAI Chat Completions（`/v1/chat/completions` + function calling + stream） | `server/index.mjs:/api/chat` |
| 数据 | 宜搭 HTTP API（自建 YidaAPI 类，不依赖 OpenYida） | `server/yida-client.mjs` |
| 钉钉集成 | DingPass Skill（组织架构 + 考勤管理） | `src/dingpass/` |
| Skill 管理 | 自动发现和管理技能包 | `src/skill-manager.js` |
| 登录 | 双模式：本机 cookies / 钉钉 OAuth | `src/composables/useAuth.js` |

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
1. 前端 `useAuth` 启动 `fetch('/api/auth/config')` 取 `env` + `loginMode`
2. `ENV=dev` → 前端自动调 `/api/whoami` 拿内置 dev 用户 → 直接进主界面（无登录页）
3. `local` → LoginPage「本机免登」→ `/api/whoami`（读 `.cache/cookies-public.json`）
4. `dingtalk` → LoginPage「钉钉登录」→ 跳转 `login.dingtalk.com/oauth2/auth` → `/api/auth/dingtalk/callback` 换身份

### AI 问答 — OpenAI function calling 循环

```
用户提问 → POST /api/chat
  │
  ▼
messages = [system prompt（角色+规则+模块元数据索引）, ...history, user message, ...toolMessages]
  │
  ▼
POST {OPENAI_BASE_URL}/chat/completions { model, messages, tools: [...8个...], stream: true }
  │
  ▼  SSE 流解析：choices[0].delta.content / reasoning_content / tool_calls
  │   ├─ content → token 事件（追问块 ```suggestions 实时扣留，避免前端泄出）
  │   ├─ reasoning_content → thinking 事件（可折叠）
  │   └─ tool_calls → 按 index 累积 function.arguments
  │
  ▼
finish_reason:
  ├─ "tool_calls" → executeTool(name, input) → 实时调 yida/dingpass
  │               → tool_call + tool_result 事件发前端
  │               → assistant(tool_calls) + tool(results) 注回 messages
  │               → 循环回到 POST /chat/completions（最多 5 轮）
  └─ "stop" → parseSuggestions(finalReply) → done 事件 {reply, suggestions, toolCalls[]}
```

### 8 个 Tools（`server/index.mjs:TOOLS` + `yida-client.mjs:executeTool`）

| 工具 | 输入 | 返回 |
|---|---|---|
| `yida_app_list` | — | `{apps: [{appType, appName}], total}` |
| `yida_form_list` | `{appType}` | `{forms: [{formUuid, formName, formType}], total}` |
| `yida_form_data` | `{appType, formUuid, formType, page?, size?}` | `{records: [...原数据+_summary], count, total}` |
| `yida_form_schema` | `{appType, formUuid}` | `{formUuid, components: [{id, type, label}], count}` |

所有工具直接调宜搭内部 HTTP API（`YidaAPI` 类），**零 OpenYida 依赖**。

### DingPass 钉钉技能包（`src/dingpass/`）

DingPass 提供钉钉组织架构和考勤管理的真实 API 接口，任何 Agent 都可以通过标准化调用方式使用喵～

**核心模块：**
- **organization**：部门管理、员工查询
  - `list_departments` - 列出部门
  - `get_employee` - 获取员工信息
  - `search_employee` - 搜索员工
- **attendance**：打卡记录、请假、加班
  - `get_checkin_records` - 查询打卡记录
  - `submit_leave` - 提交请假
  - `get_attendance_stats` - 考勤统计

**AI 可调用的 DingPass tools：**
- `dingpass_organization_list_departments` - 查询组织架构
- `dingpass_organization_get_employee` - 查询员工详情
- `dingpass_attendance_get_checkin_records` - 查询打卡记录
- `dingpass_attendance_get_stats` - 查询考勤统计

**Skill 管理（`src/skill-manager.js`）：**
- 自动扫描 `docs/` 目录下的 SKILL.md 文件
- 提供 `/api/skills` 端点列出所有可用 skills
- 提供 `/api/skill/call` 端点调用指定 skill

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
- **Material You 令牌**：颜色由 `src/composables/useTheme.js` 动态生成（种子色 → HCT → `SchemeTonalSpot` → `--md-sys-color-*`），写入 `:root` inline + `[data-theme="dark"]` 样式规则；形状/阴影/字体在 `src/styles/tokens.css`
- **MWC 组件**：`src/md.js` 批量 self-register，直接消费动态 `--md-sys-color-*`，换色即重染
- **无路由库**：纯状态驱动（`isLoggedIn` / `isCallbackPage`）
- **会话持久化**：`localStorage['ai-secretary-conversations']` / `['ai-secretary-user']`
- **消息结构**：`{role, content, module, cacheHit, suggestions[], thinking, toolCalls[{name, input, result}]}`
- **不依赖 OpenYida**：所有工具 + HTTP 客户端自实现，`package.json` 无 openyida 依赖

## .env 变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 API 地址 |
| `OPENAI_API_KEY` | — | API 密钥（Bearer token） |
| `OPENAI_MODEL` | `gpt-4o` | 模型名称 |
| `AI_THINKING_BUDGET` | `0` | 模型推理模式（0=关闭，>0 启用 reasoning_effort=high） |
| `ENV` | — | `dev` = 完全免登（自动 dev 用户，跳过登录页，仅开发调试用）；留空则走 LOGIN_MODE 正式登录 |
| `LOGIN_MODE` | `dingtalk` | `local` / `dingtalk`（仅 ENV 留空时生效） |
| `DINGTALK_CLIENT_ID` | — | 钉钉 AppKey（钉钉 OAuth + DingPass 都需要） |
| `DINGTALK_CLIENT_SECRET` | — | 钉钉 AppSecret |
| `DINGTALK_REDIRECT_URI` | `http://localhost:5173/callback` | 回调地址 |
| `DINGTALK_AGENT_ID` | — | 钉钉应用 AgentId（DingPass 需要） |
| `PORT` | `3001` | 后端监听端口 |

## 目录细节

```
yida-agent/
├── start.mjs             # 一键全栈（装依赖 + 检查 Key + spawn 前后端）
├── server/
│   ├── index.mjs          # 路由 + 登录 + /api/chat function calling 循环 + Skill API（~600 行）
│   └── yida-client.mjs    # YidaAPI HTTP 客户端 + executeTool + 元数据缓存（~210 行）
├── src/
│   ├── main.js           # Vue 入口（createApp + MWC 注册 + 动态配色 bootstrap）
│   ├── App.vue           # 根路由（登录/回调/主界面）
│   ├── md.js            # MWC 组件批量 self-register
│   ├── i18n.js          # I18N + t()
│   ├── skill-manager.js  # Skill 自动发现和管理
│   ├── composables/
│   │   ├── useTheme.js   # Material You 动态配色（HCT → SchemeTonalSpot → --md-sys-color-*）
│   │   ├── useAuth.js    # 双模式认证
│   │   └── useChat.js    # SSE 流式对话（meta/token/thinking/tool_call/tool_result/done）
│   ├── utils/
│   │   └── markdown.js   # 轻量 markdown 渲染（h() 渲染函数）
│   ├── components/       # *.vue SFC 组件群（MainApp/TheSidebar/TopBar/HomeView/ChatView/MessageBubble/MessageContent/MermaidChart/ThinkingBlock/ToolCallsPanel/LoginPage/CallbackPage）
│   ├── styles/
│   │   ├── tokens.css    # 静态令牌（形状/阴影/字体/布局，颜色由 useTheme 动态生成）
│   │   └── app.css       # 组件样式
│   └── dingpass/         # DingPass 钉钉技能包实现
│       ├── index.js           # 主入口
│       ├── dingtalk-client.js # 钉钉 API 客户端
│       ├── organization.js    # 组织架构模块
│       └── attendance.js      # 考勤管理模块
├── docs/
│   └── dingpass/         # DingPass 文档
│       ├── SKILL.md      # Skill 规范
│       └── README.md     # 使用说明
├── tools/                # Playwright cookies 提取 / 应用探测 / 手动导出
├── .cache/               # cookies-public.json（gitignored）
└── .env                  # 环境变量（gitignored）
```

## 注意事项

1. **Function calling 工具全部自实现**：`YidaAPI` 类 ≈ 100 行 HTTP 封装，`executeTool` ≈ 40 行 switch。不依赖 OpenYida CLI/Skill，服务器只需 `.cache/cookies-public.json`
2. **DingPass 钉钉技能包**：基于钉钉真实 API 实现，需要配置 `DINGTALK_CLIENT_ID`、`DINGTALK_CLIENT_SECRET`、`DINGTALK_AGENT_ID`。提供组织架构和考勤管理的完整 CRUD 接口
3. **cookie 认证**：宜搭 API 走 Cookie + CSRF Token；cookie 过期后钉钉 OAuth 会接管，当前无自动刷新机制
4. **会话无后端存储**：对话只在 `localStorage`，清缓存即丢
5. **function calling 最多 5 轮**：防止死循环，单次回答最多 5 轮工具调用
6. **追问块实时扣留**：流式 text_delta 在 `server/index.mjs` 层检测 ```` ```suggestions ```` 并扣留，避免前端看到原始标记
7. **thinking 默认关闭**：`.env` `AI_THINKING_BUDGET=0`，需手动设 >0 开启 reasoning_effort
8. **Skill 自动发现**：`src/skill-manager.js` 扫描 `docs/` 下的 SKILL.md，支持动态加载和管理
9. **Material You 动态配色**：`src/composables/useTheme.js` 从种子色经 HCT → `SchemeTonalSpot` 生成完整 M3 色阶，写入 `--md-sys-color-*`；MWC 组件直接消费这些令牌，换色即全量重染。种子色与 light/dark 模式持久化在 localStorage
10. **MWC 组件**：`src/md.js` 批量 self-register，模板用 `<md-icon>`/`<md-filled-button>` 等；图标统一用 Material Symbols ligature（非手绘 SVG）
11. **Vue 响应式流式**：`useChat` 流式更新直接改 live 消息对象属性（`msgs[len-1] = {...patch}`），触发 Vue 3 深响应式追踪，避免每 token 整数组重建
