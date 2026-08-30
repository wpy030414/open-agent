import path from 'path'
import { pathToFileURL } from 'url'
import { resolveTool } from '../ai/tools.js'

// Cache of imported plugin modules
const moduleCache = new Map<string, { execute: (toolName: string, input: Record<string, unknown>) => Promise<unknown> }>()

async function loadPluginModule(pluginPath: string, pluginName: string) {
  const key = pluginName
  if (moduleCache.has(key)) return moduleCache.get(key)!

  // Try index.ts or index.js
  for (const ext of ['.ts', '.js', '.mjs']) {
    const indexPath = path.join(pluginPath, `index${ext}`)
    try {
      const mod = await import(pathToFileURL(indexPath).href)
      if (typeof mod.execute === 'function') {
        moduleCache.set(key, mod)
        return mod
      }
    } catch {
      // Try next extension
    }
  }

  throw new Error(`Plugin "${pluginName}" has no valid execute function in index.ts/index.js`)
}

export async function executeTool(fullName: string, input: Record<string, unknown>): Promise<unknown> {
  const resolved = resolveTool(fullName)
  if (!resolved) {
    throw new Error(`Unknown tool: ${fullName}`)
  }

  const { plugin, toolName } = resolved
  const mod = await loadPluginModule(plugin.path, plugin.manifest.name)
  return mod.execute(toolName, input)
}
