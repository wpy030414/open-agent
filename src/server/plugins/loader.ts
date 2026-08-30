import fs from 'fs'
import path from 'path'
import type { PluginManifest, InstalledPlugin } from '../../shared/types.js'

const PLUGINS_DIR = path.resolve('plugins')

export function loadPlugin(pluginDir: string): InstalledPlugin | null {
  const manifestPath = path.join(pluginDir, 'plugin.json')
  if (!fs.existsSync(manifestPath)) return null

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const manifest: PluginManifest = JSON.parse(raw)

    if (!manifest.name || !manifest.tools) {
      console.warn(`Invalid plugin manifest in ${pluginDir}`)
      return null
    }

    return { manifest, path: pluginDir }
  } catch (err) {
    console.error(`Failed to load plugin from ${pluginDir}:`, err)
    return null
  }
}

export function scanPluginsDir(): InstalledPlugin[] {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true })
    return []
  }

  const plugins: InstalledPlugin[] = []
  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const plugin = loadPlugin(path.join(PLUGINS_DIR, entry.name))
    if (plugin) plugins.push(plugin)
  }
  return plugins
}
