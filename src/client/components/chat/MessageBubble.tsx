import { MessageContent } from './MessageContent'
import { ThinkingBlock } from './ThinkingBlock'
import { User, Bot } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>
  suggestions?: string[]
  streaming?: boolean
}

interface MessageBubbleProps {
  message: ChatMessage
  onSuggestion?: (text: string) => void
  /** Only the last assistant message should show its suggestion chips */
  showSuggestions?: boolean
}

export function MessageBubble({ message, onSuggestion, showSuggestions }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary'
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        {/* Thinking block */}
        {message.thinking && <ThinkingBlock content={message.thinking} done={!message.streaming} />}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tc, idx) => (
              <div key={idx} className="text-xs bg-muted rounded-md px-3 py-1.5">
                <span className="font-medium">🔧 {tc.name}</span>
                {tc.result && <span className="text-muted-foreground ml-2">→ {tc.result}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Message content */}
        <div className={`inline-block rounded-lg px-4 py-2 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-card border'
        }`}>
          {message.streaming && !message.content ? (
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <MessageContent content={message.content} />
          )}
        </div>

        {/* Suggestions — only on the last assistant message */}
        {showSuggestions && message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.suggestions.map((s, idx) => (
              <button
                key={idx}
                className="suggestion-chip"
                onClick={() => onSuggestion?.(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
