import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canAccessInsightsPages } from '@/lib/roles'
import { sendMail } from '@/lib/email'

export const dynamic = 'force-dynamic'

type ScanKind = 'deposit' | 'debit' | 'security'

interface IncomingScan {
  id?: string
  date?: string
  kind?: ScanKind
  url?: string
  label?: string
}

function parseRecipientList(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessInsightsPages(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { to?: string; scans?: IncomingScan[] }
  try {
    body = (await request.json()) as { to?: string; scans?: IncomingScan[] }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const recipients = parseRecipientList(body.to)
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
  }
  if (recipients.some((email) => !isLikelyEmail(email))) {
    return NextResponse.json({ error: 'One or more email addresses are invalid' }, { status: 400 })
  }

  const scans = Array.isArray(body.scans) ? body.scans : []
  if (scans.length === 0) {
    return NextResponse.json({ error: 'Select at least one scan' }, { status: 400 })
  }
  if (scans.length > 50) {
    return NextResponse.json({ error: 'Please send at most 50 scans at once' }, { status: 400 })
  }

  const normalizedScans = scans
    .map((scan) => ({
      date: safeString(scan.date),
      kind: scan.kind === 'debit' || scan.kind === 'security' ? scan.kind : 'deposit',
      url: safeString(scan.url),
      label: safeString(scan.label) || 'Scan'
    }))
    .filter((scan) => !!scan.url)

  if (normalizedScans.length === 0) {
    return NextResponse.json({ error: 'No valid scans selected' }, { status: 400 })
  }

  const dates = [...new Set(normalizedScans.map((scan) => scan.date).filter(Boolean))]
  if (dates.length === 0) {
    return NextResponse.json({ error: 'Missing scan dates' }, { status: 400 })
  }

  const shiftRows = await prisma.shiftClose.findMany({
    where: { date: { in: dates } },
    select: { depositScanUrls: true, debitScanUrls: true, securityScanUrls: true }
  })

  const knownUrls = new Set<string>()
  for (const row of shiftRows) {
    try {
      const depositUrls = JSON.parse(row.depositScanUrls || '[]')
      if (Array.isArray(depositUrls)) {
        for (const u of depositUrls) {
          if (typeof u === 'string' && u.trim()) knownUrls.add(u.trim())
        }
      }
    } catch {
      // Ignore malformed JSON
    }
    try {
      const debitUrls = JSON.parse(row.debitScanUrls || '[]')
      if (Array.isArray(debitUrls)) {
        for (const u of debitUrls) {
          if (typeof u === 'string' && u.trim()) knownUrls.add(u.trim())
        }
      }
    } catch {
      // Ignore malformed JSON
    }
    try {
      const securityUrls = JSON.parse(row.securityScanUrls || '[]')
      if (Array.isArray(securityUrls)) {
        for (const u of securityUrls) {
          if (typeof u === 'string' && u.trim()) knownUrls.add(u.trim())
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  const unknown = normalizedScans.find((scan) => !knownUrls.has(scan.url))
  if (unknown) {
    return NextResponse.json({ error: 'One or more selected scans are no longer available' }, { status: 400 })
  }

  const subject = `Deposit & debit scans (${normalizedScans.length})`
  const lines = normalizedScans
    .map((scan, index) => {
      const typeLabel = scan.kind === 'debit' ? 'Debit' : scan.kind === 'security' ? 'Security' : 'Deposit'
      return `${index + 1}. [${scan.date}] ${typeLabel} - ${scan.label}\n${scan.url}`
    })
    .join('\n\n')
  const text = `Shared scans:\n\n${lines}`
  const htmlItems = normalizedScans
    .map((scan) => {
      const typeLabel = scan.kind === 'debit' ? 'Debit' : scan.kind === 'security' ? 'Security' : 'Deposit'
      const safeLabel = scan.label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const safeUrl = scan.url.replace(/"/g, '&quot;')
      return `<li><strong>[${scan.date}] ${typeLabel}</strong> - ${safeLabel}<br/><a href="${safeUrl}">${safeLabel}</a></li>`
    })
    .join('')
  const html = `<p>Shared scans:</p><ol>${htmlItems}</ol>`

  await sendMail({
    to: recipients.join(', '),
    subject,
    text,
    html
  })

  return NextResponse.json({
    ok: true,
    sent: normalizedScans.length,
    recipients: recipients.length
  })
}
