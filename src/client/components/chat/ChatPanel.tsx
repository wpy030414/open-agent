import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { PluginBar } from './PluginBar'
import { MessageSquarePlus } from 'lucide-react'
import type { Attachment } from '@/shared/types'

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>
  suggestions?: string[]
  attachments?: Attachment[]
  streaming?: boolean
}

interface ChatPanelProps {
  messages: ChatMessage[]
  loading: boolean
  onSend: (text: string, thinkingMode?: boolean, attachments?: Array<{ url: string; name: string; size: number; type: string }>) => void | Promise<void>
  onCancel: () => void
  onRevert: (index: number) => Promise<string | null>
  onPluginCall?: (pluginName: string, toolName: string, input: Record<string, unknown>) => void
  backgroundImage?: string
  supportAttachments?: boolean
}

export function ChatPanel({ messages, loading, onSend, onCancel, onRevert, onPluginCall, backgroundImage, supportAttachments }: ChatPanelProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [revertedText, setRevertedText] = useState<string>('')
  const [thinkingMode, setThinkingMode] = useState<boolean>(true)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleRevert = async (index: number) => {
    const text = await onRevert(index)
    if (text) {
      setRevertedText(text)
    }
  }

  const handleExternalValueConsumed = () => {
    setRevertedText('')
  }

  const handleSend = (text: string, attachments?: Array<{ url: string; name: string; size: number; type: string }>) => {
    onSend(text, thinkingMode, attachments)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Background image layer */}
      {backgroundImage && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.2,
          }}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 relative z-10">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageSquarePlus className="mx-auto mb-4 h-9 w-9 text-muted-foreground" />
              <p className="text-lg font-medium">{t('chat.startConversation')}</p>
              <p className="text-sm">{t('chat.sendToBegin')}</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} onSuggestion={handleSend} onRevert={handleRevert} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="relative z-10">
        {loading ? (
          <div className="max-w-3xl mx-auto w-full px-4 pb-4">
            <button
              onClick={onCancel}
              className="w-full h-10 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              {t('chat.stopGenerating')}
            </button>
          </div>
        ) : (
          <>
            <div className="max-w-3xl mx-auto w-full px-4 pb-2 flex gap-2">
              <PluginBar onPluginCall={onPluginCall || (() => {})} />
            </div>
            <InputBar
              onSend={handleSend}
              disabled={loading}
              externalValue={revertedText}
              onExternalValueConsumed={handleExternalValueConsumed}
              thinkingMode={thinkingMode}
              onThinkingModeChange={setThinkingMode}
              supportAttachments={supportAttachments}
            />
          </>
        )}
      </div>
    </div>
  )
}
