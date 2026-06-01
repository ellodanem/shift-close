export function staffDisplayLabel(s: {
  staffName: string
  staffFirstName?: string | null
  name?: string
  firstName?: string | null
}): string {
  const fn = (s.staffFirstName ?? s.firstName)?.trim()
  if (fn) return fn
  return s.staffName ?? s.name ?? 'Staff'
}
