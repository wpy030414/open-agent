# AI 秘书 Web 原型

> Material Design 3 · 宜搭业务数据 · AI MCP 工具调用 · 钉钉身份识别 · 思考过程可见

## 功能特性

- **MCP 式工具调用**：AI 模型自主决定何时调用宜搭数据工具（4 个 tools），实时查询、按需获取，不再被 prompt 里 5 条死数据限制
- **思考过程可见**：模型推理链（thinking）流式展示，可折叠查看
- **Material Design 3 (MD3)** 设计语言，自适应明暗主题
- **双模式登录**：开发环境本机免密（读宜搭 cookies）/ 生产环境钉钉标准 OAuth
- **对话管理**：侧边栏新建/切换/删除对话（localStorage 持久化）
- **追问建议**：每次回答自动生成 3 个相关快捷提问按钮
- **Mermaid 图表**：AI 分析结果自动渲染架构图 / 流程图 / 甘特图等
- **白标化**：产品名/文案集中在 `src/i18n.js`，改一处全局生效
- **零 OpenYida 依赖**：工具调用全在项目内自实现（`server/yida-client.mjs`），不依赖外部 CLI/Skill

## 一键启动

```bash
npm install        # 首次
npm run dev        # 启动后端 + 前端
# 或
node start.mjs     # 带自动装依赖 + API Key 检查
```

- 前端：**http://localhost:5173**
- 后端：**http://localhost:3001**

## 配置说明

在项目根目录 `.env`（已 gitignore）中配置：

```bash
# ===== AI 模型 =====
ANTHROPIC_BASE_URL=http://127.0.0.1:15721   # Anthropic 兼容 API 地址
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED           # API 认证令牌
AI_MODEL=deepseek-v4-pro                     # 模型名称

# ===== 思考过程（可选） =====
# 设 >0 开启模型 extended thinking，token 预算建议 2000-4000
AI_THINKING_BUDGET=0

# ===== 登录方式 =====
LOGIN_MODE=local                             # local=本机免密 / dingtalk=钉钉 OAuth

# 钉钉登录凭证（仅 LOGIN_MODE=dingtalk 时必填）
DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
DINGTALK_REDIRECT_URI=http://localhost:5173/callback
```

### 登录说明

| 模式 | 触发条件 | 流程 |
|---|---|---|
| **本机免密** | `LOGIN_MODE=local` | 读取 `.cache/cookies-public.json` → `/api/whoami` 拿身份 |
| **钉钉标准** | `LOGIN_MODE=dingtalk` | 跳转钉钉授权页 → code 回跳 → `/api/auth/dingtalk/callback` 换身份 |

开发时 **宜搭 cookies 获取**：见 `tools/`（Playwright 自动提取 / 浏览器手动导出）

## 架构说明

