import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { isFullAccessRole } from '@/lib/roles'
import {
  ensureDefaultMailboxes,
  mailboxPublic,
  testMailboxConnection
} from '@/lib/inbox-sync'
import {
  microsoftImapConfigured,
  pollMicrosoftDeviceCode,
  startMicrosoftDeviceCode,
  isOutlookLikeEmail
} from '@/lib/microsoft-oauth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireManager(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !isFullAccessRole(session.role)) {
    return null
  }
  return session
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureDefaultMailboxes()
  const mailboxes = await prisma.inboxMailbox.findMany({ orderBy: { sortOrder: 'asc' } })
  return NextResponse.json({
    mailboxes: mailboxes.map(mailboxPublic),
    microsoftConfigured: microsoftImapConfigured()
  })
}

export async function POST(request: NextRequest) {
  if (!(await requireManager(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const action = typeof body.action === 'string' ? body.action : 'upsert'

  if (action === 'ensureDefaults') {
    const created = await ensureDefaultMailboxes()
    const mailboxes = await prisma.inboxMailbox.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ created, mailboxes: mailboxes.map(mailboxPublic) })
  }

  if (action === 'microsoftStart') {
    const id = String(body.id || '')
    const mailbox = await prisma.inboxMailbox.findUnique({ where: { id } })
    if (!mailbox) return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    try {
      const started = await startMicrosoftDeviceCode()
      return NextResponse.json({
        mailboxId: mailbox.id,
        ...started
      })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to start Microsoft sign-in' },
        { status: 400 }
      )
    }
  }

  if (action === 'microsoftPoll') {
    const id = String(body.id || '')
    const deviceCode = String(body.deviceCode || '')
    if (!id || !deviceCode) {
      return NextResponse.json({ error: 'id and deviceCode required' }, { status: 400 })
    }
    const mailbox = await prisma.inboxMailbox.findUnique({ where: { id } })
    if (!mailbox) return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })

    const result = await pollMicrosoftDeviceCode(deviceCode)
    if (result.status === 'pending' || result.status === 'slow_down') {
      return NextResponse.json({ status: result.status })
    }
    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', error: result.error }, { status: 400 })
    }

    const email = (result.tokens.email || mailbox.emailAddress).toLowerCase()
    const updated = await prisma.inboxMailbox.update({
      where: { id },
      data: {
        authMethod: 'oauth',
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        imapSecure: true,
        imapUser: email,
        emailAddress: email,
        oauthAccessToken: result.tokens.accessToken,
        oauthRefreshToken: result.tokens.refreshToken || mailbox.oauthRefreshToken,
        oauthExpiresAt: result.tokens.expiresAt,
        enabled: true,
        lastSyncError: null
      }
    })

    const test = await testMailboxConnection(updated)
    return NextResponse.json({
      status: 'complete',
      mailbox: mailboxPublic(updated),
      test
    })
  }

  if (action === 'test') {
    const id = String(body.id || '')
    const mailbox = id ? await prisma.inboxMailbox.findUnique({ where: { id } }) : null
    if (!mailbox) {
      return NextResponse.json({ error: 'Save the mailbox first, then test.' }, { status: 400 })
    }

    // Apply in-form host overrides for password mailboxes before test
    if (mailbox.authMethod !== 'oauth') {
      const host = String(body.imapHost || mailbox.imapHost).trim()
      const port = Number(body.imapPort ?? mailbox.imapPort)
      const secure =
        body.imapSecure === undefined ? mailbox.imapSecure : Boolean(body.imapSecure)
      const user = String(body.imapUser || mailbox.imapUser).trim()
      let pass = typeof body.imapPass === 'string' ? body.imapPass : ''
      if ((!pass || pass === '********') && mailbox.imapPass) pass = mailbox.imapPass

      const merged = {
        ...mailbox,
        imapHost: host,
        imapPort: port,
        imapSecure: secure,
        imapUser: user,
        imapPass: pass
      }
      if (isOutlookLikeEmail(merged.emailAddress) && merged.authMethod !== 'oauth') {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Outlook.com requires Modern Auth (OAuth2). Use Sign in with Microsoft — passwords are disabled by Microsoft.'
          },
          { status: 400 }
        )
      }
      const result = await testMailboxConnection(merged)
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
      }
      return NextResponse.json({ ok: true, folders: result.folders })
    }

    const result = await testMailboxConnection(mailbox)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, folders: result.folders })
  }

  // upsert mailbox
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const key = String(body.key || '').trim().toLowerCase().replace(/\s+/g, '_')
  const label = String(body.label || '').trim()
  const emailAddress = String(body.emailAddress || '').trim().toLowerCase()
  const imapHost = String(body.imapHost || '').trim()
  const imapPort = Number(body.imapPort || 993)
  const imapSecure = body.imapSecure !== false
  const imapUser = String(body.imapUser || emailAddress).trim()
  const imapPassRaw = typeof body.imapPass === 'string' ? body.imapPass : undefined
  const enabled = Boolean(body.enabled)
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0
  const authMethod =
    body.authMethod === 'oauth' || isOutlookLikeEmail(emailAddress) ? 'oauth' : 'password'

  if (!key || !label || !emailAddress || !imapHost || !imapUser) {
    return NextResponse.json(
      { error: 'key, label, emailAddress, imapHost, and imapUser are required' },
      { status: 400 }
    )
  }

  if (id) {
    const existing = await prisma.inboxMailbox.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const updated = await prisma.inboxMailbox.update({
      where: { id },
      data: {
        key,
        label,
        emailAddress,
        imapHost: authMethod === 'oauth' ? 'outlook.office365.com' : imapHost,
        imapPort: authMethod === 'oauth' ? 993 : imapPort,
        imapSecure: authMethod === 'oauth' ? true : imapSecure,
        imapUser,
        authMethod,
        enabled,
        sortOrder,
        ...(imapPassRaw && imapPassRaw !== '********' && authMethod === 'password'
          ? { imapPass: imapPassRaw }
          : {})
      }
    })
    return NextResponse.json({ mailbox: mailboxPublic(updated) })
  }

  if (authMethod === 'password' && (!imapPassRaw || imapPassRaw === '********')) {
    return NextResponse.json({ error: 'IMAP password is required for a new mailbox' }, { status: 400 })
  }

  const created = await prisma.inboxMailbox.create({
    data: {
      key,
      label,
      emailAddress,
      imapHost: authMethod === 'oauth' ? 'outlook.office365.com' : imapHost,
      imapPort: authMethod === 'oauth' ? 993 : imapPort,
      imapSecure: authMethod === 'oauth' ? true : imapSecure,
      imapUser,
      imapPass: authMethod === 'password' ? imapPassRaw || '' : '',
      authMethod,
      enabled: authMethod === 'oauth' ? false : enabled,
      sortOrder
    }
  })
  return NextResponse.json({ mailbox: mailboxPublic(created) })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireManager(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await prisma.inboxMailbox.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (typeof body.label === 'string') data.label = body.label.trim()
  if (typeof body.emailAddress === 'string') data.emailAddress = body.emailAddress.trim().toLowerCase()
  if (typeof body.imapHost === 'string') data.imapHost = body.imapHost.trim()
  if (body.imapPort !== undefined) data.imapPort = Number(body.imapPort)
  if (typeof body.imapSecure === 'boolean') data.imapSecure = body.imapSecure
  if (typeof body.imapUser === 'string') data.imapUser = body.imapUser.trim()
  if (typeof body.imapPass === 'string' && body.imapPass && body.imapPass !== '********') {
    data.imapPass = body.imapPass
  }
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder)

  if (existing.authMethod === 'oauth' || isOutlookLikeEmail(existing.emailAddress)) {
    data.authMethod = 'oauth'
    data.imapHost = 'outlook.office365.com'
    data.imapPort = 993
    data.imapSecure = true
    if (body.enabled === true && !existing.oauthRefreshToken && !existing.oauthAccessToken) {
      return NextResponse.json(
        { error: 'Sign in with Microsoft before enabling this Outlook mailbox.' },
        { status: 400 }
      )
    }
  }

  const updated = await prisma.inboxMailbox.update({ where: { id }, data })
  return NextResponse.json({ mailbox: mailboxPublic(updated) })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireManager(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.inboxMailbox.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
