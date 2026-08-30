import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet'
import { Puzzle } from 'lucide-react'

interface Plugin {
  name: string
  description: string
  tools: Array<{
    name: string
    description: string
    input_schema: any
  }>
}

interface PluginBarProps {
  onPluginCall: (pluginName: string, toolName: string, input: Record<string, unknown>) => void
}

export function PluginBar({ onPluginCall }: PluginBarProps) {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    loadPlugins()
  }, [])

  async function loadPlugins() {
    try {
      const res = await fetch('/api/plugins')
      if (res.ok) {
        const data = await res.json()
        setPlugins(data.plugins || [])
      }
    } catch (err) {
      console.error('Failed to load plugins:', err)
    }
  }

  if (plugins.length === 0) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Puzzle className="h-4 w-4" />
          {t('plugins.title')}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{t('plugins.available')}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
          <div className="space-y-4 pr-4">
            {plugins.map((plugin) => (
              <div key={plugin.name} className="border rounded-lg p-4">
                <h3 className="font-semibold mb-2">{plugin.name}</h3>
                <p className="text-sm text-gray-600 mb-3">{plugin.description}</p>
                <div className="space-y-2">
                  {plugin.tools.map((tool) => (
                    <div key={tool.name} className="flex items-center justify-between bg-gray-50 rounded p-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{tool.name}</div>
                        <div className="text-xs text-gray-500">{tool.description}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onPluginCall(plugin.name, tool.name, {})
                          setOpen(false)
                        }}
                      >
                        {t('plugins.call')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
