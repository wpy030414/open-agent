import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import type { Theme } from '../../hooks/useTheme'

interface MenuDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  language: string
  onLanguageChange: (lang: string) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onAdminSettings: () => void
  currentUser: string
  onLogout: () => void
  onChangePin: () => void
}

export function MenuDialog({ open, onOpenChange, language, onLanguageChange, theme, onThemeChange, onAdminSettings, currentUser, onLogout, onChangePin }: MenuDialogProps) {
  const { t, i18n } = useTranslation()

  const handleLanguageChange = (lang: string) => {
    onLanguageChange(lang)
    i18n.changeLanguage(lang)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('menu.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 pt-2">
          {/* User info + change pin + logout */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{t('menu.loggedIn', { username: currentUser })}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => { onOpenChange(false); onChangePin() }}
              >
                {t('menu.changePin')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => { onOpenChange(false); onLogout() }}
              >
                {t('menu.logout')}
              </Button>
            </div>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{t('menu.language')}</span>
            <Tabs value={language} onValueChange={handleLanguageChange}>
              <TabsList className="flex h-7 w-auto gap-0">
                <TabsTrigger value="zh-CN" className="text-xs px-3 h-6">中文</TabsTrigger>
                <TabsTrigger value="en" className="text-xs px-3 h-6">English</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{t('menu.theme')}</span>
            <Tabs value={theme} onValueChange={(v) => onThemeChange(v as Theme)}>
              <TabsList className="flex h-7 w-auto gap-0">
                <TabsTrigger value="light" className="text-xs px-3 h-6">{t('menu.themeLight')}</TabsTrigger>
                <TabsTrigger value="dark" className="text-xs px-3 h-6">{t('menu.themeDark')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Admin Settings */}
          <div className="flex items-center justify-between px-3 py-2.5 mt-2">
            <span className="text-sm">{t('menu.advanced')}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { onOpenChange(false); onAdminSettings() }}
            >
              {t('menu.adminSettings')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
