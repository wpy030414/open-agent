import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface LoginScreenProps {
  onLogin: (username: string) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed) onLogin(trimmed)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-sm p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{t('login.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoFocus
            placeholder={t('login.usernamePlaceholder')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e) }}
          />
          <Button type="submit" className="w-full" disabled={!username.trim()}>
            {t('login.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}
