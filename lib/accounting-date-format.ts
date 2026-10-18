/**
 * Display a date-only accounting value without changing its YYYY-MM-DD storage format.
 * ISO timestamps are supported because some accounting API responses include one.
 */
export function formatAccountingDate(value: string | null | undefined): string {
  if (!value) return '—'

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value

  const [, year, month, day] = match
  return `${day}-${month}-${year}`
}
