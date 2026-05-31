'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { canLogCallOut } from '@/lib/call-outs'
import {
  canEditRoster,
  canManageAppUsers,
  canViewStaffSensitiveFields,
  isFullAccessRole,
  isSupervisorLike,
  normalizeAppRole
} from '@/lib/roles'
import { writeRememberedUsername } from '@/lib/login-device-remember'

/** Sign out automatically after this long with no user activity (mouse, keyboard, scroll, etc.). */
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000

const ACTIVITY_THROTTLE_MS = 1000

/** Skip repeat /api/auth/me within a session navigation (full page load still fetches once). */
const AUTH_ME_TTL_MS = 2 * 60 * 1000

export interface AuthUser {
  id: string
  username: string
  email: string
  firstName?: string | null
  lastName?: string | null
  role: string
  isSuperAdmin: boolean
  /** Per-user post-login path (e.g. /attendance/viewer). */
  homePath?: string | null
  /** From session JWT: user checked "Remember me on this device" at sign-in. */
  rememberDevice?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: (force?: boolean) => Promise<void>
  logout: () => Promise<void>
  canEditRoster: boolean
  canManageUsers: boolean
  canViewStaffSensitive: boolean
  isFullAccess: boolean
  isStakeholder: boolean
  isSupervisorLike: boolean
  canLogCallOut: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const authMeCacheRef = useRef<{ at: number; user: AuthUser | null } | null>(null)

  const refresh = useCallback(async (force?: boolean) => {
    if (
      !force &&
      authMeCacheRef.current &&
      Date.now() - authMeCacheRef.current.at < AUTH_ME_TTL_MS
    ) {
      setUser(authMeCacheRef.current.user)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = await res.json()
      const raw = data.user as AuthUser | null | undefined
      let next: AuthUser | null = null
      if (raw && typeof raw === 'object' && raw.id && raw.username) {
        next = {
          ...raw,
          role: normalizeAppRole(raw.role ?? '')
        }
      }
      authMeCacheRef.current = { at: Date.now(), user: next }
      setUser(next)
    } catch {
      authMeCacheRef.current = { at: Date.now(), user: null }
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const endSession = useCallback(async (reason: 'manual' | 'idle') => {
    await fetch('/api/auth/logout', { method: 'POST' })
    authMeCacheRef.current = null
    setUser(null)
    if (reason === 'manual') {
      writeRememberedUsername(null)
    }
    window.location.href = reason === 'idle' ? '/login?timeout=1' : '/login'
  }, [])

  const logout = useCallback(async () => {
    await endSession('manual')
  }, [endSession])

  useEffect(() => {
    if (!user) return
    // "Remember me" extends the cookie/JWT; skip the strict idle timer so it actually keeps you signed in.
    if (user.rememberDevice) return

    let timeoutId: ReturnType<typeof setTimeout>
    let lastThrottle = 0

    const arm = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        void endSession('idle')
      }, SESSION_IDLE_TIMEOUT_MS)
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastThrottle < ACTIVITY_THROTTLE_MS) return
      lastThrottle = now
      arm()
    }

    arm()
    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel'
    ]
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => {
      clearTimeout(timeoutId)
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [user, endSession])

  const role = user?.role ?? ''
  const value: AuthContextValue = {
    user,
    loading,
    refresh,
    logout,
    canEditRoster: canEditRoster(role),
    canManageUsers: canManageAppUsers(role),
    canViewStaffSensitive: canViewStaffSensitiveFields(role),
    isFullAccess: isFullAccessRole(role),
    isStakeholder: normalizeAppRole(role) === 'stakeholder',
    isSupervisorLike: isSupervisorLike(role),
    canLogCallOut: canLogCallOut(role)
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
