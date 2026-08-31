# Open Agent

轻量级、可自托管的 Web AI 智能体平台。与 AI 对话，通过插件扩展工具能力，通过技能注入系统提示词，一切由管理员密钥统一管理。

## 核心特性

- **流式对话** — React + shadcn/ui 聊天界面，SSE 实时流式输出（token、思考过程、工具调用）
- **插件系统** — JSON 清单 + TS/JS 模块，支持 function calling 自动调用
- **技能系统** — SKILL.md 文件注入系统提示词，为 AI 注入领域知识
- **Mermaid 图表** — AI 回复中的 mermaid 代码块自动渲染为图表
- **后续建议** — AI 每次回复末尾自动生成 3 条可点击的追问建议
- **管理员面板** — 密钥认证 + JWT，在线修改模型、提示词、品牌、插件/技能
- **持久化存储** — SQLite 单文件数据库，对话历史自动保存
- **国际化** — 中文/英文双语支持

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key 和管理员密钥

# 开发模式（Vite 5173 + Hono 3001 同时启动）
pnpm dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001

## 环境变量

编辑 `.env`：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ADMIN_KEY` | （必填） | 管理员密钥，用于访问管理面板 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 API 地址 |
| `OPENAI_API_KEY` | | API 密钥 |
| `OPENAI_MODEL` | `gpt-4o` | 模型名称 |
| `PORT` | `3001` | 服务端端口 |

## 管理面板

点击侧边栏 ⚙️ 图标，输入 `ADMIN_KEY` 后可访问：

- **品牌** — 修改应用名称和 Favicon
- **模型** — 修改 API 地址、密钥、模型名称
- **提示词** — 编辑系统提示词
- **插件** — 上传/卸载插件（.zip 文件）
- **技能** — 上传/卸载技能（.zip 文件）

## 插件开发

插件放在 `plugins/` 目录下：

```
plugins/my-plugin/
├── plugin.json    # 清单文件：名称、版本、工具定义
├── index.ts       # 导出 execute(toolName, input) 函数
└── README.md
```

**plugin.json：**
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "一个有用的插件",
  "tools": [
    {
      "name": "search",
      "description": "搜索某些内容",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "搜索关键词" }
        },
        "required": ["query"]
      }
    }
  ]
}
```

**index.ts：**
```typescript
export async function execute(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  if (toolName === 'search') {
    return { results: [`搜索结果: ${input.query}`] }
  }
  throw new Error(`Unknown tool: ${toolName}`)
}
```

工具在 AI 调用时自动以 `{插件名}_{工具名}` 格式暴露（如 `my-plugin_search`）。

## 技能开发

技能放在 `skills/` 目录下：

```
skills/my-skill/
├── SKILL.md    # YAML 前置元数据 + Markdown 指令内容
└── README.md
```

**SKILL.md：**
```markdown
---
name: my-skill
description: 帮助处理 X 类任务
version: 1.0.0
---

当用户询问关于 X 的问题时，请遵循以下准则：
1. 首先确认用户的需求
2. 给出具体可行的建议
3. 提供相关示例
```

技能内容会在每次对话时自动注入系统提示词的 `## Available Skills` 部分。

## 生产部署

```bash
# 构建（前端 Vite + 后端 tsup）
pnpm build

# 启动生产服务（Hono 同时提供 API 和静态文件）
pnpm start
# 等效于 node dist/index.js
```

生产模式下 Hono 直接托管前端构建产物，无需额外的 Web 服务器。

## 技术栈

- **前端**：React 18 + shadcn/ui（Radix 原语 + Tailwind CSS）+ Vite 8（Rolldown）
- **后端**：Hono 4 + @libsql/client + Drizzle ORM
- **实时通信**：SSE（Server-Sent Events）
- **AI**：OpenAI 兼容的 Chat Completions API（流式 + function calling）
- **数据库**：SQLite（单文件，零配置）

## 项目结构

```
open-agent/
├── src/
│   ├── shared/          # 客户端与服务端共享的类型和常量
│   ├── client/          # React 前端（入口：main.tsx）
│   │   ├── components/  # UI 组件（shadcn/ui）和业务组件
│   │   ├── hooks/       # React Hooks（useChat、useAdmin、useTheme）
│   │   ├── lib/         # API 客户端、工具函数
│   │   ├── i18n/        # 国际化配置（zh-CN、en）
│   │   └── styles/      # 全局 CSS（主题变量、滚动条、Mermaid）
│   └── server/          # Hono 后端（入口：index.ts）
│       ├── ai/          # AI 提供商客户端 + function calling 循环
│       ├── plugins/     # 插件加载、执行、注册
│       ├── skills/      # 技能加载和注册
│       └── routes/      # API 路由（chat、conversations、admin、plugins）
├── plugins/             # 已安装的插件目录
├── skills/              # 已安装的技能目录
├── data/                # SQLite 数据库文件
└── docs/                # 项目文档
```
