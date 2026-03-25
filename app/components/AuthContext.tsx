'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { canEditRoster, canManageAppUsers, canViewStaffSensitiveFields } from '@/lib/roles'

export interface AuthUser {
  id: string
  username: string
  email: string
  role: string
  isSuperAdmin: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  canEditRoster: boolean
  canManageUsers: boolean
  canViewStaffSensitive: boolean
  isFullAccess: boolean
  isStakeholder: boolean
  isSupervisorLike: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = await res.json()
      setUser(data.user ?? null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    window.location.href = '/login'
  }, [])

  const role = user?.role ?? ''
  const value: AuthContextValue = {
    user,
    loading,
    refresh,
    logout,
    canEditRoster: canEditRoster(role),
    canManageUsers: canManageAppUsers(role),
    canViewStaffSensitive: canViewStaffSensitiveFields(role),
    isFullAccess: role === 'admin' || role === 'manager',
    isStakeholder: role === 'stakeholder',
    isSupervisorLike: role === 'supervisor' || role === 'senior_supervisor'
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
