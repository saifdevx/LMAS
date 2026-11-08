import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessionInfo } from '../../../shared/api-types'
import { api, storedToken, storeToken } from '../api'

interface AuthContextValue {
  session: SessionInfo | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = storedToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .getSession(token)
      .then((s) => {
        if (s) setSession(s)
        else storeToken(null)
      })
      .catch(() => storeToken(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const s = await api.login(username, password)
    storeToken(s.token)
    setSession(s)
  }, [])

  const logout = useCallback(async () => {
    const token = storedToken()
    if (token) await api.logout(token).catch(() => undefined)
    storeToken(null)
    setSession(null)
  }, [])

  /** Re-read the session (e.g. after changing one's own password). */
  const refreshSession = useCallback(async () => {
    const token = storedToken()
    if (!token) return
    const s = await api.getSession(token).catch(() => null)
    if (s) setSession(s)
  }, [])

  const value = useMemo(
    () => ({ session, loading, login, logout, refreshSession }),
    [session, loading, login, logout, refreshSession]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
