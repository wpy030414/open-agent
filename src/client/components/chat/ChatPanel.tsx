import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { PluginBar } from './PluginBar'
import { MessageSquarePlus } from 'lucide-react'

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>
  suggestions?: string[]
  streaming?: boolean
}

interface ChatPanelProps {
  messages: ChatMessage[]
  loading: boolean
  onSend: (text: string) => void
  onCancel: () => void
  onPluginCall?: (pluginName: string, toolName: string, input: Record<string, unknown>) => void
}

export function ChatPanel({ messages, loading, onSend, onCancel, onPluginCall }: ChatPanelProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageSquarePlus className="mx-auto mb-4 h-9 w-9 text-muted-foreground" />
              <p className="text-lg font-medium">{t('chat.startConversation')}</p>
              <p className="text-sm">{t('chat.sendToBegin')}</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} onSuggestion={onSend} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
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
          <InputBar onSend={onSend} disabled={loading} />
        </>
      )}
    </div>
  )
}
