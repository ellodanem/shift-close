import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { isFullAccessRole } from '@/lib/roles'
import {
  ensureDefaultMailboxes,
  mailboxPublic,
  testMailboxConnection
} from '@/lib/inbox-sync'

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
  return NextResponse.json({ mailboxes: mailboxes.map(mailboxPublic) })
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

  if (action === 'test') {
    const id = String(body.id || '')
    const mailbox = id
      ? await prisma.inboxMailbox.findUnique({ where: { id } })
      : null

    const host = String(body.imapHost || mailbox?.imapHost || '').trim()
    const port = Number(body.imapPort ?? mailbox?.imapPort ?? 993)
    const secure = body.imapSecure === undefined ? mailbox?.imapSecure ?? true : Boolean(body.imapSecure)
    const user = String(body.imapUser || mailbox?.imapUser || '').trim()
    let pass = typeof body.imapPass === 'string' ? body.imapPass : ''
    if ((!pass || pass === '********') && mailbox?.imapPass) pass = mailbox.imapPass

    if (!host || !user || !pass) {
      return NextResponse.json({ error: 'Host, user, and password are required to test' }, { status: 400 })
    }

    const result = await testMailboxConnection({
      imapHost: host,
      imapPort: port,
      imapSecure: secure,
      imapUser: user,
      imapPass: pass
    })
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
        imapHost,
        imapPort,
        imapSecure,
        imapUser,
        enabled,
        sortOrder,
        ...(imapPassRaw && imapPassRaw !== '********' ? { imapPass: imapPassRaw } : {})
      }
    })
    return NextResponse.json({ mailbox: mailboxPublic(updated) })
  }

  if (!imapPassRaw || imapPassRaw === '********') {
    return NextResponse.json({ error: 'IMAP password is required for a new mailbox' }, { status: 400 })
  }

  const created = await prisma.inboxMailbox.create({
    data: {
      key,
      label,
      emailAddress,
      imapHost,
      imapPort,
      imapSecure,
      imapUser,
      imapPass: imapPassRaw,
      enabled,
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
