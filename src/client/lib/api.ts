const BASE = ''

export function getUser(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('user')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const user = getUser()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  }
  if (user) headers['X-User'] = encodeURIComponent(user)

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Conversations
  listConversations: () => request<{ conversations: import('@/shared/types').Conversation[] }>('/api/conversations'),
  getConversation: (id: string) => request<{ conversation: import('@/shared/types').Conversation; messages: import('@/shared/types').Message[] }>(`/api/conversations/${id}`),
  createConversation: (title?: string) => request<{ conversation: import('@/shared/types').Conversation }>('/api/conversations', { method: 'POST', body: JSON.stringify({ title }) }),
  deleteConversation: (id: string) => request<{ success: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),
  renameConversation: (id: string, title: string) => request<{ conversation: import('@/shared/types').Conversation }>(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  revertMessages: (conversationId: string, messageId: number) => request<{ success: boolean }>(`/api/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' }),

  // Plugins
  listPlugins: () => request<{ plugins: Array<{ name: string; version: string; description: string; tools: Array<{ name: string; description: string }> }> }>('/api/plugins'),
  getAppName: () => request<{ app_name: string; app_favicon: string; app_background: string }>('/api/plugins/app-name'),

  // Admin
  adminAuth: (key: string) => request<{ token: string; expires_at: number }>('/api/admin/auth', { method: 'POST', body: JSON.stringify({ key }) }),
  getConfig: (token: string) => request<import('@/shared/types').AppConfig>('/api/admin/config', { headers: { Authorization: `Bearer ${token}` } }),
  updateConfig: (token: string, config: Partial<import('@/shared/types').AppConfig>) => request<import('@/shared/types').AppConfig>('/api/admin/config', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(config) }),
  listAdminPlugins: (token: string) => request<{ plugins: import('@/shared/types').InstalledPlugin[] }>('/api/admin/plugins', { headers: { Authorization: `Bearer ${token}` } }),
  installPlugin: (token: string, name: string) => request('/api/admin/plugins/install', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) }),
  uninstallPlugin: (token: string, name: string) => request(`/api/admin/plugins/${name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  listAdminSkills: (token: string) => request<{ skills: import('@/shared/types').InstalledSkill[] }>('/api/admin/skills', { headers: { Authorization: `Bearer ${token}` } }),
  installSkill: (token: string, name: string) => request('/api/admin/skills/install', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) }),
  uninstallSkill: (token: string, name: string) => request(`/api/admin/skills/${name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),

  // Upload (multipart/form-data — do NOT set Content-Type, let browser set boundary)
  uploadPlugin: (token: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch('/api/admin/plugins/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ success: boolean; plugins: import('@/shared/types').InstalledPlugin[] }>
    })
  },
  uploadSkill: (token: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch('/api/admin/skills/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ success: boolean; skills: import('@/shared/types').InstalledSkill[] }>
    })
  },
}
