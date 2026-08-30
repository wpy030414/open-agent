# Spec — 插件系统（Plugin System）

## 概述

插件系统允许通过 JSON 清单 + TS/JS 模块的方式扩展 AI 的工具调用能力。AI 通过 OpenAI function calling 协议自动发现和调用插件工具。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/server/plugins/loader.ts` | 从磁盘加载插件清单 |
| `src/server/plugins/executor.ts` | 动态导入并执行插件模块 |
| `src/server/plugins/registry.ts` | 插件内存注册表 |
| `src/server/ai/tools.ts` | 聚合工具定义 + 名称解析 |
| `src/server/routes/admin.ts` | 管理员上传/卸载插件 |
| `src/server/routes/plugins.ts` | 公开查询 + 手动调用 |

## 插件目录结构

```
plugins/{plugin-name}/
├── plugin.json    # 清单文件（必须）
├── index.ts       # 模块入口（.ts / .js / .mjs 均可）
└── README.md      # 文档（可选）
```

## 清单格式（plugin.json）

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "tools": [
    {
      "name": "tool-name",
      "description": "工具描述，AI 据此决定是否调用",
      "input_schema": {
        "type": "object",
        "properties": {
          "param1": { "type": "string", "description": "参数说明" }
        },
        "required": ["param1"]
      }
    }
  ]
}
```

## 模块接口

```typescript
// index.ts
export async function execute(
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown>
```

- `toolName`：工具名（不含插件前缀）
- `input`：解析后的 JSON 输入对象
- 返回值：任意可 JSON 序列化的值

## 行为约束

### 加载

1. 扫描 `plugins/` 目录下的子文件夹
2. 读取每个子文件夹的 `plugin.json`
3. 验证 `name` 和 `tools` 字段存在
4. 启动时自动加载，管理员操作后通过 `registry.refresh()` 刷新

### 工具注册

1. `getAllTools()`：聚合所有插件的工具定义
2. 工具名自动加前缀：`{pluginName}_{toolName}`
3. 前缀确保多插件间工具名不冲突

### 工具调用

1. `resolveTool(fullName)`：通过前缀查找所属插件和原始工具名
2. `loadPluginModule()`：动态 `import()` 插件模块（`.ts` → `.js` → `.mjs`）
3. 模块导入后缓存到 `moduleCache`
4. 调用 `mod.execute(toolName, input)`

### 上传

1. 管理员通过 `POST /api/admin/plugins/upload` 上传 zip 文件
2. 最大 50MB
3. Zip slip 防护（检查路径中的 `..`）
4. 自动检测包装目录（单层子目录）
5. 清理 macOS 产物（`__MACOSX`、`.DS_Store`）
6. 验证 `plugin.json` 存在且有效
7. 解压到 `plugins/{name}/`

### 卸载

1. `DELETE /api/admin/plugins/:name`
2. 递归删除 `plugins/{name}/` 目录
3. 刷新注册表

## API 端点

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/plugins` | 无 | 列出所有已安装插件及其工具 |
| GET | `/api/plugins/app-name` | 无 | 获取应用名称和 Favicon |
| POST | `/api/plugins/call` | 无 | 手动调用插件工具 |
| GET | `/api/admin/plugins` | JWT | 管理员列出插件 |
| POST | `/api/admin/plugins/upload` | JWT | 上传插件 zip |
| POST | `/api/admin/plugins/install` | JWT | 安装已有目录 |
| DELETE | `/api/admin/plugins/:name` | JWT | 卸载插件 |
