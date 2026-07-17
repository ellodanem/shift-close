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

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function sanitizePdfFilename(label: string): string {
  const base = label.replace(/[^\w.\-() ]+/g, '_').trim() || 'scan'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

export async function fetchScanPdfFile(scan: SelectableScan): Promise<File> {
  // Same-origin proxy avoids CORS when scans live on Vercel Blob.
  const res = await fetch('/api/insights/scans/share/file', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: scan.url,
      date: scan.date,
      label: scan.label
    })
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Could not load ${scan.label}`
    )
  }
  const blob = await res.blob()
  const headerType = res.headers.get('content-type') || ''
  const type =
    headerType.startsWith('image/') || headerType === 'application/pdf'
      ? headerType
      : blob.type && blob.type !== 'application/octet-stream'
        ? blob.type
        : 'application/pdf'
  return new File([blob], sanitizePdfFilename(scan.label), { type })
}

export type WhatsAppShareResult = 'files'

/**
 * Share selected scans as real PDF files via the native share sheet (WhatsApp on phone).
 * Shares files only — no link text — so WhatsApp attaches the PDF instead of a URL.
 */
export async function shareScansViaWhatsApp(
  scans: SelectableScan[],
  _phoneE164?: string | null
): Promise<WhatsAppShareResult> {
  if (scans.length === 0) {
    throw new Error('No scans to share')
  }

  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    throw new Error(
      'This browser cannot attach files to WhatsApp. Open this page in Safari or Chrome on your phone.'
    )
  }

  const files = await Promise.all(scans.map(fetchScanPdfFile))
  const canShare = typeof navigator.canShare === 'function'
  const title =
    scans.length === 1
      ? sanitizePdfFilename(scans[0].label).replace(/\.pdf$/i, '')
      : `${scans.length} scans — Westline`

  // Share files only. Including text/urls makes WhatsApp send links instead of the PDF.
  if (!canShare || navigator.canShare({ files })) {
    await navigator.share({ files, title })
    return 'files'
  }

  if (files.length === 1 && navigator.canShare({ files: [files[0]] })) {
    await navigator.share({ files: [files[0]], title })
    return 'files'
  }

  if (isMobileDevice() && files.length > 1) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: file.name.replace(/\.pdf$/i, '')
        })
      } else {
        throw new Error('This phone cannot share PDF files via WhatsApp from the browser.')
      }
    }
    return 'files'
  }

  throw new Error(
    'This browser cannot attach PDFs to WhatsApp. Open Deposit & debit scans on your phone (Safari or Chrome).'
  )
}

export interface EmailRecipientOption {
  id: string
  label: string
  email: string
  mobileNumber?: string | null
}

/** Prefer a recipient whose label matches the account/customer name. */
export function pickRecipientForAccount(
  recipients: EmailRecipientOption[],
  accountName: string
): string {
  const normalized = accountName.trim().toLowerCase()
  if (!normalized || recipients.length === 0) return 'other'

  const exact = recipients.find(
    (r) => r.label.trim().toLowerCase() === normalized
  )
  if (exact) return exact.id

  const partial = recipients.find((r) => {
    const label = r.label.trim().toLowerCase()
    return label.includes(normalized) || normalized.includes(label)
  })
  if (partial) return partial.id

  return 'other'
}

/** Prefer a recipient labeled like the owner; otherwise first in list. */
export function pickDefaultRecipientId(recipients: EmailRecipientOption[]): string {
  const owner = recipients.find((r) => /owner|elcock/i.test(r.label))
  return owner?.id ?? recipients[0]?.id ?? ''
}
