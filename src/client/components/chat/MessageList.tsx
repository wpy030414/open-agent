import { MessageBubble } from './MessageBubble'

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>
  suggestions?: string[]
  streaming?: boolean
}

interface MessageListProps {
  messages: ChatMessage[]
  onSuggestion?: (text: string) => void
  onRevert?: (index: number) => void
}

export function MessageList({ messages, onSuggestion, onRevert }: MessageListProps) {
  // Only the last assistant message shows its suggestion chips — older ones
  // were for a past turn and are meaningless as "what to ask next".
  const lastAssistantIdx = [...messages]
    .reverse()
    .findIndex((m) => m.role === 'assistant')
  const lastAssistantIdxFromEnd =
    lastAssistantIdx === -1 ? -1 : messages.length - 1 - lastAssistantIdx

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id || idx}
          message={msg}
          onSuggestion={onSuggestion}
          showSuggestions={idx === lastAssistantIdxFromEnd}
          onRevert={msg.role === 'user' && msg.id ? () => onRevert?.(idx) : undefined}
        />
      ))}
    </div>
  )
}
