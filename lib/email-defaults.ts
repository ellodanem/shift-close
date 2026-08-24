/** Default Gmail mailbox used as the app's sending identity. */
export const DEFAULT_FROM_ADDRESS = 'westline.slu@gmail.com'
export const DEFAULT_FROM_DISPLAY_NAME = 'Westline Enterprise'

/** Archive copy of outbound app mail (except password-reset). */
export const ARCHIVE_BCC_ADDRESS = 'totalarubis@gmail.com'

export function extractEmailAddress(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const angle = trimmed.match(/<([^>]+)>/)
  return (angle ? angle[1] : trimmed).trim().toLowerCase()
}

export function parseEmailList(value?: string): string[] {
  if (!value?.trim()) return []
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function formatFromHeader(from?: string): string {
  const raw = (from ?? '').trim() || DEFAULT_FROM_ADDRESS
  const addr = extractEmailAddress(raw)
  if (addr === DEFAULT_FROM_ADDRESS && !raw.includes('<')) {
    return `"${DEFAULT_FROM_DISPLAY_NAME}" <${DEFAULT_FROM_ADDRESS}>`
  }
  return raw
}

export function mergeArchiveBcc(options: {
  to: string
  cc?: string
  bcc?: string
  omitDefaultBcc?: boolean
}): string | undefined {
  const existing = parseEmailList(options.bcc)
  if (options.omitDefaultBcc) {
    return existing.length ? existing.join(', ') : undefined
  }

  const alreadyHasCopy = [...parseEmailList(options.to), ...parseEmailList(options.cc), ...existing].some(
    (value) => extractEmailAddress(value) === ARCHIVE_BCC_ADDRESS
  )
  if (!alreadyHasCopy) {
    existing.push(ARCHIVE_BCC_ADDRESS)
  }
  return existing.length ? existing.join(', ') : undefined
}
