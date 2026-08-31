// ============================================================
// Open Agent — Shared Types
// ============================================================

// ---- Conversation & Messages ----

export interface Attachment {
  url: string
  name: string
  size: number
  type: string
}

export interface Conversation {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export interface Message {
  id: number
  conversation_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  thinking?: string | null
  tool_calls?: ToolCall[] | null
  tool_call_id?: string | null
  suggestions?: string[] | null
  attachments?: Attachment[] | null
  created_at: number
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result?: unknown
}

// ---- Config ----

export interface AppConfig {
  app_name: string
  app_favicon: string  // base64 data URL, empty = use default
  app_background: string  // base64 data URL, empty = no custom background
  api_endpoint: string
  api_key: string
  model: string
  system_prompt: string
}

// ---- Plugin ----

export interface PluginManifest {
  name: string
  version: string
  description: string
  tools: ToolDefinition[]
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

export interface InstalledPlugin {
  manifest: PluginManifest
  path: string
}

// ---- Skill ----

export interface SkillManifest {
  name: string
  description: string
  version?: string
}

export interface InstalledSkill {
  manifest: SkillManifest
  content: string
  path: string
}

// ---- SSE Events ----

export type ServerMessage =
  | { type: 'conversation_id'; id: string }
  | { type: 'token'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; summary: string }
  | { type: 'done'; reply: string; suggestions: string[] }
  | { type: 'error'; message: string }

// ---- Admin Auth ----

export interface AdminAuthResponse {
  token: string
  expires_at: number
}

// ---- API Responses ----

export interface PluginListResponse {
  plugins: InstalledPlugin[]
}

export interface SkillListResponse {
  skills: InstalledSkill[]
}
