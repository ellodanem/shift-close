/**
 * Canonical public HTTPS base URL (no trailing slash) for ADMS, emails, and server-side fetches.
 * Prefer APP_URL or NEXT_PUBLIC_APP_URL in Vercel env; falls back to VERCEL_URL.
 */
export function normalizePublicAppUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  let u = t.replace(/\/$/, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

export function getPublicAppUrlFromEnv(): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (explicit?.trim()) return normalizePublicAppUrl(explicit)
  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `https://${host}`
  }
  return ''
}
