'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { BalanceUpdateModalHost } from './BalanceUpdateModalHost'

type NavContextValue = {
  closeMobileNav: () => void
  registerMobileNavCloser: (fn: () => void) => void
  openBalanceUpdate: () => void
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const mobileCloserRef = useRef<() => void>(() => {})
  const [balanceUpdateOpen, setBalanceUpdateOpen] = useState(false)

  const closeMobileNav = useCallback(() => {
    mobileCloserRef.current()
  }, [])

  const registerMobileNavCloser = useCallback((fn: () => void) => {
    mobileCloserRef.current = fn
  }, [])

  const openBalanceUpdate = useCallback(() => {
    closeMobileNav()
    setBalanceUpdateOpen(true)
  }, [closeMobileNav])

  const value = useMemo(
    () => ({
      closeMobileNav,
      registerMobileNavCloser,
      openBalanceUpdate
    }),
    [closeMobileNav, registerMobileNavCloser, openBalanceUpdate]
  )

  return (
    <NavContext.Provider value={value}>
      {children}
      <BalanceUpdateModalHost open={balanceUpdateOpen} onClose={() => setBalanceUpdateOpen(false)} />
    </NavContext.Provider>
  )
}

export function useNav() {
  const ctx = useContext(NavContext)
  if (!ctx) {
    throw new Error('useNav must be used within NavProvider')
  }
  return ctx
}
