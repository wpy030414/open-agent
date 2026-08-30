import type { ToolDefinition, InstalledPlugin } from '../../shared/types.js'
import { pluginRegistry } from '../plugins/registry.js'

/**
 * Aggregate tool definitions from all installed plugins.
 * Each tool name is prefixed with the plugin name: {plugin}_{tool}
 */
export function getAllTools(): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  for (const plugin of pluginRegistry.getAll()) {
    for (const tool of plugin.manifest.tools) {
      tools.push({
        ...tool,
        name: `${plugin.manifest.name}_${tool.name}`,
      })
    }
  }
  return tools
}

/**
 * Find which plugin owns a given tool name.
 */
export function resolveTool(fullName: string): { plugin: InstalledPlugin; toolName: string } | null {
  for (const plugin of pluginRegistry.getAll()) {
    const prefix = `${plugin.manifest.name}_`
    if (fullName.startsWith(prefix)) {
      const toolName = fullName.slice(prefix.length)
      if (plugin.manifest.tools.some((t) => t.name === toolName)) {
        return { plugin, toolName }
      }
    }
  }
  return null
}
