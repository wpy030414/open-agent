# Spec — 对话管理（Conversation）

## 概述

对话管理模块负责对话的 CRUD 操作，按用户隔离对话数据，支持对话的创建、列表、详情查看、重命名和删除。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/server/routes/conversations.ts` | REST API 路由 |
| `src/server/db.ts` | 数据库连接和迁移 |
| `src/server/schema.ts` | Drizzle ORM 表定义 |

## 接口契约

### 通用要求

所有端点需要 `X-User` 请求头标识用户身份。

### GET /api/conversations

列出当前用户的所有对话（按 `updated_at` 降序）。

**响应**：
```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "对话标题",
      "created_at": 1700000000,
      "updated_at": 1700000100
    }
  ]
}
```

### GET /api/conversations/:id

获取对话详情及其所有消息。

**响应**：
```json
{
  "conversation": { "id": "...", "title": "...", ... },
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "消息内容",
      "thinking": null,
      "tool_calls": null,
      "suggestions": null,
      "created_at": 1700000000
    }
  ]
}
```

**权限**：验证对话属于当前用户，否则 404。

### POST /api/conversations

创建新对话。

**请求**：
```json
{ "title": "可选标题" }
```

**响应**：
```json
{ "id": "生成的UUID", "title": "新对话", "created_at": ..., "updated_at": ... }
```

**默认标题**：`新对话`

### PATCH /api/conversations/:id

重命名对话。

**请求**：
```json
{ "title": "新标题" }
```

**响应**：更新后的对话对象。

**权限**：验证对话属于当前用户，否则 404。

### DELETE /api/conversations/:id

删除对话（级联删除所有消息）。

**响应**：
```json
{ "success": true }
```

**权限**：验证对话属于当前用户，否则 404。

## 数据库 Schema

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL DEFAULT '',       -- 用户名
  title TEXT NOT NULL DEFAULT '新对话',    -- 对话标题
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at);
```

## 行为约束

1. **用户隔离**：所有查询都带 `user_id` 过滤条件
2. **级联删除**：`messages` 表通过 `ON DELETE CASCADE` 外键自动删除关联消息
3. **更新时间**：每次发送消息时更新 `updated_at`（在 `chat.ts` 中处理）
4. **默认标题**：创建对话时使用 `新对话`；聊天时自动取消息前 40 字符作为标题
