import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'

interface InputBarProps {
  onSend: (text: string) => void
  disabled?: boolean
  /** External value to pre-fill the textarea (e.g. after revert) */
  externalValue?: string
  onExternalValueConsumed?: () => void
}

export function InputBar({ onSend, disabled, externalValue, onExternalValueConsumed }: InputBarProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // When externalValue changes, fill the textarea and focus it
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== '') {
      setText(externalValue)
      onExternalValueConsumed?.()
      // Auto-resize
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
          textareaRef.current.focus()
        }
      })
    }
  }, [externalValue, onExternalValueConsumed])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }

  const hasText = text.trim().length > 0

  return (
    <div className="max-w-3xl mx-auto w-full px-4 pb-4">
      <div className="relative rounded-xl border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring transition-shadow">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={t('chat.inputPlaceholder')}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50 max-h-[200px] pr-10"
        />
        {hasText && (
          <button
            onClick={handleSend}
            disabled={disabled}
            className="absolute right-2 bottom-2 w-7 h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
