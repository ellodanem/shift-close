'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type NavContextValue = {
  pickerGroup: string | null
  openPickerGroup: (label: string) => void
  closePickerGroup: () => void
  closeMobileNav: () => void
  registerMobileNavCloser: (fn: () => void) => void
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [pickerGroup, setPickerGroup] = useState<string | null>(null)
  const mobileCloserRef = useRef<() => void>(() => {})

  const openPickerGroup = useCallback((label: string) => {
    setPickerGroup(label)
  }, [])

  const closePickerGroup = useCallback(() => {
    setPickerGroup(null)
  }, [])

  const closeMobileNav = useCallback(() => {
    mobileCloserRef.current()
  }, [])

  const registerMobileNavCloser = useCallback((fn: () => void) => {
    mobileCloserRef.current = fn
  }, [])

  const value = useMemo(
    () => ({
      pickerGroup,
      openPickerGroup,
      closePickerGroup,
      closeMobileNav,
      registerMobileNavCloser
    }),
    [pickerGroup, openPickerGroup, closePickerGroup, closeMobileNav, registerMobileNavCloser]
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
