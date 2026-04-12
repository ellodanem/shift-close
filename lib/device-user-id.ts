/**
 * ZKTeco terminals often send zero-padded numeric user IDs in ATTLOG (e.g. "0007")
 * while Staff.deviceUserId may be stored as "7". Match and group using these variants.
 */

export function deviceUserIdLookupKeys(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  const keys = new Set<string>([t])
  if (/^\d+$/.test(t)) {
    keys.add(t.replace(/^0+/, '') || '0')
  }
  return [...keys]
}

/** Same person same calendar day when ids differ only by leading zeros. */
export function deviceUserIdForGrouping(raw: string): string {
  const t = raw.trim()
  if (/^\d+$/.test(t)) return t.replace(/^0+/, '') || '0'
  return t
}

export function expandDeviceUserIdsForDbMatch(ids: string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    for (const k of deviceUserIdLookupKeys(id)) out.add(k)
  }
  return [...out]
}
