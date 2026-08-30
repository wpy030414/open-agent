# Spec — 管理员系统（Admin）

## 概述

管理员系统提供密钥认证、JWT Token 管理和全局配置管理能力。所有配置变更通过管理员 API 持久化到 SQLite。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/server/auth.ts` | JWT 签名/验证 + 密钥校验 + 认证中间件 |
| `src/server/config.ts` | 环境变量读取 + DB 配置读写 |
| `src/server/routes/admin.ts` | 管理员 REST API |

## 认证流程

```
管理员输入密钥
  → POST /api/admin/auth { key: "..." }
  → verifyAdminKey() 比对 env.ADMIN_KEY
  → signAdminToken() 签发 JWT (HS256, 24h)
  → 返回 { token, expires_at }

后续请求
  → Authorization: Bearer <jwt>
  → adminAuthMiddleware 验证 JWT
  → 通过则继续处理
```

## 接口契约

### POST /api/admin/auth

验证管理员密钥，返回 JWT。

**请求**：
```json
{ "key": "管理员密钥" }
```

**响应**：
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "expires_at": 1700086400
}
```

**错误**：密钥错误返回 401 `{ "error": "Invalid key" }`。

### GET /api/admin/config（需 JWT）

获取当前配置（API Key 脱敏显示）。

**响应**：
```json
{
  "app_name": "Open Agent",
  "app_favicon": "",
  "api_endpoint": "https://api.openai.com/v1",
  "api_key": "***1234",
  "model": "gpt-4o",
  "system_prompt": "You are a helpful assistant."
}
```

**脱敏规则**：`***` + API Key 最后 4 个字符。

### PUT /api/admin/config（需 JWT）

更新配置（部分更新）。

**请求**：
```json
{
  "app_name": "我的助手",
  "model": "gpt-4o-mini",
  "system_prompt": "你是一个友好的助手"
}
```

**响应**：更新后的完整配置对象。

**行为**：只更新请求中提供的字段（`undefined` 值跳过）。

## 配置层级

```
优先级（高 → 低）：
  1. SQLite settings 表（运行时可修改）
  2. .env 环境变量（启动时读取，不可热更新）
  3. 代码中的默认值（constants.ts）
```

### 配置字段

| 字段 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `app_name` | — | `Open Agent` | 应用名称 |
| `app_favicon` | — | `""`（空=默认） | Base64 data URL |
| `api_endpoint` | `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API 地址 |
| `api_key` | `OPENAI_API_KEY` | `""` | API 密钥 |
| `model` | `OPENAI_MODEL` | `gpt-4o` | 模型名称 |
| `system_prompt` | — | `""`（空） | 系统提示词 |

## JWT 实现细节

- **算法**：HS256
- **签名密钥**：`ADMIN_KEY` 的 UTF-8 编码字节
- **Payload**：`{ role: "admin" }`
- **有效期**：24 小时
- **回退密钥**：如果 `ADMIN_KEY` 为空，使用 `"fallback-secret"`（不推荐）

## 安全约束

1. `ADMIN_KEY` 永远不通过 API 返回给前端
2. `getConfig()` 返回时对 `api_key` 进行脱敏
3. 受保护路由：`/api/admin/config`、`/api/admin/plugins/*`、`/api/admin/skills/*`
4. 空密钥不被视为有效（`verifyAdminKey` 检查 `key !== ''`）
