import type { InstalledPlugin } from '../../shared/types.js'
import { scanPluginsDir } from './loader.js'

class PluginRegistryClass {
  private plugins: Map<string, InstalledPlugin> = new Map()

  constructor() {
    this.refresh()
  }

  refresh(): void {
    this.plugins.clear()
    for (const plugin of scanPluginsDir()) {
      this.plugins.set(plugin.manifest.name, plugin)
    }
  }

  get(name: string): InstalledPlugin | undefined {
    return this.plugins.get(name)
  }

  getAll(): InstalledPlugin[] {
    return [...this.plugins.values()]
  }

  remove(name: string): boolean {
    return this.plugins.delete(name)
  }
}

export const pluginRegistry = new PluginRegistryClass()
