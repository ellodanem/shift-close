import type { ScanKind } from '@/lib/scans-mobile'

export interface SelectableScan {
  id: string
  date: string
  kind: ScanKind
  url: string
  label: string
}

export function buildScanId(date: string, kind: ScanKind, url: string): string {
  return `${encodeURIComponent(date)}|${kind}|${encodeURIComponent(url)}`
}

export function scanLabelFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    if (last) return decodeURIComponent(last)
  } catch {
    /* ignore */
  }
  const fallback = url.split('/').pop()
  return fallback ? decodeURIComponent(fallback.split('?')[0]) : 'Document'
}

export function formatScanDayHeading(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(d)
}

export function kindLabel(kind: ScanKind): string {
  if (kind === 'debit') return 'Debit'
  if (kind === 'security') return 'Security'
  return 'Deposit'
}

export function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http')) return url
  if (typeof window === 'undefined') return url
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

export function scansFromRow(
  date: string,
  kind: ScanKind,
  urls: string[]
): SelectableScan[] {
  return urls.map((url) => ({
    id: buildScanId(date, kind, url),
    date,
    kind,
    url,
    label: scanLabelFromUrl(url)
  }))
}

export function filterScansByType(scans: SelectableScan[], filter: 'all' | ScanKind): SelectableScan[] {
  if (filter === 'all') return scans
  return scans.filter((s) => s.kind === filter)
}

export function buildWhatsAppScanMessage(scans: SelectableScan[]): string {
  if (scans.length === 0) return ''
  const dates = [...new Set(scans.map((s) => s.date))]
  const datePart =
    dates.length === 1 ? formatScanDayHeading(dates[0]) : `${dates.length} days`
  const kinds = [...new Set(scans.map((s) => s.kind))]
  const typeLabel =
    kinds.length === 1
      ? kinds[0] === 'debit'
        ? 'Debit scan'
        : kinds[0] === 'security'
          ? 'Security scan'
          : 'Deposit scan'
      : 'Scan'
  const header =
    scans.length === 1
      ? `${typeLabel} — ${datePart}`
      : `${typeLabel}s — ${datePart} (${scans.length} files)`

  const lines = scans.map((scan, i) => {
    const abs = toAbsoluteUrl(scan.url)
    if (scans.length === 1) {
      return `${scan.label}\n${abs}`
    }
    return `${i + 1}. ${scan.label}\n   ${abs}`
  })

  return `${header}\n\n${lines.join('\n\n')}\n\n— Westline Shift Close`
}

export function openWhatsAppWithMessage(message: string, phoneE164?: string | null): void {
  const encoded = encodeURIComponent(message)
  const digits = phoneE164?.replace(/[^0-9]/g, '') ?? ''
  if (digits) {
    window.open(`https://wa.me/${digits}?text=${encoded}`, '_blank')
    return
  }
  void navigator.clipboard.writeText(message).then(() => {
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  })
}

export interface EmailRecipientOption {
  id: string
  label: string
  email: string
  mobileNumber?: string | null
}

/** Prefer a recipient labeled like the owner; otherwise first in list. */
export function pickDefaultRecipientId(recipients: EmailRecipientOption[]): string {
  const owner = recipients.find((r) => /owner|elcock/i.test(r.label))
  return owner?.id ?? recipients[0]?.id ?? ''
}
