import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
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
}

export function MenuDialog({ open, onOpenChange, language, onLanguageChange, theme, onThemeChange, onAdminSettings, currentUser, onLogout }: MenuDialogProps) {
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
          {/* User info + logout */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{currentUser}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { onOpenChange(false); onLogout() }}
            >
              {t('menu.logout')}
            </Button>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{t('menu.language')}</span>
            <div className="flex gap-1">
              <Button
                variant={language === 'zh-CN' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleLanguageChange('zh-CN')}
              >
                中文
              </Button>
              <Button
                variant={language === 'en' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleLanguageChange('en')}
              >
                English
              </Button>
            </div>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{t('menu.theme')}</span>
            <div className="flex gap-1">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onThemeChange('light')}
              >
                {t('menu.themeLight')}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onThemeChange('dark')}
              >
                {t('menu.themeDark')}
              </Button>
            </div>
          </div>

          {/* Admin Settings */}
          <div className="flex items-center justify-between px-3 py-2.5 mt-2">
            <span className="text-sm">{t('menu.adminSettings')}</span>
            <button
              onClick={() => { onOpenChange(false); onAdminSettings() }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('menu.adminSettingsDesc')} &rarr;
            </button>
          </div>

          {/* About */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">{t('menu.about')}</span>
            <a
              href="https://github.com/wpy030414/open-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub &rarr;
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
