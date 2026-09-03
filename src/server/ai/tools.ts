import type { ToolDefinition } from '../../shared/types.js'
import { getToolDefinitions } from '../tools/registry.js'

/**
 * Aggregate tool definitions from built-in tool modules.
 */
export function getAllTools(): ToolDefinition[] {
  return getToolDefinitions()
}