```
┌──────────────────────────────────────────────────────────────────┐
│  用户输入：「采购申请有多少待处理？」                               │
├──────────────────────────────────────────────────────────────────┤
│  ① 身份识别                                                      │
│     本机免密 / 钉钉 OAuth → 拿到 userName / role / dept           │
├──────────────────────────────────────────────────────────────────┤
│  ② AI MCP 工具调用循环（server/index.mjs:/api/chat）               │
│     POST {ANTHROPIC_BASE_URL}/v1/messages                        │
│       带 system prompt（角色+模块元数据索引+4 个 tool schema）      │
│     ┌─ stop_reason: "tool_use"                                   │
│     │  → executeTool("yida_form_data", {appType, formUuid, …})   │
│     │  → server/yida-client.mjs 实时调宜搭 API                     │
│     │  → 结果 JSON 注回对话 → 模型继续推理                          │
│     └─ stop_reason: "end_turn" → 最终回答                          │
├──────────────────────────────────────────────────────────────────┤
│  ③ AI 回答（SSE 流式）                                            │
│     token 事件 → 前端实时渲染                                      │
│     thinking 事件 → 思考过程可折叠查看                              │
│     tool_call / tool_result 事件 → 工具调用链可视化                 │
│     done 事件 → 追问建议（```suggestions 块）渲染为 3 个胶囊按钮    │
├──────────────────────────────────────────────────────────────────┤
│  ④ 模块元数据索引（每 6 小时定时刷新）                              │
│     buildModuleIndex() → 只存 formUuid/formName/appType/formType  │
│     不存 record，供模型在 system prompt 中快速导航                  │
└──────────────────────────────────────────────────────────────────┘
```

## MCP 工具清单（4 个）

| 工具名 | 参数 | 用途 |
|---|---|---|
| `yida_app_list` | — | 列出所有宜搭应用 |
| `yida_form_list` | `appType` | 列出应用下的表单（含 formUuid/formType） |
| `yida_form_data` | `appType, formUuid, formType, page?, size?` | **实时**查询表单数据（最多 50 条/次） |
| `yida_form_schema` | `appType, formUuid` | 获取表单字段定义 |

> 工具全部实现在 `server/yida-client.mjs` 的 `executeTool()` 函数，直接调宜搭内部 HTTP API，**不依赖 OpenYida CLI/Skill**。

## 项目结构

```
yida-agent/
├── start.mjs                  # 一键启动（自动装依赖 + 检查 Key）
├── vite.config.js             # Vite 配置（API 代理 :5173→:3001，构建单文件）
├── index.html                 # 入口 HTML
├── .env                       # 环境变量（gitignored）
├── server/
│   ├── index.mjs              # 后端路由 + 登录 + /api/chat tool_use 循环（~500 行）
│   └── yida-client.mjs        # 宜搭 HTTP 客户端 + MCP 工具执行 + 元数据缓存（~210 行）
├── src/
│   ├── main.jsx               # React 入口
│   ├── App.jsx                # 对话/首页/追问按钮/thinking/tool_calls 渲染
│   ├── i18n.js                # 白标化文案
│   ├── icons.jsx              # SVG 图标
│   ├── styles.css             # MD3 令牌 + 全局样式（含思考/工具调用折叠块）
│   ├── hooks/useAuth.js       # 双模式认证 Hook
│   └── components/
│       ├── LoginPage.jsx      # 登录页
│       ├── CallbackPage.jsx   # 钉钉 OAuth 回调
│       └── MermaidChart.jsx   # Mermaid 图表渲染
└── tools/                     # 开发辅助
    ├── export-yida-cookies.cjs
    ├── discover-apps.cjs
    └── export-cookies.html
```

## API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/whoami` | 本机宜搭 cookies → 身份 |
| GET | `/api/auth/config` | 登录模式 + 钉钉参数（不含 secret） |
| POST | `/api/auth/dingtalk/callback` | 钉钉 code → 身份 |
| **POST** | **`/api/chat`** | **AI 问答（SSE 流式：token / thinking / tool_call / tool_result / done）** |
| GET | `/api/cache` | 全部模块元数据索引 |
| GET | `/api/cache/:module` | 指定模块元数据 |
| POST | `/api/cache/refresh` | 手动刷新模块索引 |

### SSE 事件类型

| type | 说明 |
|---|---|
| `meta` | 元信息（dataSource / modulesCount） |
| `token` | 回答文本增量 |
| `thinking` | 模型推理过程文本增量 |
| `tool_call` | 模型发起工具调用（name + input） |
| `tool_result` | 工具执行结果摘要 |
| `done` | 回答结束（reply + suggestions + toolCalls[]） |
| `error` | 错误信息 |

## 技术栈

- **前端**：React 18 + Vite + MD3 CSS 令牌 + Mermaid
- **后端**：Express + Node.js 原生 fetch
- **AI 协议**：Anthropic `/v1/messages`（tool_use + stream + thinking），代理兼容
- **数据源**：宜搭内部 HTTP API（自建 YidaAPI 类，不依赖 OpenYida）
- **部署**：只需 `.env` + `.cache/cookies-public.json`，`npm run serve` 即跑

## 工具脚本

```bash
node tools/export-yida-cookies.cjs   # Playwright 登录 → cookies → .cache/
node tools/discover-apps.cjs         # 探测宜搭应用/自定义页面
open tools/export-cookies.html       # 浏览器手动导出（备选）
```

## 后续扩展

1. tool_use 结果增加聚合/统计（count/groupBy），减少模型多轮调用
2. 钉钉 JSAPI 扫码登录（替代整页跳转）
3. 支持多语言（i18n.js 扩展）
4. MCP 工具扩展：数据写入（create/update）、审批操作
