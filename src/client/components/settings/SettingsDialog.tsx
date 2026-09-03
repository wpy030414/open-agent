import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { api } from '../../lib/api'
import { Upload, Eye, EyeOff } from 'lucide-react'
import { Switch } from '../ui/switch'
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
              <TabsTrigger value="skills">{t('settings.tabSkills')}</TabsTrigger>
              <TabsTrigger value="stats">{t('settings.tabStats')}</TabsTrigger>
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
            <TabsContent value="skills">
              <SkillManager token={admin.token!} />
            </TabsContent>
            <TabsContent value="stats">
              <StatsPanel token={admin.token!} />
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
  const backgroundInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getConfig(token).then(setConfig).catch(console.error)
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateConfig(token, {
        app_name: config.app_name,
        app_favicon: config.app_favicon,
        app_background: config.app_background,
        show_github: config.show_github,
      })
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

  const handleBackgroundChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setConfig({ ...config, app_background: reader.result as string })
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
      <div>
        <label className="text-sm font-medium">{t('settings.appBackground')}</label>
        <div className="flex items-center gap-4 mt-1">
          {config.app_background ? (
            <div
              className="h-12 w-12 rounded border"
              style={{
                backgroundImage: `url(${config.app_background})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          ) : (
            <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-xs">
              无
            </div>
          )}
          <input
            ref={backgroundInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBackgroundChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => backgroundInputRef.current?.click()}
          >
            {t('settings.uploadBackground')}
          </Button>
          {config.app_background && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig({ ...config, app_background: '' })}
            >
              {t('common.remove')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('settings.showGithub')}</label>
        <Switch
          checked={config.show_github !== false}
          onCheckedChange={(v) => setConfig({ ...config, show_github: v })}
        />
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
  const [showApiKey, setShowApiKey] = useState(false)

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
        <div className="relative mt-1">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={config.api_key || ''}
            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">{t('settings.model')}</label>
        <Input value={config.model || ''} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="mt-1" />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('settings.supportAttachments')}</label>
        <Switch
          checked={!!config.support_attachments}
          onCheckedChange={(v) => setConfig({ ...config, support_attachments: v })}
        />
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

// --- Statistics Panel ---
function StatsPanel({ token }: { token: string }) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<{ total_users: number; total_conversations: number; total_messages: number } | null>(null)
  const [conversations, setConversations] = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null)
  const [expandedMessages, setExpandedMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const pageSize = 10

  useEffect(() => {
    api.getAdminStats(token).then(setStats).catch(console.error)
    api.getAdminConversations(token).then((r) => setConversations(r.conversations)).catch(console.error)
  }, [token])

  const formatTime = (ts: number) => {
    if (!ts) return '-'
    return new Date(ts * 1000).toLocaleString()
  }

  const handleRowClick = async (convId: string) => {
    if (expandedConvId === convId) {
      setExpandedConvId(null)
      setExpandedMessages([])
      return
    }

    setExpandedConvId(convId)
    setLoadingMessages(true)
    try {
      const data = await api.getAdminConversationMessages(token, convId)
      setExpandedMessages(data.messages)
    } catch (err) {
      console.error(err)
      setExpandedMessages([])
    }
    setLoadingMessages(false)
  }

  if (!stats) return <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>

  const totalPages = Math.ceil(conversations.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedConversations = conversations.slice(startIndex, endIndex)

  return (
    <div className="space-y-6 pt-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('settings.statsTotalUsers')}</p>
          <p className="text-2xl font-bold mt-1">{stats.total_users}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('settings.statsTotalConversations')}</p>
          <p className="text-2xl font-bold mt-1">{stats.total_conversations}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t('settings.statsTotalMessages')}</p>
          <p className="text-2xl font-bold mt-1">{stats.total_messages}</p>
        </div>
      </div>

      {/* Conversations table with pagination */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t('settings.statsAllConversations')}</h3>
        {conversations.length === 0 ? (
          <p className="text-muted-foreground">{t('settings.statsNoConversations')}</p>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{t('settings.statsUser')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('settings.statsTitle')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('settings.statsMessages')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('settings.statsUpdated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedConversations.map((conv) => (
                    <>
                      <tr
                        key={conv.id}
                        className={`border-t cursor-pointer hover:bg-muted/30 transition-colors ${
                          expandedConvId === conv.id ? 'bg-muted/50' : ''
                        }`}
                        onClick={() => handleRowClick(conv.id)}
                      >
                        <td className="px-3 py-2">{conv.user_id || '-'}</td>
                        <td className="px-3 py-2 truncate max-w-[200px]">{conv.title}</td>
                        <td className="px-3 py-2 text-right">{conv.message_count}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatTime(conv.updated_at)}</td>
                      </tr>
                      {expandedConvId === conv.id && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 bg-muted/20">
                            {loadingMessages ? (
                              <div className="text-center text-muted-foreground py-4">{t('common.loading')}</div>
                            ) : expandedMessages.length === 0 ? (
                              <p className="text-center text-muted-foreground py-4">No messages</p>
                            ) : (
                              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                {expandedMessages.map((msg) => (
                                  <div key={msg.id} className="rounded-md border bg-background p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-muted-foreground uppercase">
                                        {msg.role}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatTime(msg.created_at)}
                                      </span>
                                    </div>
                                    <div className="text-sm whitespace-pre-wrap break-words">
                                      {msg.content || '(empty)'}
                                    </div>
                                    {msg.thinking && (
                                      <details className="mt-2">
                                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                          Thinking
                                        </summary>
                                        <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                                          {msg.thinking}
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {startIndex + 1}-{Math.min(endIndex, conversations.length)} / {conversations.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => {
                      setCurrentPage(currentPage - 1)
                      setExpandedConvId(null)
                    }}
                  >
                    上一页
                  </Button>
                  <span className="flex items-center px-3 text-sm">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => {
                      setCurrentPage(currentPage + 1)
                      setExpandedConvId(null)
                    }}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
