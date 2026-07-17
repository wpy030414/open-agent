# AI 秘书 Web 原型

> Material Design 3 · ChatGPT 风格 · 钉钉身份识别 + 宜搭多业务数据 + DeepSeek 智能问答 + Mermaid 图表

## 功能特性

- Material Design 3 (MD3) 设计语言，官方 Web Components
- ChatGPT 风格交互：首页问候 + 输入框，对话式问答
- 对话管理：侧边栏新建对话、历史记录（localStorage 持久化）
- 智能路由：AI 自动识别问题意图，定向调取业务模块数据
- 多业务模块：销售 / 财务 / HR / 项目四大模块
- 定时缓存：每 6 小时自动预计算中间结果，问答秒级响应
- Mermaid 图表：AI 分析结果自动生成架构图 / 流程图 / 甘特图等
- DeepSeek 模型：默认使用本机配置的 DeepSeek

## 一键启动

```bash
node start.mjs
```

启动后访问: **http://localhost:5173**

## 配置说明

系统默认使用环境变量中的 DeepSeek 配置：

```bash
# 可选：自定义模型（默认 deepseek-v4-pro）
export AI_MODEL=deepseek-v4-pro
```

> 后端会读取 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 调用 DeepSeek。

## 项目结构

```
yida-agent/
├── start.mjs              # 一键启动脚本
├── server.mjs             # 后端服务（Express + 定时任务 + DeepSeek 代理）
├── vite.config.js         # Vite 配置
├── index.html             # 入口 HTML
└── src/
    ├── main.jsx           # React 入口
    ├── App.jsx            # 主应用（MD3 + ChatGPT 风格）
    ├── styles.css         # MD3 暗色主题样式
    └── components/
        └── MermaidChart.jsx   # Mermaid 图表渲染组件
```

## 架构说明

```
┌─────────────────────────────────────────────┐
│  用户输入问题                                │
├─────────────────────────────────────────────┤
│  ① 意图识别（关键词匹配）                    │
│     → 判断用户想看哪个业务模块               │
├─────────────────────────────────────────────┤
│  ② 数据调取                                  │
│     → 从缓存读取对应模块预计算结果           │
├─────────────────────────────────────────────┤
│  ③ AI 分析（DeepSeek）                       │
│     → 注入模块数据 + 用户问题 → 生成回答     │
│     → 支持生成 mermaid 图表                  │
├─────────────────────────────────────────────┤
│  ④ 定时预计算（每 6 小时）                   │
│     → 后台刷新各模块中间结果                 │
└─────────────────────────────────────────────┘
```

## 定时任务

- 频率：每 6 小时
- 内容：预计算各模块中间结果（销售总额 / 利润 / 绩效分布 / 项目进度等）
- 效果：用户问答时直接读缓存，无需现场聚合，毫秒级响应

## 技术栈

- **前端**: React 18 + MWC (Material Web Components) + Vite + Mermaid
- **后端**: Express + Node.js 内置定时器
- **AI**: DeepSeek（通过 Anthropic 兼容代理）

## 后续扩展建议

1. 接入真实宜搭数据 API（替换 `server.mjs` 中的 `RAW_DATA`）
2. 对接钉钉 JSAPI 获取真实用户身份
3. 接入宜搭「集成自动化」实现真实定时任务
4. 增加更多业务模块
5. 意图识别升级为 LLM 语义理解
