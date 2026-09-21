/**
 * Microsoft Modern Auth for Outlook.com IMAP.
 * Per https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040
 * Outlook.com requires OAuth2 — password/app-password IMAP login is disabled.
 *
 * Set Vercel env: MICROSOFT_IMAP_CLIENT_ID (Azure App Registration, public client).
 * Optional: MICROSOFT_IMAP_TENANT (default "consumers"), MICROSOFT_IMAP_CLIENT_SECRET (not needed for device code).
 */

const DEFAULT_TENANT = 'consumers'
const SCOPES = [
  'offline_access',
  'openid',
  'email',
  'profile',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send'
].join(' ')

export function microsoftImapConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_IMAP_CLIENT_ID?.trim())
}

function clientId(): string {
  const id = process.env.MICROSOFT_IMAP_CLIENT_ID?.trim()
  if (!id) {
    throw new Error(
      'MICROSOFT_IMAP_CLIENT_ID is not set. Create an Azure App Registration (personal Microsoft accounts, Allow public client flows = Yes) and add the Client ID in Vercel env.'
    )
  }
  return id
}

function tenant(): string {
  return process.env.MICROSOFT_IMAP_TENANT?.trim() || DEFAULT_TENANT
}

function tokenUrl(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`
}

function deviceCodeUrl(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/devicecode`
}

export type DeviceCodeStart = {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
  interval: number
  message: string
}

export async function startMicrosoftDeviceCode(): Promise<DeviceCodeStart> {
  const body = new URLSearchParams({
    client_id: clientId(),
    scope: SCOPES
  })
  const res = await fetch(deviceCodeUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(String(data.error_description || data.error || 'Failed to start Microsoft sign-in'))
  }
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri),
    verificationUriComplete: data.verification_uri_complete
      ? String(data.verification_uri_complete)
      : undefined,
    expiresIn: Number(data.expires_in || 900),
    interval: Number(data.interval || 5),
    message: String(data.message || 'Sign in with Microsoft')
  }
}

export type MicrosoftTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  email?: string
}

export async function pollMicrosoftDeviceCode(deviceCode: string): Promise<
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'complete'; tokens: MicrosoftTokens }
  | { status: 'error'; error: string }
> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: clientId(),
    device_code: deviceCode
  })
  const secret = process.env.MICROSOFT_IMAP_CLIENT_SECRET?.trim()
  if (secret) body.set('client_secret', secret)

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const data = (await res.json()) as Record<string, unknown>
  if (res.ok && data.access_token) {
    const expiresIn = Number(data.expires_in || 3600)
    return {
      status: 'complete',
      tokens: {
        accessToken: String(data.access_token),
        refreshToken: String(data.refresh_token || ''),
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        email: await fetchMicrosoftEmail(String(data.access_token)).catch(() => undefined)
      }
    }
  }

  const err = String(data.error || '')
  if (err === 'authorization_pending') return { status: 'pending' }
  if (err === 'slow_down') return { status: 'slow_down' }
  if (err === 'expired_token') return { status: 'error', error: 'Sign-in timed out. Start again.' }
  if (err === 'access_denied') return { status: 'error', error: 'Sign-in was cancelled.' }
  return {
    status: 'error',
    error: String(data.error_description || data.error || 'Microsoft sign-in failed')
  }
}

async function fetchMicrosoftEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) return undefined
  const data = (await res.json()) as { mail?: string; userPrincipalName?: string }
  return (data.mail || data.userPrincipalName || '').trim().toLowerCase() || undefined
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<MicrosoftTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId(),
    refresh_token: refreshToken,
    scope: SCOPES
  })
  const secret = process.env.MICROSOFT_IMAP_CLIENT_SECRET?.trim()
  if (secret) body.set('client_secret', secret)

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || !data.access_token) {
    throw new Error(String(data.error_description || data.error || 'Token refresh failed'))
  }
  const expiresIn = Number(data.expires_in || 3600)
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token || refreshToken),
    expiresAt: new Date(Date.now() + expiresIn * 1000)
  }
}

export function isOutlookLikeEmail(email: string): boolean {
  const e = email.toLowerCase()
  return (
    e.endsWith('@outlook.com') ||
    e.endsWith('@hotmail.com') ||
    e.endsWith('@live.com') ||
    e.endsWith('@msn.com')
  )
}
