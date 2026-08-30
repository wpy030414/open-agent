import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MessageContentProps {
  content: string
}

export function MessageContent({ content }: MessageContentProps) {
  // Split content by mermaid code blocks
  const parts = content.split(/(```mermaid[\s\S]*?```)/g)

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {parts.map((part, idx) => {
        if (part.startsWith('```mermaid')) {
          const chart = part.replace(/```mermaid\n?/, '').replace(/\n?```$/, '')
          return <MermaidBlock key={idx} chart={chart} />
        }
        return <Markdown key={idx} remarkPlugins={[remarkGfm]}>{part}</Markdown>
      })}
    </div>
  )
}

function MermaidBlock({ chart }: { chart: string }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let cancelled = false

    import('mermaid').then(async (m) => {
      if (cancelled) return
      try {
        m.default.initialize({ startOnLoad: false, theme: 'default' })
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
        const { svg: rendered } = await m.default.render(id, chart)
        if (!cancelled) setSvg(rendered)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('chat.renderFailed'))
      }
    })

    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <pre className="text-xs text-destructive bg-muted p-2 rounded overflow-x-auto">
        {chart}
      </pre>
    )
  }

  return (
    <div
      className="mermaid-container"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: svg || t('common.loading') }}
    />
  )
}
