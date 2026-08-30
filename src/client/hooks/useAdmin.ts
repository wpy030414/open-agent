import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

export function useAdmin() {
  const { t } = useTranslation()
  const [token, setToken] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async (key: string) => {
    try {
      setError(null)
      const res = await api.adminAuth(key)
      setToken(res.token)
      setAuthenticated(true)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.authFailed'))
      setAuthenticated(false)
      return false
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setAuthenticated(false)
  }, [])

  return { token, authenticated, error, login, logout }
}
