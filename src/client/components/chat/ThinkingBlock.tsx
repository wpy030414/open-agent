import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible'
import { ChevronRight } from 'lucide-react'

interface ThinkingBlockProps {
  content: string
  /** true = thinking already finished (label "thought"), false = still streaming */
  done?: boolean
}

export function ThinkingBlock({ content, done }: ThinkingBlockProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span>{done ? t('chat.thought') : t('chat.thinking')}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto max-h-60 overflow-y-auto">
          {content}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
