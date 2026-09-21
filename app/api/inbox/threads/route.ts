import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { formatAttachmentSize } from '@/lib/inbox-sync'

export const dynamic = 'force-dynamic'

type Person = { name: string; email: string }

function parsePeople(json: string): Person[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function relativeWhen(d: Date): string {
  const now = Date.now()
  const diff = now - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (diff < day && new Date(d).toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (diff < 2 * day) return 'Yesterday'
  if (diff < 7 * day) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mailboxCount = await prisma.inboxMailbox.count()
  const enabledCount = await prisma.inboxMailbox.count({ where: { enabled: true } })
  const threadCount = await prisma.inboxThread.count()

  const queue = request.nextUrl.searchParams.get('queue') || 'open'
  const mailboxKey = request.nextUrl.searchParams.get('mailbox') || 'all'
  const search = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

  const where: Record<string, unknown> = {}
  if (queue === 'open') where.status = { not: 'done' }
  else if (queue === 'waiting') where.status = 'waiting'
  else if (queue === 'done') where.status = 'done'
  else if (queue === 'mine') {
    where.status = { not: 'done' }
  }

  if (mailboxKey !== 'all') {
    where.mailbox = { key: mailboxKey }
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { snippet: { contains: search, mode: 'insensitive' } },
      { fromName: { contains: search, mode: 'insensitive' } },
      { fromEmail: { contains: search, mode: 'insensitive' } },
      { topic: { contains: search, mode: 'insensitive' } }
    ]
  }

  const threads = await prisma.inboxThread.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    include: {
      mailbox: { select: { id: true, key: true, label: true, emailAddress: true } },
      messages: {
        orderBy: { sentAt: 'asc' },
        include: { attachments: true }
      }
    }
  })

  const openCount = await prisma.inboxThread.count({ where: { status: { not: 'done' } } })

  return NextResponse.json({
    source: threadCount > 0 ? 'live' : 'empty',
    mailboxCount,
    enabledCount,
    openCount,
    threads: threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      mailboxId: t.mailbox.key,
      mailboxLabel: `${t.mailbox.label} · ${t.mailbox.emailAddress.split('@')[0]}`,
      topic: t.topic,
      status: t.status,
      assignee: t.assignee,
      unread: t.unread,
      preview: t.snippet,
      when: relativeWhen(t.lastMessageAt),
      lastMessageAt: t.lastMessageAt.toISOString(),
      messages: t.messages.map((m) => ({
        id: m.id,
        from: { name: m.fromName, email: m.fromEmail },
        to: parsePeople(m.toJson),
        cc: parsePeople(m.ccJson),
        sentAt: m.sentAt.toLocaleString(),
        body: m.bodyText,
        attachments: m.attachments.map((a) => ({
          id: a.id,
          name: a.filename,
          sizeLabel: formatAttachmentSize(a.size),
          contentType: a.contentType,
          url: a.blobUrl || `/api/inbox/attachments/${a.id}`
        }))
      }))
    }))
  })
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: { status?: string; assignee?: string | null; unread?: boolean } = {}
  if (typeof body.status === 'string') data.status = body.status
  if (body.assignee !== undefined) data.assignee = body.assignee
  if (typeof body.unread === 'boolean') data.unread = body.unread

  const updated = await prisma.inboxThread.update({ where: { id }, data })
  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    assignee: updated.assignee,
    unread: updated.unread
  })
}
