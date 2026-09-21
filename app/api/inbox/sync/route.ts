import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { isFullAccessRole, isOperationsManagerRole } from '@/lib/roles'
import { syncMailbox } from '@/lib/inbox-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (
    !session ||
    (!isFullAccessRole(session.role) && !isOperationsManagerRole(session.role))
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const mailboxId = typeof body.mailboxId === 'string' ? body.mailboxId.trim() : ''

  const targets = mailboxId
    ? await prisma.inboxMailbox.findMany({ where: { id: mailboxId } })
    : await prisma.inboxMailbox.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } })

  if (targets.length === 0) {
    return NextResponse.json(
      { error: 'No enabled mailboxes. Add IMAP passwords in Settings → Inbox mailboxes.' },
      { status: 400 }
    )
  }

  const results = []
  for (const m of targets) {
    results.push(await syncMailbox(m.id))
  }

  const imported = results.reduce((n, r) => n + r.imported, 0)
  const errors = results.filter((r) => r.error).map((r) => `${r.key}: ${r.error}`)

  return NextResponse.json({
    ok: errors.length === 0,
    imported,
    results,
    errors
  })
}
