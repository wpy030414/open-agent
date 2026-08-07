# AI 秘书 Web 原型

> Material Design 3 (Material You) · Vue 3 + MWC · 宜搭业务数据 + 钉钉组织架构/考勤 · AI function calling 工具调用 · DingPass Skill · 钉钉身份识别 · 思考过程可见

## 功能特性

- **Function calling 工具调用**：AI 模型自主决定何时调用宜搭数据工具（4 个 tools）+ DingPass 钉钉工具（4 个 tools），实时查询、按需获取，不再被 prompt 里 5 条死数据限制
- **DingPass 钉钉技能包**：基于钉钉真实 API 的组织架构和考勤管理，提供部门查询、员工信息、打卡记录、考勤统计等功能
- **Skill 自动发现**：`src/skill-manager.js` 自动扫描并加载 `docs/` 下的 skills，支持动态扩展
- **思考过程可见**：模型推理链（thinking）流式展示，可折叠查看
- **Material You 动态配色**：基于 HCT 色彩系统从种子色生成完整 M3 色阶，用户可在侧边栏底部换色（6 个内置色板 + 自定义取色器），换色后所有 MWC 组件全量重染
- **MWC 组件**：采用 Google 官方 @material/web 组件（md-button/md-icon/md-list/md-text-field 等），内置状态层、ripple、expressive 形状
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
# ===== AI 模型（OpenAI 兼容 API） =====
OPENAI_BASE_URL=https://api.openai.com/v1     # OpenAI 兼容 API 地址
OPENAI_API_KEY=sk-...                          # API 密钥（Bearer token）
OPENAI_MODEL=gpt-4o                            # 模型名称

# ===== 思考过程（可选） =====
# 设 >0 开启模型 reasoning_effort=high（需模型支持）
AI_THINKING_BUDGET=0

# ===== 登录方式 =====
# ENV=dev 时完全免登：跳过登录页，自动使用内置 dev 用户（无需 cookies / 钉钉 OAuth），仅用于开发调试
ENV=
# ENV 留空时按 LOGIN_MODE 走正式登录：local=本机免密 / dingtalk=钉钉 OAuth
LOGIN_MODE=local

# 钉钉登录凭证（仅 LOGIN_MODE=dingtalk 时必填）
DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
DINGTALK_REDIRECT_URI=http://localhost:5173/callback

