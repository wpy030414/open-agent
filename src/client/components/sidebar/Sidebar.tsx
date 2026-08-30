import { ScrollArea } from '../ui/scroll-area'
import { Button } from '../ui/button'
import { Plus, MessageSquare, Trash2, Settings, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '@/shared/types'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onMenuClick: () => void
  appName: string
  currentUser: string
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, onMenuClick, appName, currentUser }: SidebarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col h-full w-72 bg-card">
      {/* App name */}
      <div className="flex items-center px-4 border-b" style={{ height: '60px' }}>
        <h1 className="text-lg font-semibold">{appName}</h1>
      </div>

      {/* New chat button */}
      <div className="p-3">
        <Button className="w-full gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" />
          {t('sidebar.newChat')}
        </Button>
      </div>

      {/* Recent label */}
      <div className="px-4 pb-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.recent')}
        </span>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                activeId === conv.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              }`}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-sm truncate">{conv.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">{t('sidebar.noConversations')}</p>
          )}
        </div>
      </ScrollArea>

      {/* Bottom bar — user info + settings */}
      <div className="border-t flex items-center justify-between px-3" style={{ height: '60px' }}>
        <div className="flex items-center gap-2 min-w-0">
          <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="text-sm truncate">{currentUser}</span>
        </div>
        <button
          onClick={onMenuClick}
          className="p-2 rounded-md text-sm hover:bg-accent/50 transition-colors"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}
