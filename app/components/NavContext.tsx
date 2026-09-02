'use client'

import { createContext, useCallback, useContext, useMemo, useRef } from 'react'

type NavContextValue = {
  closeMobileNav: () => void
  registerMobileNavCloser: (fn: () => void) => void
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const mobileCloserRef = useRef<() => void>(() => {})

  const closeMobileNav = useCallback(() => {
    mobileCloserRef.current()
  }, [])

  const registerMobileNavCloser = useCallback((fn: () => void) => {
    mobileCloserRef.current = fn
  }, [])

  const value = useMemo(
    () => ({
      closeMobileNav,
      registerMobileNavCloser
    }),
    [closeMobileNav, registerMobileNavCloser]
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav() {
  const ctx = useContext(NavContext)
  if (!ctx) {
    throw new Error('useNav must be used within NavProvider')
  }
  return ctx
}
