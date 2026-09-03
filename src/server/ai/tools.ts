import type { ToolDefinition } from '../../shared/types.js'

/**
 * Aggregate tool definitions.
 * Currently returns an empty array — the plugin system has been removed.
 * This stub exists so the AI loop can still pass a tools array to the provider.
 */
export function getAllTools(): ToolDefinition[] {
  return []
}
