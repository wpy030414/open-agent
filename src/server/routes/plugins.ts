import { Hono } from 'hono'
import { pluginRegistry } from '../plugins/registry.js'
import { executeTool } from '../plugins/executor.js'
import { getConfig } from '../config.js'

export const pluginsRoute = new Hono()

// Public: get app name and favicon for white-label branding
pluginsRoute.get('/app-name', async (c) => {
  const config = await getConfig()
  return c.json({ app_name: config.app_name, app_favicon: config.app_favicon })
})

// List available plugins (public — no auth needed for browsing)
pluginsRoute.get('/', (c) => {
  const plugins = pluginRegistry.getAll().map((p) => ({
    name: p.manifest.name,
    version: p.manifest.version,
    description: p.manifest.description,
    tools: p.manifest.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
  }))
  return c.json({ plugins })
})

// Call a plugin tool directly (for manual invocation from PluginBar)
pluginsRoute.post('/call', async (c) => {
  const { plugin, tool, input } = await c.req.json<{
    plugin: string
    tool: string
    input: Record<string, unknown>
  }>()

  if (!plugin || !tool) {
    return c.json({ error: 'plugin and tool are required' }, 400)
  }

  try {
    const fullName = `${plugin}_${tool}`
    const result = await executeTool(fullName, input || {})
    return c.json({ success: true, result })
  } catch (err) {
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : 'Plugin call failed',
    }, 500)
  }
})
