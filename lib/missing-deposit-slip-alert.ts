import type { ShiftClose } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/format'
import { getPublicAppUrlFromEnv } from '@/lib/public-url'
import { parseRecipientEmails } from '@/lib/eod-email'

export const MISSING_DEPOSIT_SLIP_EMAIL_ENABLED_KEY = 'missing_deposit_slip_email_enabled'
export const MISSING_DEPOSIT_SLIP_EMAIL_RECIPIENTS_KEY = 'missing_deposit_slip_email_recipients'
export const MISSING_DEPOSIT_SLIP_DIGEST_ENABLED_KEY = 'missing_deposit_slip_digest_enabled'

export type DepositSlipSelection = {
  shiftId: string
  lineIndex: number
  amount: number
}

export type DepositSlipSelectionRow = DepositSlipSelection & {
  shift: string
  supervisor: string
  depositLabel: string
}

const AMOUNT_EPS = 0.02

export function parseSelectionsJson(raw: string): DepositSlipSelection[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr
      .map((x) => ({
        shiftId: String(x?.shiftId ?? ''),
        lineIndex: Number(x?.lineIndex),
        amount: Number(x?.amount)
      }))
      .filter((x) => x.shiftId && Number.isFinite(x.lineIndex) && x.lineIndex >= 0 && Number.isFinite(x.amount))
  } catch {
    return []
  }
}

export function validateSelections(
  shifts: Pick<ShiftClose, 'id' | 'deposits' | 'shift' | 'supervisor'>[],
  selections: DepositSlipSelection[]
): { ok: true; rows: DepositSlipSelectionRow[] } | { ok: false; error: string } {
  const byId = new Map(shifts.map((s) => [s.id, s]))
  const rows: DepositSlipSelectionRow[] = []
  const seen = new Set<string>()
  for (const sel of selections) {
    const key = `${sel.shiftId}:${sel.lineIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    const shift = byId.get(sel.shiftId)
    if (!shift) return { ok: false, error: `Unknown shift for selection` }
    let deposits: number[] = []
    try {
      deposits = JSON.parse(shift.deposits || '[]')
      if (!Array.isArray(deposits)) deposits = []
    } catch {
      deposits = []
    }
    const line = deposits[sel.lineIndex]
    if (line === undefined) return { ok: false, error: `Invalid deposit line for ${shift.shift}` }
    if (line <= 0) return { ok: false, error: `Deposit line must be positive` }
    if (Math.abs(line - sel.amount) > AMOUNT_EPS) {
      return { ok: false, error: `Amount mismatch for ${shift.shift} deposit ${sel.lineIndex + 1}` }
    }
    rows.push({
      ...sel,
      shift: shift.shift,
      supervisor: shift.supervisor,
      depositLabel: `Deposit ${sel.lineIndex + 1}`
    })
  }
  return { ok: true, rows }
}

export function selectionFingerprint(selections: DepositSlipSelection[], note: string): string {
  const sorted = [...selections].sort(
    (a, b) => a.shiftId.localeCompare(b.shiftId) || a.lineIndex - b.lineIndex || a.amount - b.amount
  )
  return JSON.stringify({ s: sorted, n: note.trim() })
}

export function buildMissingDepositSlipEmailHtml(params: {
  date: string
  rows: DepositSlipSelectionRow[]
  note: string
}): string {
  const baseUrl = getPublicAppUrlFromEnv()
  const daysLink = baseUrl
    ? `<p><a href="${baseUrl.replace(/\/$/, '')}/days">Open End of Day (Shift Close)</a> — expand <strong>${params.date}</strong> to upload scans.</p>`
    : ''
  const list = params.rows
    .map(
      (r) =>
        `<li><strong>${r.shift}</strong> (${escapeHtml(r.supervisor)}) — ${escapeHtml(r.depositLabel)}: <strong>${formatCurrency(r.amount)}</strong></li>`
    )
    .join('')
  const noteBlock =
    params.note.trim().length > 0
      ? `<p style="margin-top:12px"><strong>Note:</strong> ${escapeHtml(params.note.trim())}</p>`
      : ''
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:16px">
  <h2 style="color:#111">Missing deposit slip scan — ${escapeHtml(params.date)}</h2>
  <p>The following deposit amount(s) are flagged as missing a scanned slip:</p>
  <ul style="margin:12px 0;padding-left:20px">${list}</ul>
  ${noteBlock}
  ${daysLink}
  <p style="color:#666;font-size:12px;margin-top:24px">Automated message from Shift Close.</p>
</body></html>`.trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildMissingDepositSlipDigestHtml(
  items: { date: string; rows: DepositSlipSelectionRow[]; note: string }[]
): string {
  const baseUrl = getPublicAppUrlFromEnv()
  const daysLink = baseUrl
    ? `<p><a href="${baseUrl.replace(/\/$/, '')}/days">Open End of Day (Shift Close)</a></p>`
    : ''
  const blocks = items
    .map((it) => {
      const list = it.rows
        .map(
          (r) =>
            `<li><strong>${r.shift}</strong> (${escapeHtml(r.supervisor)}) — ${escapeHtml(r.depositLabel)}: <strong>${formatCurrency(r.amount)}</strong></li>`
        )
        .join('')
      const note =
        it.note.trim().length > 0
          ? `<p style="margin:4px 0 0 0;font-size:14px"><em>${escapeHtml(it.note.trim())}</em></p>`
          : ''
      return `<section style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee">
  <h3 style="font-size:16px;margin:0 0 8px 0">${escapeHtml(it.date)}</h3>
  <ul style="margin:0;padding-left:20px">${list}</ul>
  ${note}
</section>`
    })
    .join('')
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:16px">
  <h2 style="color:#111">Reminder: open missing deposit slip flag(s)</h2>
  <p>The following calendar day(s) still have an open &ldquo;missing deposit scan&rdquo; alert:</p>
  ${blocks}
  ${daysLink}
  <p style="color:#666;font-size:12px;margin-top:24px">Daily digest from Shift Close (deposit slip alerts).</p>
</body></html>`.trim()
}

export async function getMissingDepositSlipRecipients(): Promise<string[]> {
  const row = await prisma.appSettings.findUnique({ where: { key: MISSING_DEPOSIT_SLIP_EMAIL_RECIPIENTS_KEY } })
  return parseRecipientEmails(row?.value ?? '')
}

export async function isMissingDepositSlipEmailEnabled(): Promise<boolean> {
  const row = await prisma.appSettings.findUnique({ where: { key: MISSING_DEPOSIT_SLIP_EMAIL_ENABLED_KEY } })
  return row?.value === 'true'
}

export async function isMissingDepositSlipDigestEnabled(): Promise<boolean> {
  const row = await prisma.appSettings.findUnique({ where: { key: MISSING_DEPOSIT_SLIP_DIGEST_ENABLED_KEY } })
  return row?.value !== 'false'
}

/** Calendar YYYY-MM-DD for `d` in the given IANA timezone. */
export function dateToYmdInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

export function getTodayYmdInZone(timeZone: string): string {
  return dateToYmdInZone(new Date(), timeZone)
}
