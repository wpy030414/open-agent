# Spec — 技能系统（Skill System）

## 概述

技能系统通过 SKILL.md 文件为 AI 提供领域知识和行为指令。系统提示词中**仅注入技能摘要**（名称 + 描述），完整内容由 AI 按需通过 `load_skill` 工具加载，避免提示词膨胀。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/server/skills/loader.ts` | 加载技能文件 + 解析前置元数据 + 注册表 |
| `src/server/ai/loop.ts` | `buildSystemPrompt()` 中注入技能摘要 |
| `src/server/tools/skill-tools.ts` | `load_skill` / `list_skill_files` 工具实现 |
| `src/server/routes/admin.ts` | 管理员上传/卸载技能 |

## 技能目录结构

```
skills/{skill-name}/
├── SKILL.md        # 前置元数据 + Markdown 指令（必须）
├── references/     # 参考资料（可选）
│   └── *.md
├── skills/         # 子技能（可选）
│   └── */SKILL.md
└── README.md       # 文档（可选）
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

### 注入系统提示词（摘要模式）

在 `buildSystemPrompt()` 中，**仅注入名称和描述**：

```
{config.system_prompt}

## Available Skills
以下是已安装的技能摘要。如需查看某个技能的完整内容，请调用 load_skill 工具。

- **{skill.manifest.name}**: {skill.manifest.description}
- **{skill2.manifest.name}**: {skill2.manifest.description}

## 输出格式（最高优先级，不得省略）
...（硬编码的 suggestions 格式指令）
```

- 技能按注册表顺序列出
- 每个技能仅一行：`- **{name}**: {description}`
- 完整内容通过 `load_skill` 工具按需加载

### 按需加载工具

#### `load_skill`

- **参数**：`name`（技能名称），`path`（可选，默认 `SKILL.md`）
- **行为**：读取技能目录下指定文件的完整内容
- **返回**：文件内容（截断至 50K 字符）+ 技能目录下所有文件列表
- **安全**：路径验证防止穿越到技能目录外

#### `list_skill_files`

- **参数**：`name`（技能名称）
- **行为**：列出技能目录下所有可读文件（`.md`、`.txt`、`.json`、`.yaml` 等）
- **用途**：AI 发现 `references/`、子技能等额外资源

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
