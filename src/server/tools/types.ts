// ============================================================
// Tool System — Core Types
// ============================================================

import type { ToolDefinition } from '../../shared/types.js'
import type { SandboxFS } from './workspace.js'

/** Context passed to every tool's execute function */
export interface ToolContext {
  conversationId: string
  userId: string
  workspace: SandboxFS
  signal?: AbortSignal
}

/** Optional artifact: a file produced by a tool, surfaced to the user */
export interface ToolArtifact {
  filename: string      // path within workspace
  displayName: string   // human-friendly name for the download link
  mimeType: string
  downloadUrl: string   // e.g. /api/workspace/{conversationId}/file/{filename}
}

/** What a tool returns after execution */
export interface ToolResult {
  /** Text summary sent back to the LLM */
  summary: string
  /** Optional files produced, surfaced to the user as download links */
  artifacts?: ToolArtifact[]
  /** Optional structured data for the LLM (serialized to JSON) */
  data?: unknown
  /** If true, the tool failed; summary contains the error message */
  error?: boolean
}

/** Shape every tool module must export */
export interface ToolModule {
  definition: ToolDefinition
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}
