/** localStorage key for username when user chose "Remember me on this device". */
export const REMEMBER_USERNAME_KEY = 'sc_remember_username'

export function readRememberedUsername(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(REMEMBER_USERNAME_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}

export function writeRememberedUsername(username: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = username?.trim().toLowerCase()
    if (trimmed) {
      localStorage.setItem(REMEMBER_USERNAME_KEY, trimmed)
    } else {
      localStorage.removeItem(REMEMBER_USERNAME_KEY)
    }
  } catch {
    // Private mode / blocked storage — ignore.
  }
}
