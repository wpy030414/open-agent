# Spec — 技能系统（Skill System）

## 概述

技能系统通过 SKILL.md 文件将领域知识和行为指令注入 AI 的系统提示词，使 AI 在特定场景下遵循预定义的准则。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/server/skills/loader.ts` | 加载技能文件 + 解析前置元数据 + 注册表 |
| `src/server/ai/loop.ts` | `buildSystemPrompt()` 中将技能内容注入系统提示词 |
| `src/server/routes/admin.ts` | 管理员上传/卸载技能 |

## 技能目录结构

```
skills/{skill-name}/
├── SKILL.md    # 前置元数据 + Markdown 指令（必须）
└── README.md   # 文档（可选）
```

## SKILL.md 格式

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

注意事项：
- 不要编造数据
- 始终引用可靠来源
```

### 前置元数据字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 技能名称（唯一标识） |
| `description` | ✅ | 技能描述 |
| `version` | ❌ | 版本号 |

## 行为约束

### 加载

1. 扫描 `skills/` 目录下的子文件夹
2. 读取每个子文件夹的 `SKILL.md`
3. 解析 YAML 前置元数据（简易解析器，仅支持扁平 `key: value`）
4. 提取元数据后的 Markdown 正文作为技能内容
5. 启动时自动加载，通过 `SkillRegistryClass.refresh()` 刷新

### 注入系统提示词

在 `buildSystemPrompt()` 中：

```
{config.system_prompt}

## Available Skills

### {skill.manifest.name}
{skill.content}

### {skill2.manifest.name}
{skill2.content}

## 输出格式（最高优先级，不得省略）
...（硬编码的 suggestions 格式指令）
```

- 技能按注册表顺序追加
- 每个技能以 `### {name}` 作为二级标题
- 技能内容之后追加系统级的输出格式指令（优先级最高）

### 上传

1. 管理员通过 `POST /api/admin/skills/upload` 上传 zip 文件
2. 最大 50MB
3. Zip slip 防护
4. 验证 `SKILL.md` 存在且包含有效的 YAML 前置元数据
5. `name` 字段必填
6. 解压到 `skills/{name}/`

### 卸载

1. `DELETE /api/admin/skills/:name`
2. 递归删除目录
3. 刷新注册表

## API 端点

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/admin/skills` | JWT | 列出已安装技能 |
| POST | `/api/admin/skills/upload` | JWT | 上传技能 zip |
| POST | `/api/admin/skills/install` | JWT | 安装已有目录 |
| DELETE | `/api/admin/skills/:name` | JWT | 卸载技能 |
