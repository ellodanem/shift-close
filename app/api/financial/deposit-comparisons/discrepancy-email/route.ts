import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail, getSmtpConfig } from '@/lib/email'
import { getSessionFromRequest } from '@/lib/session'
import {
  collectDiscrepancyAttachmentUrls,
  filenameHintFromUrl,
  labelAttachmentUrls
} from '@/lib/deposit-comparison-attachments'
import {
  buildComparisonRowsFromShifts,
  type ShiftWithDepositRecords
} from '@/lib/deposit-comparison-rows'

export const dynamic = 'force-dynamic'

const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024
const MAX_FILES = 20
const FETCH_TIMEOUT_MS = 20_000

const DEFAULT_FINANCE_TO_KEY = 'financial_discrepancy_email_default_to'

async function fetchAttachment(
  url: string,
  index: number
): Promise<{ filename: string; content: Buffer; contentType?: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return null
    let filename = filenameHintFromUrl(url, index)
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

function formatHeadingDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

async function loadDayPayload(date: string) {
  const shifts = await prisma.shiftClose.findMany({
    where: { date, status: { in: ['closed', 'reviewed'] } },
    include: { depositRecords: true },
    orderBy: [{ shift: 'asc' }]
  })
  const rows = buildComparisonRowsFromShifts(shifts as ShiftWithDepositRecords[])
  const disc = rows.filter((r) => r.bankStatus === 'discrepancy')
  const hasDepDisc = disc.some((r) => r.recordKind === 'deposit')
  const hasDebitDisc = disc.some((r) => r.recordKind === 'debit')
  const urls =
    disc.length > 0
      ? collectDiscrepancyAttachmentUrls(shifts as ShiftWithDepositRecords[], rows, hasDepDisc, hasDebitDisc)
      : []
  return { shifts, rows, disc, hasDepDisc, hasDebitDisc, urls }
}

/** GET — meta only, or ?date=YYYY-MM-DD for attachment plan + defaults (auth). */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const smtpConfigured = (await getSmtpConfig()) !== null
    const defaultRow = await prisma.appSettings.findUnique({ where: { key: DEFAULT_FINANCE_TO_KEY } })
    const defaultTo = (defaultRow?.value ?? '').trim() || null

    const { searchParams } = new URL(request.url)
    const date = typeof searchParams.get('date') === 'string' ? searchParams.get('date')!.trim() : ''

    if (!date) {
      return NextResponse.json({ smtpConfigured, defaultTo })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }

    const { shifts, disc, urls } = await loadDayPayload(date)
    if (shifts.length === 0) {
      return NextResponse.json({
        smtpConfigured,
        defaultTo,
        hasDiscrepancy: false,
        attachments: [],
        defaultSubject: null,
        message: 'No shifts for this date'
      })
    }

    const hasDiscrepancy = disc.length > 0
    const attachments = hasDiscrepancy ? labelAttachmentUrls(urls) : []
    const defaultSubject = `Discrepancies — ${formatHeadingDate(date)}`

    return NextResponse.json({
      smtpConfigured,
      defaultTo,
      hasDiscrepancy,
      attachments,
      defaultSubject,
      urlsAttempted: urls.length
    })
  } catch (e) {
    console.error('discrepancy-email GET', e)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
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
    const excludeUrlsRaw = body.excludeUrls
    const excludeSet = new Set<string>()
    if (Array.isArray(excludeUrlsRaw)) {
      for (const u of excludeUrlsRaw) {
        if (typeof u === 'string' && u.trim()) excludeSet.add(u.trim())
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })
    }
    if (!to) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!text.trim()) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    const { shifts, disc, urls: allUrls } = await loadDayPayload(date)

    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts for this date' }, { status: 404 })
    }
    if (disc.length === 0) {
      return NextResponse.json({ error: 'No discrepancy rows for this date' }, { status: 400 })
    }

    const allowed = new Set(allUrls)
    for (const u of excludeSet) {
      if (!allowed.has(u)) {
        return NextResponse.json({ error: 'Invalid attachment exclusion (unknown URL).' }, { status: 400 })
      }
    }

    const urls = allUrls.filter((u) => !excludeSet.has(u))
    let fetchFailed = 0

    const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = []
    const usedNames = new Set<string>()
    let totalBytes = 0
    let fetchIndex = 0
    for (const url of urls) {
      if (attachments.length >= MAX_FILES) break
      const att = await fetchAttachment(url, fetchIndex)
      fetchIndex += 1
      if (!att) {
        fetchFailed += 1
        continue
      }
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

    const heading = formatHeadingDate(date)
    const defaultSubject = `Discrepancies — ${heading}`
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
      urlsAttempted: allUrls.length,
      excludedCount: excludeSet.size,
      fetchFailed
    })
  } catch (e) {
    console.error('discrepancy-email', e)
    const err = e as { message?: string }
    return NextResponse.json({ error: err?.message || 'Failed to send email' }, { status: 500 })
  }
}
