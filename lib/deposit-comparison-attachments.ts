import {
  parseUrlList,
  type ComparisonRow,
  type ShiftWithDepositRecords
} from '@/lib/deposit-comparison-rows'

/**
 * URLs to attach for discrepancy email: deposit discrepancies → all deposit scans for the day +
 * security slips on deposit lines; Other Items discrepancies → debit scans + security on the day row.
 * When both apply, union and dedupe by URL (order: deposit scans, deposit security, debit scans, debit security).
 */
export function collectDiscrepancyAttachmentUrls(
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
    for (const r of rows) {
      if (r.recordKind === 'debit' && r.securitySlipUrl) add(r.securitySlipUrl)
    }
  }

  return out
}

export function filenameHintFromUrl(url: string, index: number): string {
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

export function labelAttachmentUrls(urls: string[]): Array<{ url: string; label: string }> {
  const used = new Map<string, number>()
  return urls.map((url, i) => {
    const base = filenameHintFromUrl(url, i)
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    const label = n > 1 ? `${base} (${n})` : base
    return { url, label }
  })
}
