import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { api } from '../../lib/api'
import { Upload } from 'lucide-react'
import type { useAdmin } from '../../hooks/useAdmin'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  admin: ReturnType<typeof useAdmin>
}

export function SettingsDialog({ open, onOpenChange, admin }: SettingsDialogProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setKey('')
    }
  }, [open])

  const handleLogin = async () => {
    await admin.login(key)
    setKey('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>
            {admin.authenticated ? t('settings.subtitleAuthenticated') : t('settings.subtitleUnauthenticated')}
          </DialogDescription>
        </DialogHeader>

        {!admin.authenticated ? (
          <div className="space-y-4 pt-4">
            <Input
              type="password"
              placeholder={t('settings.adminKeyPlaceholder')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            {admin.error && <p className="text-sm text-destructive">{admin.error}</p>}
            <Button onClick={handleLogin} className="w-full">
              {t('common.authenticate')}
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="branding" className="mt-4">
            <TabsList className="w-full grid-cols-5">
              <TabsTrigger value="branding">{t('settings.tabBranding')}</TabsTrigger>
              <TabsTrigger value="model">{t('settings.tabModel')}</TabsTrigger>
              <TabsTrigger value="prompt">{t('settings.tabPrompt')}</TabsTrigger>
              <TabsTrigger value="plugins">{t('settings.tabPlugins')}</TabsTrigger>
              <TabsTrigger value="skills">{t('settings.tabSkills')}</TabsTrigger>
            </TabsList>
            <TabsContent value="branding">
              <BrandingSettings token={admin.token!} />
            </TabsContent>
            <TabsContent value="model">
              <ModelSettings token={admin.token!} />
            </TabsContent>
            <TabsContent value="prompt">
              <PromptSettings token={admin.token!} />
            </TabsContent>
            <TabsContent value="plugins">
              <PluginManager token={admin.token!} />
            </TabsContent>
            <TabsContent value="skills">
              <SkillManager token={admin.token!} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Branding Settings ---
function BrandingSettings({ token }: { token: string }) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getConfig(token).then(setConfig).catch(console.error)
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateConfig(token, { app_name: config.app_name, app_favicon: config.app_favicon })
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setConfig({ ...config, app_favicon: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  if (!config) return <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="space-y-4 pt-4">
      <div>
        <label className="text-sm font-medium">{t('settings.appName')}</label>
        <Input
          value={config.app_name || ''}
          onChange={(e) => setConfig({ ...config, app_name: e.target.value })}
          className="mt-1"
          placeholder="Open Agent"
        />
      </div>
      <div>
        <label className="text-sm font-medium">{t('settings.appFavicon')}</label>
        <div className="flex items-center gap-4 mt-1">
          {config.app_favicon ? (
            <img src={config.app_favicon} alt="favicon" className="h-8 w-8 rounded" />
          ) : (
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs">
              默认
            </div>
          )}
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFaviconChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => faviconInputRef.current?.click()}
          >
            {t('settings.uploadFavicon')}
          </Button>
          {config.app_favicon && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig({ ...config, app_favicon: '' })}
            >
              {t('common.remove')}
            </Button>
          )}
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
    </div>
  )
}

// --- Model Settings ---
function ModelSettings({ token }: { token: string }) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig(token).then(setConfig).catch(console.error)
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateConfig(token, config)
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  if (!config) return <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="space-y-4 pt-4">
      <div>
        <label className="text-sm font-medium">{t('settings.apiEndpoint')}</label>
        <Input value={config.api_endpoint || ''} onChange={(e) => setConfig({ ...config, api_endpoint: e.target.value })} className="mt-1" />
      </div>
      <div>
        <label className="text-sm font-medium">{t('settings.apiKey')}</label>
        <Input type="password" value={config.api_key || ''} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} className="mt-1" />
      </div>
      <div>
        <label className="text-sm font-medium">{t('settings.model')}</label>
        <Input value={config.model || ''} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="mt-1" />
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
    </div>
  )
}

// --- Prompt Settings ---
function PromptSettings({ token }: { token: string }) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig(token).then((c) => setPrompt(c.system_prompt)).catch(console.error)
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateConfig(token, { system_prompt: prompt })
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4 pt-4">
      <div>
        <label className="text-sm font-medium">{t('settings.systemPrompt')}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm font-mono"
        />
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
    </div>
  )
}

// --- Plugin Manager ---
function PluginManager({ token }: { token: string }) {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listAdminPlugins(token).then((r) => setPlugins(r.plugins)).catch(console.error)
  }, [token])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const result = await api.uploadPlugin(token, file)
      setPlugins(result.plugins)
    } catch (err: any) {
      setUploadError(err.message)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? t('common.loading') : t('settings.uploadPlugin')}
        </Button>
      </div>
      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      {plugins.length === 0 ? (
        <p className="text-muted-foreground">{t('settings.noPlugins')}</p>
      ) : (
        plugins.map((p) => (
          <div key={p.manifest?.name || p.name} className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <p className="font-medium">{p.manifest?.name || p.name}</p>
              <p className="text-sm text-muted-foreground">{p.manifest?.description || p.description}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={async () => {
              await api.uninstallPlugin(token, p.manifest?.name || p.name)
              const r = await api.listAdminPlugins(token)
              setPlugins(r.plugins)
            }}>
              {t('common.remove')}
            </Button>
          </div>
        ))
      )}
    </div>
  )
}

// --- Skill Manager ---
function SkillManager({ token }: { token: string }) {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listAdminSkills(token).then((r) => setSkills(r.skills)).catch(console.error)
  }, [token])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const result = await api.uploadSkill(token, file)
      setSkills(result.skills)
    } catch (err: any) {
      setUploadError(err.message)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? t('common.loading') : t('settings.uploadSkill')}
        </Button>
      </div>
      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      {skills.length === 0 ? (
        <p className="text-muted-foreground">{t('settings.noSkills')}</p>
      ) : (
        skills.map((s) => (
          <div key={s.manifest?.name || s.name} className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <p className="font-medium">{s.manifest?.name || s.name}</p>
              <p className="text-sm text-muted-foreground">{s.manifest?.description || s.description}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={async () => {
              await api.uninstallSkill(token, s.manifest?.name || s.name)
              const r = await api.listAdminSkills(token)
              setSkills(r.skills)
            }}>
              {t('common.remove')}
            </Button>
          </div>
        ))
      )}
    </div>
  )
}
