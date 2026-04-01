import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { getSessionFromRequest } from '@/lib/session'
import {
  buildComparisonRowsFromShifts,
  parseUrlList,
  type ComparisonRow,
  type ShiftWithDepositRecords
} from '@/lib/deposit-comparison-rows'

export const dynamic = 'force-dynamic'

const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024
const MAX_FILES = 20

function filenameFromUrl(url: string, index: number): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    if (last) {
      return decodeURIComponent(last)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120)
    }
  } catch {
    /* ignore */
  }
  return `attachment-${index + 1}`
}

async function fetchAttachment(
  url: string,
  index: number
): Promise<{ filename: string; content: Buffer; contentType?: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return null
    let filename = filenameFromUrl(url, index)
    const cd = res.headers.get('content-disposition')
    if (cd) {
      const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd)
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1].replace(/"/g, '')).slice(0, 120)
        } catch {
          filename = m[1].replace(/"/g, '').slice(0, 120)
        }
      }
    }
    const ct = res.headers.get('content-type') || undefined
    return { filename, content: buf, contentType: ct }
  } catch {
    return null
  }
}

/** URLs to attach: deposit discrepancies → all deposit scans for the day + security slips; debit → Other Items scans only; both → union (deduped). */
function collectAttachmentUrls(
  shifts: ShiftWithDepositRecords[],
  rows: ComparisonRow[],
  hasDepDisc: boolean,
  hasDebitDisc: boolean
): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const add = (u: string) => {
    const t = u.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  if (hasDepDisc) {
    for (const s of shifts) {
      for (const u of parseUrlList(s.depositScanUrls)) add(u)
    }
    for (const r of rows) {
      if (r.recordKind === 'deposit' && r.securitySlipUrl) add(r.securitySlipUrl)
    }
  }
  if (hasDebitDisc) {
    for (const s of shifts) {
      for (const u of parseUrlList(s.debitScanUrls)) add(u)
    }
    // When both deposit and Other Items have discrepancies, include security slip on the day debit row if present.
    if (hasDepDisc) {
      for (const r of rows) {
        if (r.recordKind === 'debit' && r.securitySlipUrl) add(r.securitySlipUrl)
      }
    }
  }

  return out
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const date = typeof body.date === 'string' ? body.date.trim() : ''
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const cc = typeof body.cc === 'string' ? body.cc.trim() : ''
    const subjectIn = typeof body.subject === 'string' ? body.subject.trim() : ''
    const text = typeof body.text === 'string' ? body.text : ''

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })
    }
    if (!to) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!text.trim()) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    const shifts = await prisma.shiftClose.findMany({
      where: { date, status: { in: ['closed', 'reviewed'] } },
      include: { depositRecords: true },
      orderBy: [{ shift: 'asc' }]
    })

    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts for this date' }, { status: 404 })
    }

    const rows = buildComparisonRowsFromShifts(shifts as ShiftWithDepositRecords[])
    const disc = rows.filter((r) => r.bankStatus === 'discrepancy')
    if (disc.length === 0) {
      return NextResponse.json({ error: 'No discrepancy rows for this date' }, { status: 400 })
    }

    const hasDepDisc = disc.some((r) => r.recordKind === 'deposit')
    const hasDebitDisc = disc.some((r) => r.recordKind === 'debit')

    const urls = collectAttachmentUrls(shifts as ShiftWithDepositRecords[], rows, hasDepDisc, hasDebitDisc)

    const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = []
    const usedNames = new Set<string>()
    let totalBytes = 0
    let fetchIndex = 0
    for (const url of urls) {
      if (attachments.length >= MAX_FILES) break
      const att = await fetchAttachment(url, fetchIndex)
      fetchIndex += 1
      if (!att) continue
      if (totalBytes + att.content.length > MAX_ATTACHMENT_BYTES) break
      let fname = att.filename
      let n = 1
      while (usedNames.has(fname)) {
        const dot = fname.lastIndexOf('.')
        const base = dot > 0 ? fname.slice(0, dot) : fname
        const ext = dot > 0 ? fname.slice(dot) : ''
        fname = `${base}-${n}${ext}`
        n += 1
      }
      usedNames.add(fname)
      attachments.push({ ...att, filename: fname })
      totalBytes += att.content.length
    }

    const heading = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const defaultSubject = `Bank reconciliation discrepancies — ${heading}`
    const subject = subjectIn || defaultSubject

    const html = `<pre style="font-family: system-ui, sans-serif; white-space: pre-wrap;">${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>`

    await sendMail({
      to,
      cc: cc || undefined,
      subject,
      text,
      html,
      attachments: attachments.length > 0 ? attachments : undefined
    })

    return NextResponse.json({
      success: true,
      attachmentCount: attachments.length,
      urlsAttempted: urls.length
    })
  } catch (e) {
    console.error('discrepancy-email', e)
    const err = e as { message?: string }
    return NextResponse.json({ error: err?.message || 'Failed to send email' }, { status: 500 })
  }
}