# ===== DingPass 钉钉技能包 =====
# DingPass 需要以下三个凭证（从钉钉开放平台获取）
DINGTALK_AGENT_ID=                           # 钉钉应用 AgentId
```

### 登录说明

| 模式 | 触发条件 | 流程 |
|---|---|---|
| **dev 免登** | `ENV=dev` | `/api/auth/config` 返回 env=dev → 前端自动调 `/api/whoami` 拿内置 dev 用户 → 直接进主界面（无需 cookies / OAuth） |
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
│  ② AI function calling 工具调用循环（server/index.mjs:/api/chat）               │
│     POST {OPENAI_BASE_URL}/chat/completions                                     │
│       带 system prompt（角色+模块元数据索引+8 个 function schema）                │
│     ┌─ finish_reason: "tool_calls"                                              │
│     │  → executeTool("yida_form_data", {appType, formUuid, …})                 │
│     │  → server/yida-client.mjs 实时调宜搭 API                                   │
│     │  → 结果 JSON 注回对话 → 模型继续推理                                       │
│     └─ finish_reason: "stop" → 最终回答                                          │
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

## Function calling 工具清单（4 个宜搭 + 4 个 DingPass）

### 宜搭工具

| 工具名 | 参数 | 用途 |
|---|---|---|
| `yida_app_list` | — | 列出所有宜搭应用 |
| `yida_form_list` | `appType` | 列出应用下的表单（含 formUuid/formType） |
| `yida_form_data` | `appType, formUuid, formType, page?, size?` | **实时**查询表单数据（最多 50 条/次） |
| `yida_form_schema` | `appType, formUuid` | 获取表单字段定义 |

> 工具全部实现在 `server/yida-client.mjs` 的 `executeTool()` 函数，直接调宜搭内部 HTTP API，**不依赖 OpenYida CLI/Skill**。

### DingPass 钉钉工具（需要配置钉钉凭证）

| 工具名 | 参数 | 用途 |
|---|---|---|
| `dingpass_organization_list_departments` | `parent_id, fetch_child?` | 查询组织架构部门列表 |
| `dingpass_organization_get_employee` | `userid` | 查询员工详细信息 |
| `dingpass_attendance_get_checkin_records` | `userid_list, check_date_from, check_date_to` | 查询打卡记录 |
| `dingpass_attendance_get_stats` | `userid, month` | 查询考勤统计 |

> DingPass 基于钉钉真实 API 实现，需要配置 `DINGTALK_CLIENT_ID`、`DINGTALK_CLIENT_SECRET`、`DINGTALK_AGENT_ID`。详见 [docs/dingpass/README.md](docs/dingpass/README.md)。

## 项目结构

```
yida-agent/
├── start.mjs                  # 一键启动（自动装依赖 + 检查 Key）
├── vite.config.js             # Vite 配置（API 代理 :5173→:3001，构建单文件）
├── index.html                 # 入口 HTML
├── .env                       # 环境变量（gitignored）
├── server/
│   ├── index.mjs              # 后端路由 + 登录 + /api/chat function calling 循环 + Skill API（~600 行）
│   └── yida-client.mjs        # 宜搭 HTTP 客户端 + function calling 工具执行 + 元数据缓存（~210 行）
├── src/
│   ├── main.js               # Vue 入口（createApp + MWC 注册 + 动态配色）
│   ├── App.vue                # 根路由（登录/回调/主界面）
│   ├── md.js                  # MWC 组件批量注册
│   ├── i18n.js                # 白标化文案
│   ├── skill-manager.js       # Skill 自动发现和管理
│   ├── composables/
│   │   ├── useTheme.js        # Material You 动态配色（HCT → Scheme → --md-sys-color-*）
│   │   ├── useAuth.js         # 双模式认证
│   │   └── useChat.js         # SSE 流式对话
│   ├── utils/
│   │   └── markdown.js        # 轻量 markdown 渲染（h()/renderInline）
│   ├── components/            # *.vue SFC 组件群
│   ├── styles/
│   │   ├── tokens.css         # 静态令牌（形状/阴影/字体/布局）
│   │   └── app.css            # 组件样式
│   └── dingpass/              # DingPass 钉钉技能包实现
│       ├── index.js           # 主入口
│       ├── dingtalk-client.js # 钉钉 API 客户端
│       ├── organization.js    # 组织架构模块
│       └── attendance.js      # 考勤管理模块
├── docs/
│   └── dingpass/              # DingPass 文档
│       ├── SKILL.md           # Skill 规范
│       └── README.md          # 使用说明
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
| **GET** | **`/api/skills`** | **列出所有可用的 skills** |
| **POST** | **`/api/skill/call`** | **调用指定 skill（如 dingpass）** |

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

- **前端**：Vue 3 + Vite + @material/web (MWC) + @material/material-color-utilities (Material You 动态配色) + Material Symbols + Mermaid
- **后端**：Express + Node.js 原生 fetch
- **AI 协议**：OpenAI `/v1/chat/completions`（function calling + stream），兼容各类 OpenAI 风格服务端（DeepSeek、vLLM、OpenRouter 等）
- **数据源**：宜搭内部 HTTP API（自建 YidaAPI 类，不依赖 OpenYida）
- **部署**：只需 `.env` + `.cache/cookies-public.json`，`npm run serve` 即跑

## 工具脚本

```bash
node tools/export-yida-cookies.cjs   # Playwright 登录 → cookies → .cache/
node tools/discover-apps.cjs         # 探测宜搭应用/自定义页面
open tools/export-cookies.html       # 浏览器手动导出（备选）
```

## 后续扩展

1. function calling 结果增加聚合/统计（count/groupBy），减少模型多轮调用
2. 钉钉 JSAPI 扫码登录（替代整页跳转）
3. 支持多语言（i18n.js 扩展）
4. function calling 工具扩展：数据写入（create/update）、审批操作
5. **DingPass Skill 扩展**：添加更多钉钉业务模块（审批流程、通讯录同步、智能表格等）
